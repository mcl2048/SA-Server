#!/usr/bin/env bash
# Offline integration tests; creates only a verified /tmp fixture directory.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
python3 - "$REPO_ROOT" <<'PY'
import gzip, hashlib, io, json, os
from pathlib import Path
import shutil, subprocess, sys, tarfile, tempfile

repo=Path(sys.argv[1]).resolve()
fixture=Path(tempfile.mkdtemp(prefix='sa-ai-assets-test-',dir='/tmp')).resolve()
assert fixture.parent==Path('/tmp') and fixture.name.startswith('sa-ai-assets-test-')
installer=repo/'update/install-ai-pets.sh'
prefix='extensions/ai-pets-v1'
known=['manifest.json']+['pages/%05d.png'%i for i in range(4)]+['anim/%d.json'%i for i in range(199100,199104)]
base_data={prefix+'/'+name:(b'\x89PNG\r\n\x1a\n'+name.encode() if name.endswith('.png') else json.dumps({'fixture':name}).encode()) for name in known}
passed=[]

def case(name):
    path=fixture/name
    update=path/'update';update.mkdir(parents=True)
    for source in ('install-ai-pets.sh','install-ai-pets.py'):
        shutil.copyfile(repo/'update'/source,update/source)
    (path/'server').mkdir();(path/'client').mkdir();(path/'config.yaml').write_text('assets: assets\n')
    assets=path/'assets';assets.mkdir();(assets/'original.webp').write_bytes(b'original-do-not-touch')
    return path,update,assets

def pack(update, *, additions=(), omit=None, corrupt_file=None, duplicate=None):
    payloads={k:v for k,v in base_data.items() if k!=omit}
    buf=io.BytesIO()
    with tarfile.open(fileobj=buf,mode='w',format=tarfile.USTAR_FORMAT) as tar:
        for name,data in payloads.items():
            item=tarfile.TarInfo(name);item.size=len(data);item.mode=0o644
            tar.addfile(item,io.BytesIO(data+(b'X' if name==corrupt_file else b'')))
        for item in additions:tar.addfile(item,io.BytesIO(b'x'*item.size) if item.isreg() else None)
        if duplicate:
            data=base_data[duplicate];item=tarfile.TarInfo(duplicate);item.size=len(data);tar.addfile(item,io.BytesIO(data))
    archive=gzip.compress(buf.getvalue(),mtime=0)
    (update/'ai-pets-v1-assets.tar.gz').write_bytes(archive)
    manifest={'schemaVersion':1,'packageId':'ai-pets-v1','targetRoot':'assets/'+prefix,'installPrefix':prefix,'archive':{'name':'ai-pets-v1-assets.tar.gz','size':len(archive),'sha256':hashlib.sha256(archive).hexdigest()},'entries':[{'path':k,'size':len(v),'sha256':hashlib.sha256(v).hexdigest()} for k,v in sorted(base_data.items())]}
    (update/'ai-pets-v1-assets.manifest.json').write_text(json.dumps(manifest))
    return manifest

def run(update,*args,ok=True,cwd=None):
    result=subprocess.run(['bash',str(update/'install-ai-pets.sh'),*map(str,args)],cwd=cwd or '/',capture_output=True,text=True)
    assert (result.returncode==0)==ok,(args,result.returncode,result.stdout,result.stderr)
    return result

def untouched(assets):
    assert (assets/'original.webp').read_bytes()==b'original-do-not-touch'
    assert not list(assets.glob('extensions/.ai-pets-v1-stage-*'))

