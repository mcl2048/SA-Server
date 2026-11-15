"""Compare uploaded views, installed v2 and archived v1 at equal world scale."""
from pathlib import Path
import io,json,tarfile,hashlib,importlib.util
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('primal',ROOT/'scripts/generate-primal-claws.py');art=importlib.util.module_from_spec(spec);spec.loader.exec_module(art)
with tarfile.open(ROOT/'update/primal-claws-v1-assets.tar.gz','r:gz') as archive:
 old={x.name.removeprefix('extensions/primal-claws-v1/'):archive.extractfile(x).read() for x in archive.getmembers()}
with tarfile.open(ROOT/'update/primal-claws-v2-assets.tar.gz','r:gz') as archive:
 previous={x.name.removeprefix('extensions/primal-claws-v2/'):archive.extractfile(x).read() for x in archive.getmembers()}
readers={'v1':lambda name:old[name],'v2':lambda name:previous[name],'v3':lambda name:(ROOT/'assets/extensions/primal-claws-v3'/name).read_bytes()}
packs={}
for version,read in readers.items():
 m=json.loads(read('manifest.json'));packs[version]=(m,{r[0]:r for r in m['images']},[Image.open(io.BytesIO(read(e['file']))).convert('RGBA') for e in m['pages']])
def frame(version,sprite,direction,index=0):
 m,es,pages=packs[version];a=json.loads(readers[version](f'anim/{sprite}.json'));act=next(a for a in a['actions'] if a['dir']==direction and a['type']==3)
 _,pi,x,y,w,h,ox,oy=es[act['frames'][index][0]];im=pages[pi].crop((x,y,x+w,y+h));return im,(ox,oy)
metrics=[]
for name,sprite in (('cyrufas',199400),('claudes',199401)):
 sheet=Image.new('RGB',(1920,768),'#33434a');draw=ImageDraw.Draw(sheet)
 for direction,source in enumerate(art.sources(name)):
  _,_,_,_,(w,h)=art.rig(name,source,direction);old_w,old_h,*_=art.SIZES[name][direction]
  metrics.append({'pet':name,'dir':direction,'source_px':list(source.size),'v1_horizontal_over_vertical':(old_w/source.width)/(old_h/source.height),'v3_horizontal_over_vertical':(w/source.width)/(h/source.height)})
  for row,version in enumerate(('v1','v2','v3')):
   im,(ox,oy)=frame(version,sprite,direction);cx=direction*240+120;cy=row*256+178
   draw.line((cx-85,cy+12,cx+85,cy+12),fill='#75898e');sheet.paste(im,(cx+ox,cy+oy),im);draw.text((direction*240+8,row*256+8),f'{version.upper()} DIR{direction}',fill='white')
 sheet.save(OUT/f'{name}-all-angles.png')
sheet=Image.new('RGB',(1280,500),'#33434a');draw=ImageDraw.Draw(sheet)
for row,(name,direction,index) in enumerate((('img1.png',3,4),('img2.png',7,1))):
 screenshot=Image.open('/home/coder/TMP/'+name).convert('RGB');screenshot.save(OUT/name)
 sheet.paste(screenshot,(15,row*250+230-screenshot.height));draw.text((15,row*250+12),name+' USER',fill='white')
 for col,version in enumerate(('v1','v2','v3')):
  im,(ox,oy)=frame(version,199400,direction,index);im=im.resize((round(im.width*1.4),round(im.height*1.4)),Image.Resampling.BILINEAR)
  x=230+col*340;y=row*250+230;sheet.paste(im,(x,y-im.height),im);draw.text((220+col*340,row*250+12),f'{version.upper()} DIR{direction} STAND{index} x1.4',fill='white')
sheet.save(OUT/'user-angle-comparison.png')
result={'views':metrics,'views_checked':16,'v3_all_aspect_errors_below_1_5_percent':all(abs(m['v3_horizontal_over_vertical']-1)<.015 for m in metrics),'v1_archive_sha256':hashlib.sha256((ROOT/'update/primal-claws-v1-assets.tar.gz').read_bytes()).hexdigest(),'v2_archive_sha256':hashlib.sha256((ROOT/'update/primal-claws-v2-assets.tar.gz').read_bytes()).hexdigest()}
assert result['v3_all_aspect_errors_below_1_5_percent'];(OUT/'angle-inspection.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
