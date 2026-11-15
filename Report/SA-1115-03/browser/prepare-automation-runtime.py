"""Prepare private native guard encounter data on a real walkable map region.

All configuration, credentials and SQLite stay outside the repository. The
wrapper reuses the existing isolated seed preparer, then changes only private
native encounter rows. Browser actions never inject simulated server messages.
"""
from pathlib import Path
import argparse,importlib.util,json
ROOT=Path(__file__).resolve().parents[3]
spec=importlib.util.spec_from_file_location('runtime',ROOT/'Report/SA-1114-05/browser/runtime.py')
runtime=importlib.util.module_from_spec(spec);spec.loader.exec_module(runtime)
p=argparse.ArgumentParser();p.add_argument('--meta',required=True);a=p.parse_args()
runtime.prepare('candidate',override_binary=ROOT/'bin/saserver',meta_output=a.meta)
m=json.loads(Path(a.meta).read_text());battle=Path(m['dir'])/'gamedata/battle'
rows={
 'group1.txt':['fixture-automation-guards',90007,-1,-1,90004]+[-1]*9+[1]+[0]*9,
 'encount.txt':[90007,300,370,170,390,200,120,120,1,1000010,90007]+[-1]*9+[1]+[0]*9,
}
for file,row in rows.items():
 with (battle/file).open('ab') as stream:stream.write(('\n'+','.join(map(str,row))+'\n').encode())
