"""Current-batch adapter: retain proven real-UI paths, write only new evidence.
Run with /tmp/loft-hyraken-paas-venv/bin/python; private runtime metadata is
/tmp/sa-1113-02-runtime.json. No credentials enter the report directory.
"""
from pathlib import Path
import importlib.util
from unittest.mock import patch
from playwright.sync_api import BrowserType
ROOT=Path(__file__).resolve().parents[3]
spec=importlib.util.spec_from_file_location('previous_pet_acceptance',ROOT/'Report/SA-1113-01/browser/acceptance.py')
previous=importlib.util.module_from_spec(spec);spec.loader.exec_module(previous)
previous.OUT=Path(__file__).resolve().parent
previous.META=Path('/tmp/sa-1113-02-runtime.json')
launch=BrowserType.launch
# Separate current-batch mobile/desktop evidence filenames, while preserving
# the established UI exercise and its JSON schema.
original_snap=previous.UI.snap
def mode_snap(self,name):
 import sys
 mode='mobile' if '--mobile' in sys.argv else 'desktop'
 if name in ('five-pets-four-distinct-mechanical-battle','five-pets-selected'):
  name=mode+'-'+name
 return original_snap(self,name)
previous.UI.snap=mode_snap

def current_launch(self,*args,**kwargs):
 kwargs['executable_path']='/home/coder/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell'
 return launch(self,*args,**kwargs)

if __name__=='__main__':
 with patch.object(BrowserType,'launch',current_launch):previous.main()
