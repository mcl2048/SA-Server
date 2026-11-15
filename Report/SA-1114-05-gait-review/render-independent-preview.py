from pathlib import Path
from PIL import Image,ImageDraw
import importlib.util,json
r=Path('/home/coder/saserver');o=r/'Report/SA-1114-05-gait-review'
s=importlib.util.spec_from_file_location('g',r/'scripts/generate-primal-claws.py');g=importlib.util.module_from_spec(s);s.loader.exec_module(g)
sources=g.sources('cyrufas');data=[]
for direction in (2,6,3,7):
 model=g.rig('cyrufas',sources[direction],direction);sheet=Image.new('RGB',(8*240,260),'#566366');d=ImageDraw.Draw(sheet);gif=[]
 for i in range(8):
  im=g.animate('cyrufas',model,direction,'walk',i,8);im.save(o/f'dir{direction}-frame{i}.png')
  sheet.paste(im,(i*240,15),im);d.text((i*240+6,6),f'DIR{direction} FRAME{i}',fill='white');bg=Image.new('RGB',im.size,'#566366');bg.paste(im,(0,0),im);gif.append(bg.resize((480,480)))
 sheet.save(o/f'dir{direction}-run.png');gif[0].save(o/f'dir{direction}-run.gif',save_all=True,append_images=gif[1:],duration=67,loop=0)
 data.append({'dir':direction,'body_px':list(model[-1]),'origin':model[-2]})
(o/'geometry.json').write_text(json.dumps(data,indent=2)+'\n')
