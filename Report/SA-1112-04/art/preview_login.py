"""Composition-only preview. Does not implement or modify the real game's login UI."""
from pathlib import Path
import base64
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[3]
OUTPUT = Path(__file__).resolve().parent / 'login-form-preview.png'
html = '''<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;background:#133c37;font-family:"WenQuanYi Micro Hei",Arial,sans-serif;color:#f9f0cf}.scene{position:relative;width:800px;height:600px;transform:scale(1.6);transform-origin:0 0}.cover{position:absolute;inset:0;width:800px;height:600px}.form{position:absolute;left:478px;top:198px;width:266px;height:313px;background:linear-gradient(140deg,#193f3d99,#0a2b2f55);border:1px solid #b6c99a38;border-radius:20px;box-shadow:0 15px 35px #062a2740;backdrop-filter:blur(5px)}.eyebrow{position:absolute;left:500px;top:210px;font:8px Arial,sans-serif;letter-spacing:1.7px;color:#b8cdb7}.title{position:absolute;left:500px;top:228px;font-size:24px;line-height:28px;font-weight:700;color:#fae8b1}.intro{position:absolute;left:500px;top:259px;font-size:10px;color:#b9d2c4}.label{position:absolute;font-size:10px;letter-spacing:1px;color:#e7d5a4}.account-label{left:500px;top:279px;transform:translateY(-15px);display:none}.password-label{left:500px;top:333px}.input{position:absolute;border:1px solid #9fc1a745;border-radius:8px;background:#0c2b2f99;box-shadow:inset 0 2px 6px #0002;color:#f5f0d7;padding:10px 13px;width:220px;font-size:13px;height:38px;left:500px}.input::placeholder{color:#a3bbac}.account{top:278px}.password{top:350px}.enter{position:absolute;left:500px;top:410px;height:44px;width:220px;border-radius:9px;border:1px solid #f0d69a;background:linear-gradient(#f5dc9e,#d1a969);color:#234439;font-size:14px;font-weight:bold;letter-spacing:3px;box-shadow:0 4px 10px #0b252d66}.links{position:absolute;left:500px;top:475px;width:220px;display:flex;justify-content:space-between;font-size:10px;color:#c7d5bc}.foot{position:absolute;bottom:19px;left:475px;right:44px;text-align:center;color:#b0c8b5;font:8px Arial,sans-serif;letter-spacing:1.5px}.dot{width:5px;height:5px;border-radius:50%;background:#b9cb8c;display:inline-block;box-shadow:0 0 7px #cadf89;margin-right:6px}
</style><div class="scene"><img class="cover" src="ARTURI"><div class="form"></div><div class="eyebrow">RETURN TO YOUR ADVENTURE</div><div class="title">欢迎归来</div><div class="intro">新的冒险，正在等你</div><span class="label account-label">账号</span><input class="input account" placeholder="账号"><span class="label password-label">密码</span><input class="input password" placeholder="输入密码"><button class="enter">进入游戏 &nbsp; →</button><div class="links"><span>注册新账号</span><span>清空</span><span>找回密码</span></div><div class="foot"><span class="dot"></span> THE ISLANDS ARE CALLING</div></div>'''.replace('ARTURI', 'data:image/png;base64,' + base64.b64encode((ROOT/'client/art/login.png').read_bytes()).decode())
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width':1280,'height':960},device_scale_factor=1)
    page.set_content(html)
    page.locator('img').evaluate('(e)=>e.decode()')
    page.screenshot(path=str(OUTPUT))
    browser.close()
print(OUTPUT)