try:
    path,update,assets=case('default-and-idempotent');pack(update)
    run(update,cwd=update)
    for name,data in base_data.items():assert (assets/name).read_bytes()==data
    mtimes={p:p.stat().st_mtime_ns for p in (assets/prefix).rglob('*')}
    run(update,cwd='/')
    assert all(p.stat().st_mtime_ns==stamp for p,stamp in mtimes.items())
    untouched(assets);passed+=['default relative to script, all nine files','arbitrary cwd and identical repeat install']
    (assets/prefix/'pages/00000.png').write_bytes(b'conflicting-extension')
    run(update,ok=False);assert (assets/prefix/'pages/00000.png').read_bytes()==b'conflicting-extension';untouched(assets)
    passed+=['conflicting extension is not overwritten']

    path,update,assets=case('custom');pack(update)
    custom=fixture/'custom-target/assets';custom.mkdir(parents=True);(custom/'original.webp').write_bytes(b'original-do-not-touch')
    run(update,'--assets',custom);assert (custom/prefix/'manifest.json').exists();assert not (assets/prefix).exists();untouched(custom)
    passed+=['explicit existing assets target only']
    wrong=fixture/'custom-target/not-assets';wrong.mkdir();run(update,'--assets',wrong,ok=False);assert not list(wrong.iterdir())
    missing=fixture/'missing/assets';run(update,'--assets',missing,ok=False);assert not missing.exists()
    passed+=['wrong basename and missing explicit target rejected']

    path,update,assets=case('configured-custom-assets');pack(update)
    external=fixture/'configured/Assets';external.mkdir(parents=True)
    (path/'config.local.yaml').write_text('assets: "'+str(external)+'" # intentional override\n')
    result=run(update,ok=False);assert '--assets' in result.stderr and not (assets/'extensions').exists() and not list(external.iterdir())
    run(update,'--assets',external);assert (external/prefix/'manifest.json').exists();untouched(assets)
    passed.append('configured Assets override never pollutes default and explicit uppercase target works')

    for label,config in [('quoted-default',"assets: './assets' # safe quoted scalar\n"),('double-default','"assets": "assets"\n')]:
        path,update,assets=case(label);pack(update);(path/'config.local.yaml').write_text(config)
        run(update);assert (assets/prefix/'manifest.json').exists();untouched(assets);passed.append(label+' recognized')

    for label,config in [('complex-yaml','assets: &assetsdir assets\n'),('merge-yaml','<<: *deployment\n'),('duplicate-assets','assets: assets\nassets: other\n'),('multi-document','---\nassets: assets\n')]:
        path,update,assets=case(label);pack(update);(path/'config.local.yaml').write_text(config)
        run(update,ok=False);assert not (assets/'extensions').exists();untouched(assets);passed.append(label+' requires explicit target')

    path,update,assets=case('target-symlink');pack(update)
    elsewhere=fixture/'elsewhere';elsewhere.mkdir()
    link_parent=fixture/'linked-parent';link_parent.mkdir();(link_parent/'assets').symlink_to(elsewhere,target_is_directory=True)
    run(update,'--assets',link_parent/'assets',ok=False);assert not list(elsewhere.iterdir())
    (assets/'extensions').symlink_to(elsewhere,target_is_directory=True)
    run(update,ok=False);assert not list(elsewhere.iterdir());untouched(assets)
    passed+=['target and extension symlinks rejected without touching linked directory']

    path,update,assets=case('ancestor-symlink');pack(update)
    real=fixture/'real-parent';real.mkdir();(real/'assets').mkdir()
    ancestor=fixture/'alias-parent';ancestor.symlink_to(real,target_is_directory=True)
    run(update,'--assets',ancestor/'assets',ok=False);assert not list((real/'assets').iterdir())
    passed+=['symlink in any target ancestor rejected']

    for label,tar_name,kind,link in [
        ('parent-traversal','../outside.txt',tarfile.REGTYPE,''),
        ('absolute',str(fixture/'absolute.txt'),tarfile.REGTYPE,''),
        ('unknown-file',prefix+'/pages/evil.png',tarfile.REGTYPE,''),
        ('symbolic-link',prefix+'/pages/00000.png',tarfile.SYMTYPE,'../../outside'),
        ('hard-link',prefix+'/pages/00000.png',tarfile.LNKTYPE,prefix+'/manifest.json'),
        ('device',prefix+'/pages/00000.png',tarfile.CHRTYPE,''),
        ('directory',prefix+'/pages',tarfile.DIRTYPE,''),
    ]:
        path,update,assets=case(label)
        item=tarfile.TarInfo(tar_name);item.type=kind;item.linkname=link;item.size=1 if kind==tarfile.REGTYPE else 0
        pack(update,additions=[item]);run(update,ok=False)
        assert not (assets/'extensions').exists();untouched(assets)
        assert not (path/'outside.txt').exists() and not (fixture/'absolute.txt').exists()
        passed.append('malicious tar rejected: '+label)

    for label,kwargs in [('missing-entry',{'omit':prefix+'/manifest.json'}),('duplicate-entry',{'duplicate':prefix+'/manifest.json'})]:
        path,update,assets=case(label);pack(update,**kwargs);run(update,ok=False);assert not (assets/'extensions').exists();untouched(assets);passed.append(label+' rejected before mutation')

    path,update,assets=case('archive-sha');pack(update)
    archive=update/'ai-pets-v1-assets.tar.gz';archive.write_bytes(archive.read_bytes()+b'X')
    run(update,ok=False);assert not (assets/'extensions').exists();untouched(assets);passed.append('archive tampering rejected')

    path,update,assets=case('entry-sha');manifest=pack(update)
    manifest['entries'][0]['sha256']='0'*64;(update/'ai-pets-v1-assets.manifest.json').write_text(json.dumps(manifest))
    run(update,ok=False);assert not (assets/'extensions').exists();untouched(assets);passed.append('per-file digest mismatch rejected')

    path,update,assets=case('manifest-escape');manifest=pack(update)
    manifest['entries'][0]['path']='../base.png';(update/'ai-pets-v1-assets.manifest.json').write_text(json.dumps(manifest))
    run(update,ok=False);assert not (assets/'extensions').exists();untouched(assets);passed.append('manifest traversal rejected')

    path,update,assets=case('package-link');pack(update)
    package=update/'ai-pets-v1-assets.tar.gz';safe=fixture/'safe-package.tar.gz';package.rename(safe);package.symlink_to(safe)
    run(update,ok=False);assert not (assets/'extensions').exists();untouched(assets);passed.append('package symlink rejected')

    path,update,assets=case('decompression-limit');manifest=pack(update)
    archive=gzip.compress(b'\0'*200000,mtime=0)
    manifest['archive']['size']=len(archive);manifest['archive']['sha256']=hashlib.sha256(archive).hexdigest()
    (update/'ai-pets-v1-assets.tar.gz').write_bytes(archive);(update/'ai-pets-v1-assets.manifest.json').write_text(json.dumps(manifest))
    run(update,ok=False);assert not (assets/'extensions').exists();untouched(assets);passed.append('expanded tar size bounded before metadata parsing')

    path,update,assets=case('incomplete-installed');pack(update);target=assets/prefix;target.mkdir(parents=True);(target/'manifest.json').write_bytes(base_data[prefix+'/manifest.json'])
    run(update,ok=False);assert len(list(target.iterdir()))==1;untouched(assets);passed.append('incomplete existing extension preserved and rejected')

    print(json.dumps({'passed':len(passed),'cases':passed,'fixture_cleanup':True},ensure_ascii=False,indent=2))
finally:
    assert fixture.parent==Path('/tmp') and fixture.name.startswith('sa-ai-assets-test-') and not fixture.is_symlink()
    shutil.rmtree(fixture)
PY
