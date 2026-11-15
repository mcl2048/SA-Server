from pathlib import Path
from PIL import Image,ImageDraw
import importlib.util
r=Path('/home/coder/saserver');o=r/'Report/SA-1114-05-gait-review';s=importlib.util.spec_from_file_location('g',r/'scripts/generate-primal-claws.py');g=importlib.util.module_from_spec(s);s.loader.exec_module(g)
for direction in (2,6):
 im=Image.open(r/'img/cyrufas.jpg');w,h=im.size;y,x=divmod(g.ORDER['cyrufas'][direction],3);source=g.cutout(im.crop((round(x*w/3),round(y*h/3),round((x+1)*w/3),round((y+1)*h/3))))
 model=g.rig('cyrufas',source,direction);layers=[('body',model[1]),*[(f'{i} {role}',im) for i,(im,p,role) in enumerate(model[2])]]
 sheet=Image.new('RGB',(len(layers)*400,400),'#75838b');d=ImageDraw.Draw(sheet)
 for i,(label,im) in enumerate(layers):
  a=im.resize((g.CELL,g.CELL)).crop((25,65,225,205)).resize((400,280),Image.Resampling.NEAREST);sheet.paste(a,(i*400,60),a);d.text((i*400+10,10),label,fill='white')
 sheet.save(o/f'dir{direction}-layers.png')
