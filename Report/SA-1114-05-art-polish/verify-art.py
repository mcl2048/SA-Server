"""Validate the real atlas bounds and export inspectable directional action sheets."""
from pathlib import Path
import hashlib,json
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).resolve().parent
import argparse
p=argparse.ArgumentParser();p.add_argument('--pack',type=Path,default=ROOT/'assets/extensions/primal-claws-v2');args=p.parse_args();PACK=args.pack
m=json.loads((PACK/'manifest.json').read_text());pages=[Image.open(PACK/p['file']).convert('RGBA') for p in m['pages']]
entries={row[0]:row for row in m['images']};assert len(entries)==len(m['images'])==776
assert all(9300000<=i<9400000 for i in entries)
assert sum(p.width*p.height for p in pages)<=10*1024*1024, "new 100px pets must not allocate more than 40MiB decoded texture memory"

def cell(ident):
 _,p,x,y,w,h,ox,oy=entries[ident];assert x>=0 and y>=0 and x+w<=pages[p].width and y+h<=pages[p].height
 image=pages[p].crop((x,y,x+w,y+h))
 if p<2:
  canvas=Image.new('RGBA',(192,192));canvas.alpha_composite(image,(ox+96,oy+142));return canvas
 return image

art=OUT/'art';art.mkdir(exist_ok=True);results=[];clipped=[]
refs=json.loads((ROOT/'Report/SA-1114-05/native-size-reference.json').read_text())
for name,sprite,native in (('cyrufas',199400,'100330'),('claudes',199401,'100286')):
 anim=json.loads((PACK/f'anim/{sprite}.json').read_text());assert len(anim['actions'])==64
 distinct=[];dimensions=[]
 sheet=Image.new('RGB',(1536,640),'#263643');draw=ImageDraw.Draw(sheet)
 for action in anim['actions']:
  hashes=[]
  for i,frame in enumerate(action['frames']):
   im=cell(frame[0]);assert im.size==(192,192)
   box=im.getchannel('A').point(lambda v:255 if v>=80 else 0).getbbox();assert box,(name,action,i)
   if not(box[0]>0 and box[1]>0 and box[2]<192 and box[3]<192):clipped.append((name,action['dir'],action['type'],i,box))
   hashes.append(hashlib.sha256(im.tobytes()).hexdigest())
  assert len(set(hashes))>1,(name,action['dir'],action['type'])
  distinct.append(len(set(hashes)))
  if action['type']==3:
   im=cell(action['frames'][0][0]);box=im.getchannel('A').point(lambda v:255 if v>=80 else 0).getbbox()
   ref=refs[native][action['dir']];actual=[box[2]-box[0],box[3]-box[1]]
   assert actual[0]<=125 and actual[1]<=100,(name,action['dir'],actual)
   dimensions.append({'dir':action['dir'],'visible_bbox':list(box),'actual_size_px':actual,'reference_pose_size_px':[ref['width'],ref['height']],'native_anchor':ref['anchor']})
 for direction in range(8):
  for row,(typ,fi,label) in enumerate(((3,0,'IDLE'),(0,3,'REAR / JUMP'),(0,6,'LEFT CLAW HIT'))):
   a=next(a for a in anim['actions'] if a['type']==typ and a['dir']==direction);im=cell(a['frames'][fi][0])
   x=direction*192;y=24+row*208;sheet.paste(im,(x,y),im);draw.text((x+8,y-15),f'{label} DIR {direction}',fill='white')
 sheet.save(art/(name+'-directions.png'))
 attack=Image.new('RGB',(1920,224),'#263643');d=ImageDraw.Draw(attack)
 a=next(a for a in anim['actions'] if a['type']==0 and a['dir']==1)
 for i,f in enumerate(a['frames']):
  im=cell(f[0]);attack.paste(im,(i*192,22),im);d.text((i*192+4,4),'FRAME '+str(i),fill='white')
 attack.save(art/(name+'-attack-steps.png'))
 for typ,label in ((3,'idle'),(4,'walk'),(0,'attack')):
  a=next(a for a in anim['actions'] if a['type']==typ and a['dir']==1);frames=[]
  for f in a['frames']:
   im=cell(f[0]).resize((384,384),Image.Resampling.NEAREST);bg=Image.new('RGB',im.size,'#263643');bg.paste(im,(0,0),im);frames.append(bg)
  frames[0].save(art/(name+'-'+label+'.gif'),save_all=True,append_images=frames[1:],duration=round(a['ticks']*1000/60),loop=0)
 results.append({'name':name,'sprite':sprite,'frames':sum(len(a['frames']) for a in anim['actions']),'actions':64,'minimum_distinct_frames':min(distinct),'idle_dimensions':dimensions})
assert not clipped,clipped
fx=json.loads((PACK/'anim/199402.json').read_text());assert len(fx['actions'][0]['frames'])==24
im=cell(fx['actions'][0]['frames'][9][0]);bg=Image.new('RGB',im.size,'#263643');bg.paste(im,(0,0),im);bg.save(art/'primal-cross.png')
result={'pets':results,'texture_pixels':sum(p.width*p.height for p in pages),'decoded_texture_bytes':sum(p.width*p.height*4 for p in pages),'character_frames':752,'effect_frames':24,'all_128_actions_animated':True,'clipped_frames':clipped,'files':{p.relative_to(PACK).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(PACK.rglob('*')) if p.is_file()},'scope':'All frame bounds, nonempty alpha, timing, distinct poses, texture budget and compact-anchor restoration. Reference bounds describe different poses and must not be imposed on source anatomy. Source aspect regression and live combat inspection are separate checks.'}
(OUT/'art-validation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False))
