"""Run the frozen-source project checks and retain actual exit status."""
from pathlib import Path
import json,os,subprocess,time
root=Path(__file__).resolve().parents[2];out=Path(__file__).resolve().parent
checks=[
 ('client-and-build',['bash','-c','node --experimental-strip-types --test --test-concurrency=1 client/test/*.test.ts client/test/*.test.mjs scripts/build-client.test.mjs'],'client-tests.txt',root),
 ('typescript',['node','/home/coder/.npm/_npx/9ca470fa61f45e06/node_modules/typescript/bin/tsc','--noEmit','--target','ES2022','--module','ESNext','--moduleResolution','bundler','--allowImportingTsExtensions','--lib','ES2022,DOM','client/src/main.ts'],'typescript.txt',root),
 ('go-all',['go','test','-p','1','./...','-count=1'],'go-tests.txt',root/'server'),
 ('go-vet',['go','vet','-p','1','./...'],'go-vet.txt',root/'server'),
 ('world-automation-race',['go','test','-race','-p','1','./internal/world','-run','TestAutomation|TestLilithAutomation','-count=1'],'world-race.txt',root/'server'),
 ('battle-race',['go','test','-race','-p','1','./internal/battle','-count=1'],'battle-race.log',root/'server'),
 ('lilith-installer',['bash','scripts/update-lilith.test.sh'],'lilith-install-tests.json',root),
 ('matched-build',['bash','scripts/build-linux.sh'],'build.txt',root),
]
result={'state':'running','success':False,'checks':[]}
for name,command,log,cwd in checks:
 with (out/log).open('w') as f:
  started=time.time();r=subprocess.run(command,cwd=cwd,stdout=f,stderr=subprocess.STDOUT)
 result['checks'].append({'name':name,'exit_code':r.returncode,'log':log,'seconds':round(time.time()-started,3)})
 (out/'checks-status.json').write_text(json.dumps(result,indent=2)+'\n');print(name,r.returncode,flush=True)
 if r.returncode:break
result['state']='finished';result['success']=len(result['checks'])==len(checks) and all(c['exit_code']==0 for c in result['checks'])
(out/'checks-status.json').write_text(json.dumps(result,indent=2)+'\n');raise SystemExit(0 if result['success'] else 1)
