import importlib.util,json,hashlib
from pathlib import Path
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parents[2];spec=importlib.util.spec_from_file_location('art',root/'scripts/generate-lilith.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
out=root/'Report/SA-1114-03/art';out.mkdir(exist_ok=True)
pack=Path('/tmp/sa-lilith-build/extensions/lilith-v1');manifest=json.loads((pack/'manifest.json').read_text());pages=[Image.open(pack/p['file']).convert('RGBA') for p in manifest['pages']];images={r[0]:r for r in manifest['images']}
def cell(i):
 _,pi,x,y,w,h,*_=images[i];return pages[pi].crop((x,y,x+w,y+h))
a=json.loads((pack/'anim/199200.json').read_text());extents=[];counts=[]
for action in a['actions']:
 hashes=set()
 for fr in action['frames']:
  im=cell(fr[0]);bbox=im.getchannel('A').point(lambda v:255 if v>=80 else 0).getbbox();assert bbox and bbox[0]>0 and bbox[1]>0 and bbox[2]<160 and bbox[3]<160,(action['dir'],action['type'],bbox)
  hashes.add(hashlib.sha256(im.tobytes()).hexdigest());extents.append(bbox)
 assert len(hashes)>1,(action['dir'],action['type'])
 counts.append(len(hashes))
sheet=Image.new('RGB',(1280,380),'#233844');d=ImageDraw.Draw(sheet)
for direction in range(8):
 action=next(x for x in a['actions'] if x['dir']==direction and x['type']==3);c=cell(action['frames'][0][0]);sheet.paste(c,(direction*160,24),c);d.text((direction*160+48,8),'DIR '+str(direction),fill='#dcecff')
for i,(typ,f,label) in enumerate([(3,1,'IDLE'),(4,2,'FLOAT'),(0,1,'GATHER'),(0,2,'RELEASE'),(0,3,'BURST'),(6,2,'CAST'),(1,0,'HIT'),(2,2,'FAINT')]):
 action=next(x for x in a['actions'] if x['dir']==7 and x['type']==typ);c=cell(action['frames'][f][0]);sheet.paste(c,(i*160,210),c);d.text((i*160+40,188),label,fill='#dcecff')
sheet.save(out/'lilith-directions-actions.png')
for typ,name in [(3,'idle'),(0,'attack'),(6,'cast')]:
 action=next(x for x in a['actions'] if x['dir']==7 and x['type']==typ);frames=[]
 for fr in action['frames']:
  im=Image.new('RGB',(320,320),'#233844');c=cell(fr[0]).resize((320,320),Image.Resampling.NEAREST);im.paste(c,(0,0),c);frames.append(im)
 frames[0].save(out/(name+'.gif'),save_all=True,append_images=frames[1:],duration=action['ticks']*1000//60,loop=0)
e=json.loads((pack/'anim/199201.json').read_text());frames=[]
for fr in e['actions'][0]['frames']:
 im=Image.new('RGB',(440,330),'#233844');c=cell(fr[0]);im.paste(c,(0,0),c);frames.append(im)
frames[0].save(out/'ghost-storm.gif',save_all=True,append_images=frames[1:],duration=50,loop=0);frames[11].save(out/'ghost-storm.png')
# Measure character height independently of its transparent frame and floor
# light. Rows 116+ contain the separate ground ring, below every idle body.
body_heights = []
for action in a['actions']:
 if action['type'] != 3:
  continue
 for frame in action['frames']:
  mask = cell(frame[0]).crop((0, 0, 160, 116)).getchannel('A')
  box = mask.point(lambda v: 255 if v >= 80 else 0).getbbox()
  assert box and box[3] < 116, ('idle body touches measurement limit', box)
  body_heights.append(box[3] - box[1])
native = json.loads((root/'assets/anim/100353.json').read_text())
shift = json.loads((root/'assets/manifest.json').read_text())['chunkShift']
reference = {}
for direction, label in ((1, 'front_first_stand_height'), (3, 'left_up_first_stand_height')):
 image_id = next(act for act in native['actions'] if act['type'] == 3 and act['dir'] == direction)['frames'][0][0]
 chunk = json.loads((root/f'assets/images/{image_id >> shift:04}.json').read_text())
 reference[label] = chunk['img'][image_id % (1 << shift)][5]
ratios = [h / reference['front_first_stand_height'] for h in body_heights]
assert all(abs(ratio - 2/3) < .025 for ratio in ratios), ratios
r = json.loads((out.parent/'lilith-art-validation.json').read_text())
r.update(
 art_origin='User-provided JPG, checkerboard removal, directional cutouts and deterministic bitmap deformation/painted native RGBA effects; no image generation API was available or called.',
 all_actions_animated=True, minimum_unique_frames_per_action=min(counts),
 clipped_opaque_character_frames=0,
 character_opaque_extent=[min(b[0] for b in extents), min(b[1] for b in extents), max(b[2] for b in extents), max(b[3] for b in extents)],
 native_large_dragon_reference={'sprite': 100353, **reference},
 idle_body_height_px={'min': min(body_heights), 'max': max(body_heights), 'frames': len(body_heights), 'excludes': 'transparent margins and separate ground light'},
 body_to_front_dragon_height_ratio={'min': min(ratios), 'max': max(ratios), 'target': 2/3},
 files={p.relative_to(pack).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(pack.rglob('*')) if p.is_file()},
)
(out.parent/'lilith-art-validation.json').write_text(json.dumps(r, indent=2, ensure_ascii=False)+'\n')
print(json.dumps(r, ensure_ascii=False))
