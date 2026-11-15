from pathlib import Path
import subprocess,json,os,sys,time
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).resolve().parent
if '--worker' not in sys.argv:
 p=subprocess.Popen([sys.executable,str(Path(__file__).resolve()),'--worker'],start_new_session=True,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 print(json.dumps({'supervisor_pid':p.pid}));raise SystemExit()
command=['/tmp/loft-go-mod/golang.org/toolchain@v0.0.1-go1.27.3.linux-amd64/bin/go','test','-race','-p','1','./internal/world','-count=1','-timeout=600s']
status={'complete':False,'command':command};target=OUT/'go-race-world-status.json';target.write_text(json.dumps(status,indent=2)+'\n');start=time.monotonic()
with (OUT/'go-race-world.txt').open('wb') as log:
 r=subprocess.run(command,cwd=ROOT/'server',env=dict(os.environ,GOMAXPROCS='2',GOMEMLIMIT='600MiB'),stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
status.update(complete=True,exit_code=r.returncode,seconds=time.monotonic()-start);target.write_text(json.dumps(status,indent=2)+'\n')
