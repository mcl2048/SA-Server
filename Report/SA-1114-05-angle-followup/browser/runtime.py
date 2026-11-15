"""Native art comparison encounters in a private copy; no production data edits."""
import importlib.util,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
spec=importlib.util.spec_from_file_location('runtime05',ROOT/'Report/SA-1114-05/browser/runtime.py')
old=importlib.util.module_from_spec(spec);spec.loader.exec_module(old)
meta=Path('/tmp/sa-primal-angle-runtime.json')
old.prepare('final',meta_output=str(meta))
m=json.loads(meta.read_text());battle=Path(m['dir'])/'gamedata/battle'
rows={f:[] for f in ('enemybase1.txt','enemy1.txt','group1.txt','encount.txt')}
for i,(label,sprite) in enumerate((('Cyrufas',199400),('NativeTiger',100330),('Claudes',199401),('NativeLochian',100286))):
 if sprite in (199400,199401):continue
 ident=91001+i;v=[0]*49;v[:9]=[ident,1000,0,80,0,0,0,30,0]
 v[13:19]=[100]*6;v[19:26]=[-1]*7;v[29:33]=[7,sprite,0,0]
 rows['enemybase1.txt'].append([label]+['']*5+v)
 rows['enemy1.txt'].append([label,'gu:1','',ident,ident,1,1,1,1,0,-1,0,0,1]+[-1]*10+[0]*10)
for f,lines in rows.items():
 with (battle/f).open('ab') as out:
  out.write(('\n'+'\n'.join(','.join(map(str,line)) for line in lines)+'\n').encode())
