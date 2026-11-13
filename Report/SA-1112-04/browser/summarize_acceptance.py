"""Summarize actual independent cases without hiding failed execution attempts."""
from pathlib import Path
import json
OUT=Path(__file__).resolve().parent
reports=[];cases={};failures=[]
actual_sha=json.loads(Path('/tmp/sa-upgrade-runtime.json').read_text())['sha256']
required=('gameplay-layout.json','gameplay-dom-probe.json','gameplay-gameplay.json','gameplay-offline.json')
for name in (*required,'gameplay-baseline-final.json'):
    path=OUT/name
    if not path.exists():continue
    report=json.loads(path.read_text())
    if report.get('binary_sha256')!=actual_sha:continue
    reports.append({'file':name,'binary_sha256':report.get('binary_sha256'),'page_errors':report.get('page_errors',[])})
    if report.get('page_errors'):failures.append({'file':name,'case':'uncaught-browser-errors','errors':report['page_errors']})
    for case in report.get('cases',[]):
        if case.get('pass'):cases[(report.get('binary_sha256'),case['case'])]=case
        elif name!='gameplay-baseline-final.json':failures.append({'file':name,'case':case['case'],'error':case.get('error')})
missing=[name for name in required if name not in {report['file'] for report in reports}]
result={'binary_sha256':actual_sha,'completed_case_count':len(cases),'all_acceptance_passed':not failures and not missing,'missing_final_candidate_phases':missing,'completed_cases':list(cases.values()),'failed_attempts':failures,'source_reports':reports,'prior_candidate_evidence':'v027-evidence/gameplay-all.json: caps were verified on63ada6; they are not counted as final-candidate passes','limitations':['Chromium touch emulation, not physical device testing','Pet rebirth NPC progression is covered by world tests; configured cap8 here is not a claimed browser pass']}
(OUT/'acceptance-summary.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'completed_case_count':len(cases),'all_acceptance_passed':not failures,'failed_attempts':len(failures)},indent=2))
