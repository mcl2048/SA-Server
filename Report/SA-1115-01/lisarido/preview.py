"""Render all directions from the same production compositor used for the atlas."""
import importlib.util
from pathlib import Path
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[3]
spec=importlib.util.spec_from_file_location('lisarido',ROOT/'scripts/generate-lisarido.py');art=importlib.util.module_from_spec(spec);spec.loader.exec_module(art)
out=Path(__file__).resolve().parent;refs=art.source_frames();bg=(81,96,88)
phases=('Rest','Raise','Aim','Fire','Recoil / lower','Return')
grid=Image.new('RGB',(6*240,8*240),bg);draw=ImageDraw.Draw(grid);frames=[]
for direction,base in enumerate(refs):
 for frame in range(6):
  image=art.character_frame(base,'attack',frame,direction).resize((240,240),Image.Resampling.NEAREST)
  x,y=frame*240,direction*240;grid.paste(image,(x,y),image);draw.text((x+10,y+210),f'dir{direction}: {phases[frame]}',fill=(240,242,232))
grid.save(out/'attack-eight-directions.png',optimize=True)
for frame in range(6):
 sheet=Image.new('RGB',(4*320,2*320),bg);d=ImageDraw.Draw(sheet)
 for direction,base in enumerate(refs):
  image=art.character_frame(base,'attack',frame,direction).resize((320,320),Image.Resampling.NEAREST)
  x,y=direction%4*320,direction//4*320;sheet.paste(image,(x,y),image);d.text((x+10,y+282),f'dir{direction}: {phases[frame]}',fill=(240,242,232))
 frames.append(sheet)
frames[0].save(out/'attack-eight-directions.gif',save_all=True,append_images=frames[1:],duration=[300,160,260,160,200,300],loop=0,disposal=2)
frames[2].save(out/'aim-eight-directions.png',optimize=True)
