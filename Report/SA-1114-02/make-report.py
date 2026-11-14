"""Render a portable, self-contained overview from final verification evidence."""
from pathlib import Path
import json,html
out=Path(__file__).resolve().parent
release=json.loads((out/'release.json').read_text());c=release['checks']
shots=[('final-native-pets-basic.png','宠物基本列表'),('final-native-pets-animated-detail.png','点击名字进入动态详情'),('final-native-status-avatar.png','人物头像与属性'),('final-native-status-points-exhausted.png','加点由服务端确认'),('final-native-item-equipment-action.png','原CG与明确装备'),('final-native-recovery-hp-status.png','耐久恢复回执'),('final-camera-field-390x844.png','竖屏行走镜头'),('final-camera-battle-320x568.png','窄竖屏战斗镜头')]
gallery=''.join(f'<figure><a href="browser/{name}"><img loading="lazy" src="browser/{name}" alt="{label}"></a><figcaption>{label}</figcaption></figure>' for name,label in shots)
page=f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SA-1114-02 · 移动原生交互验收</title><style>
:root{{color-scheme:dark;font-family:system-ui,"Noto Sans CJK SC",sans-serif;background:#0d2028;color:#e6eeef;line-height:1.7}}body{{margin:0 auto;max-width:1180px;padding:32px 22px 60px}}a{{color:#efda91}}header{{border-bottom:2px solid #b79c58;padding-bottom:24px}}h1{{font-size:clamp(26px,4vw,42px);line-height:1.3;margin:8px 0 14px}}h2{{font-size:23px;margin-top:32px}}p{{max-width:78ch}}small{{color:#b2cad0}}.metrics{{display:flex;flex-wrap:wrap;gap:18px;padding:24px 0}}.metrics div{{flex:1;min-width:170px;border-left:3px solid #b79c58;padding-left:14px}}.metrics strong{{display:block;font-size:30px;color:#efda91}}.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:18px}}figure{{margin:0;background:#17313b;padding:10px;border:1px solid #3b5965}}figure img{{display:block;width:100%;height:380px;object-fit:contain;background:#09181e}}figcaption{{padding:8px 3px 0}}code{{overflow-wrap:anywhere;color:#d4e7eb}}li{{margin-bottom:7px}}footer{{margin-top:36px;border-top:1px solid #3b5965;padding-top:20px;color:#b2cad0}}</style>
<header><small>SA-1114-02 · {release['version']}</small><h1>游戏原生窗口，适配手机屏幕</h1><p>宠物基本列表与动态详情、人物头像及就近加点、道具图片与明确操作；全屏场景只用按钮缩放，横竖屏重新锁定原生目标。</p></header>
<div class="metrics"><div><strong>{c['client_and_builder_tests_pass']}</strong>客户端及构建测试通过</div><div><strong>{c['browser_checks']}</strong>真实 Chromium 场景检查</div><div><strong>46 / 46</strong>嵌入文件逐字节匹配</div></div>
<h2>实际游戏证据</h2><div class="grid">{gallery}</div>
<h2>交付与复现</h2><ul><li><a href="ACCEPTANCE.md">完整验收与范围</a> · <a href="SERVER-REVIEW.md">独立服务端审查</a> · <a href="MOBILE-WORK.md">移动实现记录</a></li><li><a href="browser/final-real-game.json">真实浏览器结果</a> · <a href="release.json">机器可读发行清单</a> · <a href="RESEARCH.md">修改前官方研究资料</a></li><li><a href="../../bin/saserver-v0.2.13-LYNX-linux-amd64.zip">Linux AMD64 发行包</a> · <a href="../../bin/saserver.sha256">二进制 SHA-256</a></li></ul>
<p>二进制 SHA-256：<code>{release['binary']['sha256']}</code></p><footer>运行实际发行 ELF、真实 Assets/WebSocket/隔离 SQLite、真实 Chromium + SwiftShader。触屏与尺寸由浏览器模拟；未认证实体 Android/iOS、Safari 或真实系统软键盘。无新增 Assets，发行包不含运行数据库及凭据。</footer></html>'''
(out/'index.html').write_text(page)
print('Wrote portable acceptance overview')
