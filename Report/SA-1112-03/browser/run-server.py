"""Run an isolated browser fixture. Client mode is external until SA_EMBEDDED=1."""
from pathlib import Path
import subprocess,socket,tempfile,json,os,signal,hashlib
root=Path(__file__).resolve().parents[3];metadata=Path('/tmp/sa-layout-runtime.json')
if metadata.exists():
    meta=json.loads(metadata.read_text());runtime=Path(meta['dir']).resolve();assert runtime.parent==Path('/tmp') and runtime.name.startswith('sa-layout-')
else:
    runtime=Path(tempfile.mkdtemp(prefix='sa-layout-'))
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    meta={'dir':str(runtime),'port':port,'gm_account':'layoutfixture'}
client='embedded' if os.environ.get('SA_EMBEDDED')=='1' else str(root/'client')
gms=meta['gm_account'] if os.environ.get('SA_ENABLE_GM')=='1' else ''
(runtime/'config.yaml').write_text(f'addr: 127.0.0.1:{meta["port"]}\ndata: {root}/gamedata\nassets: {root}/assets\nclient: {client}\ndb: {runtime}/test.db\ngms: [{gms}]\ngroups:\n  - name: Layout\n    lines: [One]\n')
process=subprocess.Popen([str(root/'bin/saserver')],cwd=runtime)
meta.update(pid=process.pid,client_mode=client,binary=str(root/'bin/saserver'),sha256=hashlib.sha256((root/'bin/saserver').read_bytes()).hexdigest())
metadata.write_text(json.dumps(meta));metadata.chmod(0o600)
print(json.dumps({k:meta[k] for k in ('dir','port','pid','client_mode')}),flush=True)
def stop(*_):
    if process.poll() is None:process.send_signal(signal.SIGTERM)
signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
raise SystemExit(process.wait())
