"""Combine two normally completed, isolated runs of the same release ELF.

Field and combat segments are explicit independent runner modes. Failed or
interrupted earlier harness runs remain in separate files, never merged here.
"""
from pathlib import Path
import json,hashlib
OUT=Path(__file__).resolve().parent;sha=lambda b:hashlib.sha256(b).hexdigest()
reports=[]
for segment,count in (('field',72),('combat',11)):
 status_name='final-combat-verified-status.json' if segment=='combat' else 'final-field-status.json'
 status=json.loads((OUT/status_name).read_text());assert status['state']=='finished' and status['exit_code']==0,(segment,status)
 path=OUT/f'browser/final-{segment}-game.json';r=json.loads(path.read_text())
 assert not r.get('failure') and not r['errors'],(segment,r.get('failure'),r['errors'])
 assert len(r['checks'])==count and all(c['passed'] for c in r['checks']),(segment,len(r['checks']))
 assert r['shutdown']['exit_code']==0 and r['shutdown']['position_matches'] and not r['shutdown']['timed_out'],(segment,r['shutdown'])
 reports.append((path,r))
field,combat=[r for _,r in reports]
assert field['binary_sha256']==combat['binary_sha256'] and field['binary_version']==combat['binary_version']
result={'variant':'final','segmented':True,'scope':field['scope'],'binary_sha256':field['binary_sha256'],'binary_version':field['binary_version'],'browser':field['browser'],
 'segments':[{'path':p.relative_to(OUT).as_posix(),'sha256':sha(p.read_bytes()),'checks':len(r['checks']),'shutdown':r['shutdown']} for p,r in reports],
 'checks':field['checks']+combat['checks'],'matrix':field.get('matrix',[])+combat.get('matrix',[]),'errors':[],
 'shutdown':{'exit_code':0,'position_matches':True,'timed_out':False,'all_segments_normal':True}}
(OUT/'browser/final-real-game.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
(OUT/'final-matrix-status.json').write_text(json.dumps({'state':'finished','exit_code':0,'segments':['field','combat'],'checks':len(result['checks'])})+'\n')
print(json.dumps({'browser_checks':len(result['checks']),'binary_sha256':result['binary_sha256'],'segments':[len(r['checks']) for _,r in reports]}))
