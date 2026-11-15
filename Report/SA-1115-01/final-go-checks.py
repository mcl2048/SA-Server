from pathlib import Path
import json,subprocess,time
root=Path(__file__).resolve().parents[2];out=Path(__file__).resolve().parent
checks=[]
for name,cmd in [('go-test-all',['go','test','./...','-count=1','-timeout=180s']),('go-vet',['go','vet','./...'])]:
 started=time.time()
 with (out/(name+'.txt')).open('w') as stream:code=subprocess.run(cmd,cwd=root/'server',stdout=stream,stderr=subprocess.STDOUT).returncode
 checks.append({'name':name,'command':cmd,'exit_code':code,'seconds':round(time.time()-started,2)})
 (out/'go-checks.json').write_text(json.dumps({'checks':checks,'success':all(c['exit_code']==0 for c in checks),'complete':len(checks)==2},indent=2)+'\n')
 if code:raise SystemExit(code)
