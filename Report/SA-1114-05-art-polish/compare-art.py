"""Native palette sprites and both extension revisions at identical world scale."""
from pathlib import Path
import json,importlib.util
from PIL import Image,ImageDraw
import numpy as np
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).resolve().parent
sp=importlib.util.spec_from_file_location('generator',ROOT/'scripts/generate-primal-claws.py');g=importlib.util.module_from_spec(sp);sp.loader.exec_module(g)
palette=np.asarray(Image.open(ROOT/'assets/palettes.png').convert('RGBA'))[0]
chunks={};nativepages={}
def native(sprite,direction):
 a=json.loads((ROOT/f'assets/anim/{sprite}.json').read_text());act=next(a for a in a['actions'] if a['dir']==direction and a['type']==3);ident=act['frames'][0][0];ch=ident//4096
 if ch not in chunks:chunks[ch]=json.loads((ROOT/f'assets/images/{ch:04}.json').read_text())
 c=chunks[ch];s,p,x,y,w,h,ox,oy,*_=c['img'][ident-c['base']]
 key=(s,p)
 if key not in nativepages:nativepages[key]=Image.open(ROOT/f'assets/pages/{["i8","rgba"][s]}/{p:05}.webp').convert('RGBA')
 im=nativepages[key].crop((x,y,x+w,y+h))
 if s==0:
  indices=np.asarray(im)[:,:,0];rgba=palette[indices].copy();rgba[:,:,3]=np.where(indices==0,0,255);im=Image.fromarray(rgba)
 return im,(ox,oy)
def extension(version,sprite,direction):
 pack=ROOT/f'assets/extensions/primal-claws-{version}';m=json.loads((pack/'manifest.json').read_text());es={r[0]:r for r in m['images']};a=json.loads((pack/f'anim/{sprite}.json').read_text());act=next(a for a in a['actions'] if a['dir']==direction and a['type']==3);_,p,x,y,w,h,ox,oy=es[act['frames'][0][0]]
 return Image.open(pack/m['pages'][p]['file']).convert('RGBA').crop((x,y,x+w,y+h)),(ox,oy)
metrics=[]
for name,sprite,ref in [('cyrufas',199400,100330),('claudes',199401,100286)]:
 sheet=Image.new('RGB',(1536,630),'#586563');draw=ImageDraw.Draw(sheet);sources=g.sources(name)
 for d in range(8):
  for row,(label,loader) in enumerate([('NATIVE',lambda:native(ref,d)),('V1',lambda:extension('v1',sprite,d)),('V2',lambda:extension('v2',sprite,d))]):
   im,(ox,oy)=loader();x=d*192+96;y=row*210+142
   draw.line((x-85,y+12,x+85,y+12),fill='#a2b49b');draw.line((x,y-100,x,y+40),fill='#71817b');sheet.paste(im,(x+ox,y+oy),im);draw.text((d*192+4,row*210+6),f'{label} DIR{d}',fill='white')
  _,_,_,origin,(w,h)=g.rig(name,sources[d],d)
  metrics.append({'pet':name,'dir':d,'source_px':sources[d].size,'output_px':[w,h],'scale_x_over_y':(w/sources[d].width)/(h/sources[d].height),'offset_px':[origin[0]-96,origin[1]-142],'support_y_world':origin[1]-142+h*g.FEET[name][d][1]/100})
 sheet.save(OUT/'art'/f'{name}-before-after.png')
(OUT/'proportions.json').write_text(json.dumps(metrics,indent=2)+'\n')
