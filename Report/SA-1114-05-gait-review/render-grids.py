from pathlib import Path
from PIL import Image,ImageDraw
import importlib.util
r=Path('/home/coder/saserver');o=r/'Report/SA-1114-05-gait-review';s=importlib.util.spec_from_file_location('g',r/'scripts/generate-primal-claws.py');g=importlib.util.module_from_spec(s);s.loader.exec_module(g)
colors=[(50,170,255,70),(255,70,50,70),(240,230,50,70),(200,80,255,70)]
for direction in (2,6):
 im=Image.open(r/'img/cyrufas.jpg');w,h=im.size;y,x=divmod(g.ORDER['cyrufas'][direction],3);source=g.cutout(im.crop((round(x*w/3),round(y*h/3),round((x+1)*w/3),round((y+1)*h/3))))
 for polygons in (False,True):
  im=source.resize((source.width*3,source.height*3));back=Image.new('RGBA',im.size,'#bbc3c9');back.alpha_composite(im);d=ImageDraw.Draw(back)
  for z in range(0,101,10):
   xx=z*im.width/100;yy=z*im.height/100;d.line((xx,0,xx,im.height),fill='#7895a1');d.line((0,yy,im.width,yy),fill='#7895a1');d.text((xx+2,0),str(z),fill='black');d.text((0,yy+2),str(z),fill='black')
  if polygons:
   layer=Image.new('RGBA',im.size);dl=ImageDraw.Draw(layer)
   for i,(root,poly,role) in enumerate(g.TIGER[g.ORDER['cyrufas'][direction]]):
    xy=[(px*im.width/100,py*im.height/100) for px,py in poly];dl.polygon(xy,fill=colors[i],outline=colors[i][:3]+(255,),width=3);dl.text((root[0]*im.width/100,root[1]*im.height/100),str(i)+' '+role,fill='white')
   back.alpha_composite(layer)
  back.convert('RGB').save(o/(f'dir{direction}-source-'+('polygons.png' if polygons else 'grid.png')))
