/* Run all model work outside the UI thread. Single-thread WASM works on Pages. */
importScripts('./vendor/ort.wasm.min.js');
ort.env.wasm.wasmPaths=new URL('./vendor/',self.location.href).href;
ort.env.wasm.numThreads=1;
const sessions=new Map();
async function session(file){
  if(!sessions.has(file)){
    postMessage({type:'status',message:'正在加载模型，首次使用需要下载，请稍候…'});
    sessions.set(file,await ort.InferenceSession.create(new URL('./models/'+file,self.location.href).href,{executionProviders:['wasm']}));
  }
  return sessions.get(file);
}
function reflect(i,n){while(i<0||i>=n)i=i<0?-i-1:2*n-i-1;return i;}
function gaussian(input,sigma,n=192){
  const radius=Math.floor(4*sigma+.5),kernel=[];let sum=0;
  for(let i=-radius;i<=radius;i++){const w=Math.exp(-.5*(i/sigma)**2);kernel.push(w);sum+=w;}
  for(let i=0;i<kernel.length;i++)kernel[i]/=sum;
  const temp=new Float32Array(n*n),out=new Float32Array(n*n);
  // scipy filters axis 0 then 1, storing float32 after each axis.
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){let v=0;for(let k=-radius;k<=radius;k++)v+=input[reflect(y+k,n)*n+x]*kernel[k+radius];temp[y*n+x]=v;}
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){let v=0;for(let k=-radius;k<=radius;k++)v+=temp[y*n+reflect(x+k,n)]*kernel[k+radius];out[y*n+x]=v;}
  return out;
}
self.onmessage=async event=>{
  try{
    const {category,method,config,pixels}=event.data;
    const input=new Float32Array(3*192*192);
    for(let i=0;i<192*192;i++)for(let c=0;c<3;c++)input[c*192*192+i]=pixels[i*4+c]/255;
    const model=await session(config.file);
    let features;
    if(method!=='autoencoder')features=await session('features.onnx');
    postMessage({type:'status',message:'模型已就绪，正在检测…'});
    const start=performance.now();
    const tensor=new ort.Tensor('float32',input,[1,3,192,192]);
    let map;
    if(method==='autoencoder'){
      const output=(await model.run({image:tensor})).reconstruction.data;
      const error=new Float32Array(192*192);
      for(let i=0;i<error.length;i++){let v=0;for(let c=0;c<3;c++){const d=output[c*error.length+i]-input[c*error.length+i];v+=d*d;}error[i]=v/3;}
      map=gaussian(error,2);
    }else{
      const output=await features.run({image:tensor});
      const distances=(await model.run({features:output.features})).distances.data;
      map=gaussian(distances,4);
    }
    let score;
    if(method==='autoencoder'){
      const sorted=Array.from(map).sort((a,b)=>b-a),count=Math.max(1,Math.floor(map.length*.01));
      score=sorted.slice(0,count).reduce((a,b)=>a+b,0)/count;
    }else{score=map.reduce((a,b)=>Math.max(a,b),-Infinity);}
    postMessage({type:'result',category,method,score,map,elapsed:performance.now()-start},[map.buffer]);
  }catch(error){postMessage({type:'error',message:'检测未完成：'+error.message+'。请检查网络或换用较新的浏览器。'});}
};
