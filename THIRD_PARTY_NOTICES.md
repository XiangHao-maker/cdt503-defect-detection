# Sources and third-party notices

This educational CDT503 demonstration is not affiliated with MVTec, Microsoft, or the authors of PatchCore.

## Sample images

The sample images are resized derivatives of the MVTec Anomaly Detection (MVTec AD) dataset by Paul Bergmann et al. They are distributed under **CC BY-NC-SA 4.0**. They are intended for non-commercial teaching and research. The original license is included as `licenses/MVTec-AD-license.txt`.

- Official dataset: https://www.mvtec.com/research-teaching/datasets/mvtec-ad
- Downloaded mirror: https://huggingface.co/datasets/foersben/mvtec-ad
- Mirror revision: c75b39616f84db43677bcc8228caaafaf5096d7f
- Changes: images resized to 192×192 for browser demonstration. Known false-positive and false-negative examples are explicitly labelled.

## Model and method

- Roth et al., *Towards Total Recall in Industrial Anomaly Detection*, CVPR 2022: https://arxiv.org/abs/2106.08265
- This is a simplified educational implementation, with a frozen ImageNet ResNet18 backbone, projected candidate coreset, 1-nearest-neighbor patch distances, and maximum image score. It does not claim to reproduce the original paper's implementation or evaluation protocol.
- Torchvision ResNet18 and pretrained weights: https://docs.pytorch.org/vision/stable/models/generated/torchvision.models.resnet18.html
- Torchvision source license: https://github.com/pytorch/vision/blob/main/LICENSE

## Browser runtime

ONNX Runtime Web 1.22.0, Microsoft Corporation, is distributed under the MIT license. Its original license is included at `vendor/LICENSE`. The npm package SHA-512 integrity is recorded in `vendor/integrity.json`.

Images chosen by visitors stay in their browser; this application contains no image-upload endpoint, analytics, or API keys. GitHub Pages may record routine access logs independently of the application.
