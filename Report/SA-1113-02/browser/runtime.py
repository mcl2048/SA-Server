"""Isolated current-batch final-binary runtime. Credentials/DB remain in /tmp.
Reuse the established launcher, adding the map rule only to private config.
"""
from pathlib import Path
import importlib.util
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[3]
spec=importlib.util.spec_from_file_location('previous_pet_runtime',ROOT/'Report/SA-1113-01/browser/runtime.py')
previous=importlib.util.module_from_spec(spec);spec.loader.exec_module(previous)
previous.META=Path('/tmp/sa-1113-02-runtime.json')
write_text=Path.write_text

def fixture_config(self,data,*args,**kwargs):
 if self.name=='config.yaml' and self.parent.name.startswith('sa-mechanical-'):
  data=data.replace('rules:\n','minimapReveal: 1\nrules:\n')
 return write_text(self,data,*args,**kwargs)

if __name__=='__main__':
 with patch.object(Path,'write_text',fixture_config):previous.main()
