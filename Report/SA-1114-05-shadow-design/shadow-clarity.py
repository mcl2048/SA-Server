"""Static compositing review on a real native battlefield crop and neutral controls."""
from pathlib import Path
from PIL import Image,ImageDraw
import json
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).resolve().parent
native=Image.open(ROOT/'Report/SA-1114-05-angle-followup/browser/final-desktop-cyrufas-native-comparison.png').convert('RGB').crop((600,200,760,360))
for pet,sprite in [('lilith',199200),('lisarido',199300)]:
 pack=Path('/tmp/sa-pet-shadows-build/extensions')/(pet+'-v2');m=json.loads((pack/'manifest.json').read_text());anim=json.loads((pack/f'anim/{sprite}.json').read_text());entries={v[0]:v for v in m['images']};page=Image.open(pack/'pages/00000.png').convert('RGBA')
 sheet=Image.new('RGB',(1280,1080),'#192321');draw=ImageDraw.Draw(sheet)
 for row,(label,bg) in enumerate([('NATIVE BATTLEFIELD CROP',native),('LIGHT CONTROL',Image.new('RGB',(160,160),'#e4dab7')),('DARK CONTROL',Image.new('RGB',(160,160),'#56645c'))]):
  for col,(direction,typ,fno,actlabel) in enumerate([(3,3,0,'ALLY IDLE'),(7,3,0,'ENEMY IDLE'),(3,1,-1,'HIT LAST'),(3,2,-1,'DEATH LAST')]):
   act=next(a for a in anim['actions'] if a['dir']==direction and a['type']==typ);_,pi,x,y,w,h,*_=entries[act['frames'][fno][0]];assert pi==0
   im=bg.copy();im.paste(page.crop((x,y,x+w,y+h)),(0,0),page.crop((x,y,x+w,y+h)));im=im.resize((320,320),Image.Resampling.NEAREST);sheet.paste(im,(col*320,row*360+32));draw.text((col*320+8,row*360+7),label+' / '+actlabel,fill='#eeeecc')
 sheet.save(OUT/(pet+'-shadow-clarity.png'))
