const $=id=>document.getElementById(id);
const worker=new Worker('./worker.js');
const manifest=await fetch('./manifest.json').then(r=>{if(!r.ok)throw Error('无法读取演示资料');return r.json();});
let currentImage=null,busy=false;
const names={bottle:'瓶子',tile:'瓷砖',metal_nut:'金属螺母'};
function status(text){$('status').textContent=text;}
function reset(){
  $('decision').className='decision neutral';$('decision').textContent='图片已准备好，点击「开始检测」';
  for(const id of ['score','threshold','latency'])$(id).textContent='—';
  for(const id of ['heatmap','overlay'])$(id).getContext('2d').clearRect(0,0,192,192);
}
function lock(value){busy=value;for(const id of ['run','category','method','sample','file'])$(id).disabled=value;}
async function bitmap(source){
  const image=await createImageBitmap(source);
  if(image.width*image.height>20000000){image.close();throw Error('图片分辨率过大，请使用 2000 万像素以内的图片');}
  return image;
}
// Match Pillow's separable, antialiased BILINEAR downsampling and uint8 rounding.
function coefficients(input,output){
  const scale=input/output,filter=Math.max(scale,1),support=filter;
  return Array.from({length:output},(_,i)=>{
    const center=(i+.5)*scale,start=Math.max(0,Math.floor(center-support+.5)),end=Math.min(input,Math.floor(center+support+.5));
    const weights=[];let sum=0;
    for(let j=start;j<end;j++){const w=Math.max(0,1-Math.abs((j-center+.5)/filter));weights.push(w);sum+=w;}
    return {start,weights:weights.map(w=>Math.floor(w/sum*4194304+.5))};
  });
}
function resizePillow(rgba,width,height){
  if(width===192&&height===192)return new Uint8ClampedArray(rgba);
  const cx=coefficients(width,192),cy=coefficients(height,192);
  const tmp=new Uint8ClampedArray(192*height*4),out=new Uint8ClampedArray(192*192*4);
  for(let y=0;y<height;y++)for(let x=0;x<192;x++){
    const {start,weights}=cx[x];
    for(let c=0;c<3;c++){let v=2097152;for(let k=0;k<weights.length;k++)v+=rgba[(y*width+start+k)*4+c]*weights[k];tmp[(y*192+x)*4+c]=Math.floor(v/4194304);}
    tmp[(y*192+x)*4+3]=255;
  }
  for(let y=0;y<192;y++)for(let x=0;x<192;x++){
    const {start,weights}=cy[y];
    for(let c=0;c<3;c++){let v=2097152;for(let k=0;k<weights.length;k++)v+=tmp[((start+k)*192+x)*4+c]*weights[k];out[(y*192+x)*4+c]=Math.floor(v/4194304);}
    out[(y*192+x)*4+3]=255;
  }
  return out;
}
async function showImage(blob,label){
  const image=await bitmap(blob),canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0);
  currentImage=resizePillow(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);
  image.close();canvas.width=canvas.height=0;
  $('original').getContext('2d').putImageData(new ImageData(currentImage,192,192),0,0);
  $('source-label').textContent=label;reset();status('图片已准备好。首次检测将下载所选模型。');
}
async function sampleChanged(){
  lock(true);
  $('file').value='';
  try{const r=await fetch('./samples/'+$('sample').value);if(!r.ok)throw Error('样例下载失败');await showImage(await r.blob(),'内置测试样例');}
  catch(e){currentImage=null;status(e.message);}
  finally{lock(false);}
}
function updateMetrics(){
  const rows=manifest.metrics.filter(r=>r.method===$('method').value);
  $('test-metrics').replaceChildren(...rows.map(row=>{
    const div=document.createElement('div');div.className='stat-card';
    const title=document.createElement('span');title.textContent=names[row.category];
    const value=document.createElement('strong');value.textContent=(row.image_auroc*100).toFixed(2)+'%';
    const details=document.createElement('small');details.textContent=`AUROC · 漏检 ${row.false_negative} / 误报 ${row.false_positive}`;
    div.append(title,value,details);return div;
  }));
}
function categoryChanged(){
  $('sample').replaceChildren(...manifest.samples[$('category').value].map(s=>{
    const option=document.createElement('option');option.value=s.file;
    option.textContent=(s.label?'缺陷 · '+s.condition:'正常')+(s.known_failure?' · 已知误判样例':'');return option;
  }));updateMetrics();return sampleChanged();
}
$('category').addEventListener('change',categoryChanged);
$('sample').addEventListener('change',sampleChanged);
$('method').addEventListener('change',()=>{reset();updateMetrics();});
$('file').addEventListener('change',async()=>{
  const file=$('file').files[0];if(!file)return;
  if(file.size>15*1024*1024){status('请选择不超过 15 MB 的图片。');return;}
  lock(true);
  try{await showImage(file,file.name);}catch(e){currentImage=null;status('无法读取图片：'+e.message);}
  finally{lock(false);}
});
$('run').addEventListener('click',()=>{
  if(busy||!currentImage)return;
  lock(true);status('正在准备检测…');
  const category=$('category').value,method=$('method').value;
  worker.postMessage({category,method,config:manifest.models[category][method],pixels:currentImage});
});
const anchors=[[0,[18,13,50]],[.25,[81,28,108]],[.5,[173,52,116]],[.75,[244,136,83]],[1,[252,253,191]]];
function color(v){
  v=Math.max(0,Math.min(1,v));let i=Math.min(3,Math.floor(v*4)),t=(v-anchors[i][0])*4;
  return anchors[i][1].map((x,c)=>Math.round(x*(1-t)+anchors[i+1][1][c]*t));
}
worker.onmessage=event=>{
  const r=event.data;
  if(r.type==='status'){status(r.message);return;}
  if(r.type==='error'){lock(false);status(r.message);return;}
  lock(false);
  const config=manifest.models[r.category][r.method],abnormal=r.score>config.threshold;
  $('decision').textContent=abnormal?'检测到外观异常':'未检测到明显外观异常';$('decision').className='decision '+(abnormal?'bad':'good');
  $('score').textContent=r.score.toFixed(5);$('threshold').textContent=config.threshold.toFixed(5);$('latency').textContent=Math.round(r.elapsed)+' ms';
  const heat=new Uint8ClampedArray(192*192*4),overlay=new Uint8ClampedArray(heat.length);
  for(let i=0;i<r.map.length;i++){
    const rgb=color(r.map[i]/(3*config.visualization_scale));
    for(let c=0;c<3;c++){heat[i*4+c]=rgb[c];overlay[i*4+c]=Math.round(.55*currentImage[i*4+c]+.45*rgb[c]);}
    heat[i*4+3]=overlay[i*4+3]=255;
  }
  $('heatmap').getContext('2d').putImageData(new ImageData(heat,192,192),0,0);
  $('overlay').getContext('2d').putImageData(new ImageData(overlay,192,192),0,0);
  status('检测完成。模型与图片处理均在当前设备执行。');
  window.__lastResult={category:r.category,method:r.method,score:r.score,threshold:config.threshold,abnormal,elapsed:r.elapsed};
};
worker.onerror=event=>{lock(false);status('检测组件启动失败，请刷新页面或换用较新的浏览器。');console.error(event.message);};
window.__testResize=resizePillow;
await categoryChanged();
