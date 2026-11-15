from pathlib import Path
from PIL import Image
import io,tarfile,argparse
import numpy as np,json
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).resolve().parent
parser=argparse.ArgumentParser();parser.add_argument('--screenshots',type=Path,default=Path('/home/coder/TMP'));args=parser.parse_args()
inputs=[]
for name in ('img1.png','img2.png'):
 im=np.asarray(Image.open(args.screenshots/name).convert('RGB'),dtype=float)
 gray=im@np.array([.25,.65,.1]);inputs.append((name,gray,np.fft.rfft2(gray,s=(256,256)),np.fft.rfft2(gray**2,s=(256,256))))
result=[]
for version in ('v1','v2'):
 if version=='v1':
  with tarfile.open(ROOT/'update/primal-claws-v1-assets.tar.gz','r:gz') as archive:
   data={x.name.removeprefix('extensions/primal-claws-v1/'):archive.extractfile(x).read() for x in archive.getmembers()}
  read=lambda name:data[name]
 else:read=lambda name:(ROOT/'assets/extensions/primal-claws-v2'/name).read_bytes()
 m=json.loads(read('manifest.json'));images={r[0]:r for r in m['images']};pages=[Image.open(io.BytesIO(read(e['file']))).convert('RGBA') for e in m['pages']];anim=json.loads(read('anim/199400.json'))
 best={name:[] for name,*_ in inputs}
 for action in anim['actions']:
  if action['type']!=3:continue
  for frame,f in enumerate(action['frames']):
   _,pi,x,y,w,h,*_=images[f[0]];im=pages[pi].crop((x,y,x+w,y+h));im=im.crop(im.getbbox())
   for scale in np.arange(.9,1.801,.05):
    template=im.resize((round(im.width*scale),round(im.height*scale)),Image.Resampling.BILINEAR);a=np.asarray(template,dtype=float);mask=(a[:,:,3]>210).astype(float);N=mask.sum()
    gray=a[:,:,:3]@np.array([.25,.65,.1]);gray=(gray-(gray*mask).sum()/N)*mask;norm=np.sqrt((gray**2).sum());h,w=mask.shape
    ft=np.fft.rfft2(gray,s=(256,256)).conj();fm=np.fft.rfft2(mask,s=(256,256)).conj()
    for name,target,t,t2 in inputs:
     H,W=target.shape
     if h>H or w>W:continue
     sums=np.fft.irfft2(t*fm,s=(256,256))[:H-h+1,:W-w+1];squares=np.fft.irfft2(t2*fm,s=(256,256))[:H-h+1,:W-w+1]
     corr=np.fft.irfft2(t*ft,s=(256,256))[:H-h+1,:W-w+1]/np.maximum(1,norm*np.sqrt(np.maximum(0,squares-sums*sums/N)))
     yy,xx=np.unravel_index(np.argmax(corr),corr.shape);score=float(corr[yy,xx]);best[name].append({'score':score,'dir':action['dir'],'type':action['type'],'frame':frame,'scale':round(float(scale),3),'xy':[int(xx),int(yy)],'wh':[w,h],'image_id':f[0]})
 for name,candidates in best.items():
  top=sorted(candidates,key=lambda x:-x['score'])[:8];result.append({'screenshot':name,'pack':version,'best':top});print(name,version,top[0],flush=True)
(OUT/'screenshot-matching.json').write_text(json.dumps({'method':'Masked mean-centered grayscale normalized cross-correlation; stand frames, 8 directions, uniform 0.9..1.8 scale; uploaded screenshot pixels preserved locally. Not a version proof alone.','results':result},indent=2)+'\n')
