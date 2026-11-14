"""Mark only this task after final browser and delivery evidence exists."""
from pathlib import Path
import hashlib,json,re
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).resolve().parent
for name,count in (('final-primal.json',20),('final-mobile-regression.json',14)):
 b=json.loads((OUT/'browser'/name).read_text());assert not b.get('failure') and not b['errors']
 assert len(b['checks'])==count and all(c['passed'] for c in b['checks'])
 assert b['shutdown']['exit_code']==0 and b['shutdown']['position_matches'] and not b['shutdown']['timed_out']
for name in ('checks-status','package-status','http-status','repeat-build-status','art-repeatability-status'):
 r=json.loads((OUT/(name+'.json')).read_text());assert r['state']=='finished' and (r.get('success') or r.get('exit_code')==0)
p=ROOT/'Prompt/Task-Now.txt';text=p.read_text();assert '[Task No.] " SA-1114-05 "' in text
assert hashlib.sha256(p.read_bytes()).hexdigest()==(OUT/'prompt-input.sha256').read_text().split()[0], 'task changed since input; re-read before marking'
a=text.index('[ 本次的核心任务概述 ]');b=text.index('[ 分工和编排 ]',a)
core=text[a:b];core=core.replace('* [Task 1,','* ✅ [Task 1,');core=re.sub(r'^(\s*-\s+)(?!✅)',r'\1✅ ',core,flags=re.M)
text=text[:a]+core+text[b:]
summary='''1. ✅ 新增萨鲁法斯与克劳德斯，成长与基础总额匹配杨格斯，按防敏／防耐久分配；原生图鉴与ChatGPT／Claude故事完整追加。
2. ✅ 漆黑洞窟17／16层自然叠层保留原敌群，1级有赤爪裂阵；非1级个体及其捕获种子只有攻击、防御。
3. ✅ 赤爪裂阵实现原生槽位四邻、80%普通命中、施放者单次30%–60%防御5回合，以及实际编号150%、防御／石化必命中破防150%、猛毒120%、普通28%–43%条件猛毒。
4. ✅ 追加整次实际HP伤害总额1.8%一次自疗，先合计后取整、限制上限，守护／骑宠实际承伤计入，反射死亡不复活。
5. ✅ 两宠各376帧／八向关节动作、站起扫击／爬行跳刺与红痕、共用24帧特效；逐向原生尺寸／锚点核对，透明图集压缩减小69.6%纹理占用，七文件独立补丁及Linux原子安装脚本。
6. ✅ v0.2.16-LYNX匹配Linux AMD64、内嵌客户端与替换ZIP；客户端／构建220项、Go all／vet／定向race、安装器120项、最终ELF Chromium34项、HTTP／重复构建／隐私审查证据见Report/SA-1114-05。移动为触屏视口模拟，不冒充实体设备认证，艺术动作验收不作绝对完美保证。
'''
a=text.index('(此处你来填写)');b=text.index('[ 开发任务执行的通用规则 ]',a)
text=text[:a]+summary+'\n'+text[b:]
p.write_text(text);(OUT/'prompt-delivered.sha256').write_text(hashlib.sha256(p.read_bytes()).hexdigest()+'  Prompt/Task-Now.txt\n')
print('Task05 marked from accepted final ELF evidence')
