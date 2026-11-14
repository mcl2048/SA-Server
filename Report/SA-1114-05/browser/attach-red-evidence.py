"""Attach explicitly separate, visually reviewed native raster evidence.

The original 20-case wire events and observations remain unchanged. Raw reports
and rejected raster captures are archived before annotation; no game data is read
or written by this report-only operation.
"""
from pathlib import Path
import argparse
import copy
import json
import shutil

parser = argparse.ArgumentParser()
parser.add_argument('--accept', action='append', required=True, help='Manually reviewed PNG basename containing the actual red effect')
args = parser.parse_args()
root = Path(__file__).resolve().parent
main_path, probe_path = root/'final-primal.json', root/'final-primal-red-probe.json'
raw_main_dir, raw_probe_dir = root/'original-primal-r7', root/'original-red-probe'
rejected = root/'supplemental-red-rejected'
for directory in (raw_main_dir, raw_probe_dir, rejected):
    directory.mkdir(exist_ok=True)
for path, directory in ((main_path, raw_main_dir), (probe_path, raw_probe_dir)):
    if not (directory/path.name).exists():
        shutil.copy2(path, directory/path.name)
main = json.loads((raw_main_dir/main_path.name).read_text())
probe = json.loads((raw_probe_dir/probe_path.name).read_text())
assert main['binary_sha256'] == probe['binary_sha256']
assert len(main['checks']) == 20 and all(c['passed'] for c in main['checks'])
assert not probe.get('failure') and probe['shutdown']['exit_code'] == 0 and probe['shutdown']['position_matches']
evidence = probe['redProbe']
accepted = set(args.accept)
assert accepted <= {c['screenshot'] for c in evidence['captures']}
for capture in evidence['captures']:
    name = capture['screenshot']
    capture['visualAccepted'] = name in accepted
    if name in accepted:
        assert (root/name).is_file() and capture['screen']['visibleRatio'] >= .35
    else:
        if (root/name).exists():
            shutil.move(root/name, rejected/name)
        capture['screenshot'] = f'{rejected.name}/{name}'
        capture['visualRejection'] = 'Capture arrived after the sampled effect; actual raster was not accepted as red-effect proof.'
evidence['visualReview'] = {'method':'manual inspection of actual Chromium PNGs', 'acceptedScreenshots':sorted(accepted), 'timing':'Projection is the read-only observation before each screenshot request; exact raster frame identity is not inferred.'}
probe['checks'][0]['evidence'] = copy.deepcopy(evidence)
probe_path.write_text(json.dumps(probe, ensure_ascii=False, indent=2)+'\n')

pet = next(p for p in main['primal'] if p['device']=='mobile' and p['pet']=='cyrufas')
old_red = copy.deepcopy(pet['visibility']['cross']['redEffectEvidence'])
for old in old_red:
    name = old['screenshot']
    if (root/name).exists():
        shutil.move(root/name, raw_main_dir/name)
    old['screenshot'] = f'{raw_main_dir.name}/{name}'
    old['visualAccepted'] = False
source = {'kind':'supplemental native cast', 'report':probe_path.name, 'sourceScope':evidence['sourceScope'], 'originalReport':f'{raw_main_dir.name}/{main_path.name}', 'reason':'The original sampled effect was visible, but its screenshot arrived after playback returned to the player.', 'captureTiming':evidence['visualReview']['timing']}
replacement = [{key:c[key] for key in ('frame','screen','screenshot')} | {'sourceReport':probe_path.name,'sourceScope':evidence['sourceScope'],'visualAccepted':True,'frameMeaning':'Observed effect frame before CDP capture; actual raster frame identity is not inferred.'} for c in evidence['captures'] if c['visualAccepted']]
for visibility in (pet['visibility']['cross'], next(c['evidence']['visibility'] for c in main['checks'] if c['case'].startswith('mobile 萨鲁法斯 actual cross neighbors'))):
    visibility['originalRedEffectObservation'] = copy.deepcopy(old_red)
    visibility['redEvidenceSource'] = copy.deepcopy(source)
    visibility['redEffectEvidence'] = copy.deepcopy(replacement)
for capture in pet['cross']['captures']:
    if capture['label']=='cross-red-impact':
        capture['screenshot'] = old_red[0]['screenshot']
        capture['visualAccepted'] = False
main['evidenceAnnotations'] = [source]
main_path.write_text(json.dumps(main, ensure_ascii=False, indent=2)+'\n')
print(json.dumps({'business_checks':len(main['checks']),'supplemental_red_screenshots':sorted(accepted),'source_report':probe_path.name},ensure_ascii=False))
