"""Check final atlases, immutable animation contracts, and produce review plates."""
from pathlib import Path
from PIL import Image,ImageDraw
import io,json,hashlib,tarfile
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).resolve().parent
REPORT=[]
for name,sprite,frames in [('lilith',199200,208),('lisarido',199300,232)]:
 pack=Path('/tmp/sa-pet-shadows-build/extensions')/(name+'-v2')
 with tarfile.open(ROOT/f'update/{name}-v1-assets.tar.gz','r:gz') as archive:
  old={m.name.removeprefix(f'extensions/{name}-v1/'):archive.extractfile(m).read() for m in archive.getmembers()}
 readers=[lambda p:old[p],lambda p:(pack/p).read_bytes()];views=[];old_acts=None
 for rev,read in enumerate(readers):
  manifest=json.loads(read('manifest.json'));anim=json.loads(read(f'anim/{sprite}.json'));entries={r[0]:r for r in manifest['images']};pages=[Image.open(io.BytesIO(read(p['file']))).convert('RGBA') for p in manifest['pages']]
  if not rev:old_acts=anim['actions']
  else:
   assert old_acts==anim['actions'],'animation ID/direction/frame/timing changed'
   assert len(anim['actions'])==64 and sum(len(a['frames']) for a in anim['actions'])==frames
   assert read('pages/00001.png')==old['pages/00001.png'],'combat effect changed unexpectedly'
   for action in anim['actions']:
    for frame in action['frames']:
     _,pi,x,y,w,h,ox,oy=entries[frame[0]];assert ox==-80 and oy==-130 and w==h==160
     im=pages[pi].crop((x,y,x+w,y+h));box=im.getchannel('A').point(lambda v:255 if v>40 else 0).getbbox()
     assert box and box[0]>0 and box[1]>0 and box[2]<160 and box[3]<160,(name,action['dir'],action['type'],frame,box)
  def cell(action,frame=0,entries=entries,pages=pages):
   _,pi,x,y,w,h,*_=entries[action['frames'][frame][0]];return pages[pi].crop((x,y,x+w,y+h))
  views.append((anim,cell))
 sheet=Image.new('RGB',(8*192,2*192),'#56645c');draw=ImageDraw.Draw(sheet)
 for row,(anim,cell) in enumerate(views):
  for direction in range(8):
   act=next(a for a in anim['actions'] if a['dir']==direction and a['type']==3);im=cell(act)
   x=direction*192+16;y=row*192+15
   draw.line((x+12,y+130,x+148,y+130),fill='#9aa68e');sheet.paste(im,(x,y),im);draw.text((direction*192+8,row*192+5),f'{name.upper()} V{row+1} DIR{direction}',fill='white')
 sheet.save(OUT/(name+'-before-after.png'))
 anim,cell=views[1]
 for typ,label in [(3,'idle'),(4,'walk'),(0,'attack'),(1,'damage'),(2,'death')]:
  act=next(a for a in anim['actions'] if a['dir']==3 and a['type']==typ);gif=[]
  for f in range(len(act['frames'])):
   im=cell(act,f).resize((480,480),Image.Resampling.NEAREST);bg=Image.new('RGB',im.size,'#56645c');bg.paste(im,(0,0),im);gif.append(bg)
  gif[0].save(OUT/(name+'-'+label+'.gif'),save_all=True,append_images=gif[1:],duration=max(60,round(act['ticks']*1000/60)),loop=0)
 plate=Image.new('RGB',(8*192,3*192),'#56645c');draw=ImageDraw.Draw(plate)
 for row,(typ,label) in enumerate([(3,'IDLE'),(0,'ATTACK'),(2,'DEAD')]):
  for direction in range(8):
   act=next(a for a in anim['actions'] if a['dir']==direction and a['type']==typ);im=cell(act,len(act['frames'])//2);x=direction*192+16;y=row*192+15
   draw.line((x+8,y+130,x+152,y+130),fill='#9aa68e');plate.paste(im,(x,y),im);draw.text((direction*192+8,row*192+5),f'{label} DIR{direction}',fill='white')
 plate.save(OUT/(name+'-actions.png'))
 REPORT.append({'pet':name,'pack':name+'-v2','character_frames':frames,'actions':64,'all_frames_nonempty_and_inside_cell':True,'all_animation_ids_directions_frames_times_unchanged':True,'effect_atlas_byte_identical':True,'archive':json.loads((ROOT/f'update/{name}-v2-assets.manifest.json').read_text())['archive']})
(OUT/'final-assets.json').write_text(json.dumps(REPORT,indent=2)+'\n');print(json.dumps(REPORT))
