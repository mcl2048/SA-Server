#!/usr/bin/env python3
"""Draw four original cel-shaded mechanical pets and their isolated SA animation pack.

Requires the existing Pillow + Playwright environment, no external artwork/model API.
Default output is /tmp/sa-ai-pets-build/extensions/ai-pets-v1; legacy assets are read-only.
All geometry and poses are editable below; generated hero SVGs live in design/ai-pets.
"""
from __future__ import annotations
import argparse, hashlib, json, math
from pathlib import Path
from PIL import Image, ImageDraw, ImageColor
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
DESIGN = ROOT / 'design/ai-pets'
REPORT = ROOT / 'Report/SA-1113-01/art'
CELL = 160
ACTIONS = [(3,'stand',4,8),(4,'walk',4,5),(0,'attack',5,5),(1,'damage',2,6),(2,'dead',3,8),(6,'hand',2,8),(10,'guard',2,8),(12,'throw',2,6)]
PETS = [(199100,'奥普埃','Opae','owl'),(199101,'克劳德','Claude','crab'),(199102,'格鲁克','Grok','fox'),(199103,'吉米奈','Gemini','raptor')]
INK='#252d34'; DEEP='#353f48'; DARK='#52616d'; STEEL='#8997a3'; LIGHT='#bac6cb'; WHITE='#e1e8e4'; BRASS='#b08a4a'; GOLD='#e0be79'; COPPER='#7f5d3b'; TEAL='#5ad5be'; BLUE='#66b9ff'; ORANGE='#f08a5d'; TWIN_GOLD='#ffd36b'

def n(v): return str(round(v,2)).rstrip('0').rstrip('.') if isinstance(v,float) and '.' in str(round(v,2)) else str(v)
class Draw:
    def __init__(self):self.parts=[]
    def add(self,s):self.parts.append(s)
    def poly(self,points,fill=STEEL,stroke=INK,sw=1.6):
        self.add('<polygon points="'+ ' '.join(f'{n(x)},{n(y)}' for x,y in points)+f'" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" stroke-linejoin="round"/>')
    def path(self,p,fill='none',stroke=INK,sw=1.6):self.add(f'<path d="{p}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" stroke-linejoin="round" stroke-linecap="round"/>')
    def ellipse(self,x,y,rx,ry,fill=STEEL,stroke=INK,sw=1.5):self.add(f'<ellipse cx="{n(x)}" cy="{n(y)}" rx="{n(rx)}" ry="{n(ry)}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')
    def circle(self,x,y,r,fill=BRASS,stroke=INK,sw=1.1):self.ellipse(x,y,r,r,fill,stroke,sw)
    def line(self,x,y,xx,yy,color=LIGHT,sw=1):self.path(f'M{n(x)} {n(y)}L{n(xx)} {n(yy)}','none',color,sw)
    def group(self,t):self.add(f'<g transform="{t}">')
    def end(self):self.add('</g>')
    def rivet(self,x,y,r=1.4):
        self.circle(x,y,r,DEEP,INK,.6);self.line(x-r*.3,y-r*.3,x+r*.35,y-r*.3,LIGHT,.6)
    def core(self,x,y,r,color=TEAL,lit=True):
        self.circle(x,y,r+2,BRASS,INK,1.5);self.circle(x,y,r,DEEP,INK,.8)
        if lit:
            self.poly([(x-r*.65,y),(x,y-r*.7),(x+r*.65,y),(x,y+r*.7)],color,INK,.65)
            self.line(x-r*.3,y-r*.25,x,y-r*.52,WHITE,.8)
        else:self.line(x-r*.5,y,x+r*.5,y,DARK,1.3)
    def plate(self,p,fill=STEEL,hi=True):
        self.poly(p,fill)
        if hi and len(p)>2:self.line(p[0][0]+1,p[0][1]+1,p[1][0]-1,p[1][1]+1,WHITE,.9)
    def hinge(self,x,y,r=4):
        self.circle(x,y,r,BRASS,INK,1.4);self.circle(x,y,r*.48,DEEP,INK,.7);self.line(x-1,y-1,x+1,y+1,LIGHT,.8)
    def piston(self,x,y,xx,yy,width=3):
        self.line(x,y,xx,yy,INK,width+2);self.line(x,y,xx,yy,DARK,width);self.line(x,y,(x+xx)/2,(y+yy)/2,LIGHT,max(1,width-1))
    def gear(self,x,y,r=9,fill=BRASS):
        pts=[]
        for i in range(32):
            rr=r if i%4 in (0,3) else r*.8;theta=i*math.pi/16
            pts.append((x+math.cos(theta)*rr,y+math.sin(theta)*rr))
        self.poly(pts,fill,INK,1.2);self.circle(x,y,r*.57,DEEP,INK,1);self.circle(x,y,r*.24,STEEL,INK,.8)
    def string(self):return ''.join(self.parts)

def pose(action,frame):
    # Anticipation -> extension -> impact -> recoil -> recovery. Limbs, head,
    # tail, wings and plates each receive local motion, not only a root offset.
    p={'body':0,'lean':0,'head':0,'reach':0,'stride':0,'fold':0,'hit':0,'dim':False,'wave':0,'guard':0}
    if action=='stand':p.update(body=[0,-1,0,1][frame],head=[0,-1,0,1][frame],wave=[0,1,0,-1][frame])
    elif action=='walk':p.update(body=[-1,1,-1,1][frame],stride=[-5,0,5,0][frame],head=[1,0,-1,0][frame],wave=[-2,0,2,0][frame])
    elif action=='attack':p.update(body=[2,3,-2,-1,0][frame],lean=[-3,-6,7,3,0][frame],head=[2,3,-3,-1,0][frame],reach=[-5,-9,20,11,0][frame],hit=[0,0,1,1,0][frame],wave=[-4,-7,9,3,0][frame])
    elif action=='damage':p.update(body=[2,1][frame],lean=[-5,-2][frame],head=[4,1][frame],reach=[-4,-2][frame],fold=[2,0][frame])
    elif action=='dead':p.update(body=[7,14,19][frame],head=[6,12,16][frame],fold=[10,19,25][frame],dim=True,reach=[-2,-6,-8][frame])
    elif action=='hand':p.update(wave=[-9,7][frame],reach=[0,3][frame],head=[-2,1][frame])
    elif action=='guard':p.update(body=[3,4][frame],fold=[8,11][frame],guard=[1,2][frame],head=[3,4][frame],reach=[-3,-4][frame])
    elif action=='throw':p.update(body=[2,-1][frame],lean=[-4,4][frame],reach=[-9,18][frame],wave=[-6,8][frame],hit=[0,1][frame])
    return p

def foot(d,x,y,stride=0,reverse=False,small=False):
    w=9 if small else 12;x+=stride
    d.plate([(x-w,y-8),(x+3,y-11),(x+w,y-4),(x+w+3,y+2),(x-w+1,y+4)],DARK)
    d.plate([(x-w+1,y-7),(x+2,y-9),(x+w-1,y-4),(x+1,y-1)],STEEL)
    for k in range(3):
        xx=x-w+2+k*(w*2/3);d.poly([(xx,y),(xx+4,y-1),(xx+5,y+4),(xx+1,y+4)],LIGHT,INK,1)
    d.rivet(x-1,y-5)

def owl(d,view,p):
    front=view<=2;side=view==2;back=view>=3
    body=p['body'];lean=p['lean'];fold=p['fold'];reach=p['reach'];hx=80+(-10 if side else -5 if view in (1,3) else 0)+lean*.4;hy=57+p['head']+body
    width={0:32,1:31,2:25,3:30,4:31}[view]
    # Wide mechanical feather tail, articulated legs and heavy steel talons.
    d.group(f'translate({lean*.3} {body})')
    for i in range(3):d.plate([(69+i*8,106),(77+i*6,108),(89+i*4,126+fold*.15),(72+i*7,122)],COPPER)
    for i,x in enumerate([68,91]):
        stride=p['stride']*(1 if i==0 else -1);d.piston(x,108,x+stride,127-body*.65,4);d.hinge(x,117-body*.5,4);foot(d,x,134-body*.65,stride,small=True)
    d.ellipse(80,97,width,29,DEEP)
    d.plate([(80-width,80),(80-13,72),(80+width-5,78),(80+width,103),(88,121),(64,116),(80-width,99)],STEEL)
    d.poly([(79,78),(80+width-6,81),(80+width-2,101),(87,117),(80,114)],DARK,INK,1)
    # Wings are layered tools/metal feather blades, each folds around a hinge.
    for s in [1,-1]:
        x=80+s*(width-3);angle=s*(-8+p['wave']*.8+fold*.8+reach*.5)
        d.group(f'rotate({angle} {x} 85)')
        d.hinge(x,85,5)
        for i in range(4):
            top=87+i*5;outer=x+s*(14-i*1.7)
            d.plate([(x-s*3,top-2),(outer,top),(outer+s*2,top+13),(x+s*2,top+18)],STEEL if i%2==0 else DARK)
            d.line(x+s*3,top+3,outer,top+7,LIGHT,.8)
        d.end()
    for yy in [91,100,109]:d.line(66,yy,86,yy-3,COPPER,2)
    if back:
        d.gear(80,98,12);d.plate([(66,79),(89,76),(98,89),(84,88)],DARK)
        for x in [62,99]:d.rivet(x,96)
    else:d.core(79,99,8,TEAL,not p['dim'])
    d.end()
    # Angular horn/feather head, deep lens brows and a small bronze beak.
    d.plate([(hx-29,hy-9),(hx-34,hy-28),(hx-16,hy-21),(hx-4,hy-24),(hx+13,hy-19),(hx+28,hy-27),(hx+30,hy-7),(hx+23,hy+21),(hx,hy+29),(hx-26,hy+18)],DARK)
    for s in [-1,1]:
        d.plate([(hx+s*17,hy-18),(hx+s*31,hy-30),(hx+s*26,hy-9),(hx+s*8,hy-8)],STEEL)
        d.line(hx+s*20,hy-17,hx+s*27,hy-26,WHITE,1)
    if back:
        d.plate([(hx-23,hy-9),(hx,hy-17),(hx+23,hy-8),(hx+20,hy+17),(hx,hy+24),(hx-22,hy+15)],STEEL)
        d.plate([(hx-4,hy-14),(hx+6,hy-13),(hx+10,hy+20),(hx-3,hy+22)],DARK)
        for yy in [hy-3,hy+5,hy+13]:d.line(hx-15,yy,hx-7,yy-1,DEEP,2);d.line(hx+12,yy,hx+19,yy-1,DEEP,2)
        d.hinge(hx,hy+8,4)
    else:
        for s in [-1,1]:
            if side and s==1:continue
            ex=hx+s*(12 if not side else 2);ry=10 if side else 12;rx=10 if side else 12
            d.poly([(ex-rx-3,hy-8),(ex+rx-1,hy-13),(ex+rx+2,hy+11),(ex-3,hy+17),(ex-rx-4,hy+8)],COPPER)
            d.core(ex,hy+2,ry-2,TEAL,not p['dim'])
            d.plate([(ex-rx-4,hy-8),(ex+rx-2,hy-13),(ex+rx+1,hy-7),(ex-rx,hy-2)],LIGHT)
        beakx=hx-13 if side else hx
        d.poly([(beakx-5,hy+10),(beakx+5,hy+9),(beakx+1,hy+24),(beakx-7,hy+18)],BRASS)
        d.line(beakx-4,hy+12,beakx+1,hy+11,GOLD,.8)
    for x,y in [(hx-24,hy+12),(hx+23,hy+12),(hx-18,hy-17),(hx+17,hy-16)]:d.rivet(x,y)

def crab(d,view,p):
    side=view==2;back=view>=3;front=view<=1
    bob=p['body'];fold=p['fold'];lean=p['lean']*.4;reach=p['reach'];shellx=88+(8 if side else 0);shelly=70+bob
    # Six independently jointed legs walk in alternating tripods.
    for i in range(3):
        for s in [-1,1]:
            phase=p['stride']*((-1)**(i+(s>0)));x=78+s*(20+i*5);y=101+i*7
            xx=x+s*(15-i*3)+phase;yy=123+i*4+fold*.15
            d.piston(x,y,xx,y+8,3);d.hinge(xx,y+8,3.3);d.piston(xx,y+8,xx+s*7,yy,3)
            d.poly([(xx+s*7,yy-2),(xx+s*14,yy+5),(xx+s*2,yy+6)],DARK,INK,1.4)
    # Faceted cast-steel spiral shell, braces and exposed winding gear.
    d.plate([(shellx-26,shelly-30),(shellx-8,shelly-42),(shellx+19,shelly-36),(shellx+34,shelly-18),(shellx+33,shelly+9),(shellx+15,shelly+30),(shellx-11,shelly+29),(shellx-30,shelly+10),(shellx-34,shelly-9)],DARK)
    d.plate([(shellx-25,shelly-27),(shellx-6,shelly-37),(shellx+16,shelly-31),(shellx+28,shelly-15),(shellx+25,shelly+6),(shellx+10,shelly+22),(shellx-12,shelly+21),(shellx-26,shelly+7)],'#8f9aa6')
    d.poly([(shellx+18,shelly-30),(shellx+28,shelly-15),(shellx+25,shelly+6),(shellx+10,shelly+22),(shellx+2,shelly+16),(shellx+13,shelly+4)],'#6b7682',INK,1)
    d.path(f'M{shellx-21} {shelly+10} C{shellx-38} {shelly-13} {shellx-9} {shelly-38} {shellx+14} {shelly-18} C{shellx+35} {shelly+2} {shellx+3} {shelly+24} {shellx-9} {shelly+7} C{shellx-20} {shelly-8} {shellx+7} {shelly-16} {shellx+8} {shelly-1} C{shellx+7} {shelly+7} {shellx-1} {shelly+8} {shellx-2} {shelly+1}', 'none',INK,6)
    d.path(f'M{shellx-21} {shelly+8} C{shellx-36} {shelly-14} {shellx-9} {shelly-35} {shellx+13} {shelly-17} C{shellx+31} {shelly+1} {shellx+3} {shelly+20} {shellx-8} {shelly+6} C{shellx-17} {shelly-7} {shellx+6} {shelly-13} {shellx+6} {shelly-1}', 'none',BRASS,3)
    for x,y in [(-21,-24),(17,-26),(27,-7),(16,17),(-19,16)]:d.rivet(shellx+x,shelly+y,1.6)
    d.gear(shellx+27,shelly+17,10);d.core(shellx-2,shelly+1,7,ORANGE,not p['dim'])
    if not p['dim']:
        d.circle(shellx-2,shelly+1,4.1,ORANGE,INK,.6);d.line(shellx-4,shelly-1,shellx-1,shelly-3,'#ffcd9d',1.5)
    # Armoured low chassis and a forward orange heart, not a humanoid torso.
    d.group(f'translate({lean} {bob})')
    d.plate([(48,91),(68,84),(101,87),(111,105),(95,120),(60,119),(43,107)],DARK)
    d.plate([(48,91),(68,88),(99,91),(99,103),(61,108),(44,102)],'#8f9aa6')
    if not back:d.core(69 if side else 77,105,7,ORANGE,not p['dim'])
    else:
        d.plate([(64,95),(97,94),(100,111),(67,115)],STEEL)
        for i in range(4):d.line(70+i*6,99,71+i*6,109,DEEP,2)
    # Eye stalks look forward or turn into rear sensor housings.
    for s in [-1,1]:
        ex=(57 if s<0 else 86)+(-8 if side else 0);ey=81+p['head']
        d.piston(ex+4,96,ex,ey,3)
        d.plate([(ex-7,ey-7),(ex+7,ey-8),(ex+10,ey+2),(ex+4,ey+7),(ex-7,ey+4)],STEEL)
        if not back:d.core(ex-1,ey,3,ORANGE,not p['dim'])
        else:d.line(ex-3,ey-2,ex+4,ey-2,DEEP,2)
    d.end()
    # Distinct horizontal crab pincers: lower jaw opens while the upper hooks.
    for s in [1,-1]:
        x=80+s*(39 if not side else 28);y=104+bob
        if side and s>0:y-=10
        d.piston(80+s*22,101+bob,x,y-6,5);d.hinge(x,y-6,5)
        rotation=s*(p['wave']*.6-fold*.45)+(-p['reach']*.65 if s<0 else p['reach']*.35)
        d.group(f'rotate({rotation} {x} {y})')
        xx=x+s*(8+max(0,reach)*.35);op=4+(5 if p['hit'] else 0)
        d.plate([(x-s*2,y-8),(xx+s*14,y-11),(xx+s*22,y-3-op),(xx+s*9,y-4),(xx+s*7,y+5),(x+s*2,y+7)],BRASS)
        d.plate([(x+s*1,y+6),(xx+s*8,y+4),(xx+s*18,y+7+op),(xx+s*9,y+13),(x-s*3,y+11)],STEEL)
        d.line(x+s*5,y-7,xx+s*11,y-8,GOLD,1)
        d.rivet(x+s*2,y-1,1.6);d.end()

def fox(d,view,p):
    side=view==2;back=view>=3;bob=p['body'];fold=p['fold'];lean=p['lean'];reach=p['reach'];hx=59+(-10 if side else 1 if view==0 else -2)+lean*.45;hy=65+p['head']+bob
    # Segmented dragon tail bends independently; silhouette stays low and quick.
    tailbase=(103,96+bob);tip=(139,71+bob+p['wave']*1.2+fold*.45)
    d.path(f'M{tailbase[0]} {tailbase[1]} Q133 107 {tip[0]} {tip[1]}','none',INK,15)
    d.path(f'M{tailbase[0]} {tailbase[1]} Q133 107 {tip[0]} {tip[1]}','none',DARK,11)
    for x,y in [(116,96+bob),(127,92+bob),(134,84+bob)]:d.plate([(x-4,y-5),(x+5,y-6),(x+6,y+5),(x-3,y+6)],STEEL)
    d.plate([(134,79+bob+p['wave']*.7),(143,66+bob+p['wave']),(145,83+bob+p['wave']*.4),(138,90+bob)],LIGHT)
    # Near/far legs alternate in a four-legged walk; joint motion is local.
    for far in [True,False]:
        for i,x in enumerate([56,101]):
            xx=x+(7 if far else 0);y=111+(0 if far else 9)+fold*.25
            stride=p['stride']*((-1)**(i+far));d.piston(xx,95+bob,xx-3+stride,117,4);d.hinge(xx-3+stride,117,4)
            foot(d,xx-3,y+12,stride,small=True)
        if far:
            d.plate([(55,79+bob),(86,73+bob),(111,83+bob),(113,102+bob),(92,117+bob),(57,109+bob),(45,94+bob)],DARK)
            d.plate([(56,78+bob),(82,76+bob),(96,85+bob),(88,104+bob),(60,105+bob),(45,93+bob)],STEEL)
            d.plate([(88,78+bob),(109,84+bob),(113,99+bob),(95,110+bob),(87,103+bob)],LIGHT)
            for i in range(3):d.plate([(75+i*9,77+bob),(81+i*9,69+bob),(86+i*9,80+bob)],DARK)
            d.line(58,96+bob,85,100+bob,TEAL,2);d.line(89,95+bob,104,91+bob,TEAL,2)
            d.gear(96,99+bob,7)
    # Two wing-like ears and one faceted, elongated fox/dragon muzzle.
    d.plate([(hx-21,hy-5),(hx-25,hy-35),(hx-9,hy-24),(hx+6,hy-27),(hx+21,hy-39),(hx+22,hy-8),(hx+28,hy+9),(hx+16,hy+27),(hx-7,hy+26),(hx-26,hy+12)],DARK)
    for s in [-1,1]:
        x=hx+s*16;d.plate([(x-s*8,hy-14),(x+s*9,hy-36),(x+s*6,hy-8)],LIGHT)
        d.poly([(x-s*3,hy-13),(x+s*5,hy-29),(x+s*3,hy-9)],TEAL if not p['dim'] else DARK,INK,.9)
    if back:
        d.plate([(hx-20,hy-8),(hx,hy-18),(hx+19,hy-7),(hx+20,hy+15),(hx+1,hy+24),(hx-20,hy+13)],STEEL)
        for yy in [0,7,14]:d.plate([(hx-8,hy+yy-6),(hx+5,hy+yy-8),(hx+8,hy+yy-2),(hx-6,hy+yy)],DARK)
        d.rivet(hx-15,hy+9);d.rivet(hx+15,hy+9)
    else:
        d.plate([(hx-20,hy-5),(hx-3,hy-14),(hx+17,hy-7),(hx+20,hy+11),(hx+4,hy+19),(hx-19,hy+12)],LIGHT)
        eyes=[hx-10,hx+11] if not side else [hx-7]
        for ex in eyes:
            d.poly([(ex-8,hy-3),(ex+5,hy-7),(ex+7,hy+2),(ex-6,hy+6)],DEEP)
            d.line(ex-5,hy+1,ex+3,hy-1,TEAL if not p['dim'] else DARK,2.8)
            d.plate([(ex-9,hy-6),(ex+5,hy-10),(ex+7,hy-6),(ex-5,hy-2)],STEEL)
        mx=hx-15 if side else hx-5
        d.plate([(mx-10,hy+7),(mx+6,hy+5),(mx+18,hy+15),(mx+10,hy+23),(mx-9,hy+22),(mx-19,hy+17)],STEEL)
        d.poly([(mx-18,hy+12),(mx-8,hy+11),(mx-8,hy+17),(mx-16,hy+18)],INK)
        d.line(mx-10,hy+22,mx+10,hy+20,DEEP,1.5)
        d.core(hx+10,hy+12,3,TEAL,not p['dim'])
    # Retractable forearm blade sweeps forward during attack/throw.
    x=48+lean*.3;yy=111+bob;d.group(f'rotate({-reach*1.25+fold*.7} {x} {yy-12})')
    d.plate([(x-4,yy-13),(x+4,yy-14),(x+7,yy+8),(x-2,yy+13)],STEEL)
    d.plate([(x-3,yy-2),(x-15,yy+11+max(0,reach)*.5),(x+3,yy+5)],LIGHT)
    d.line(x-4,yy+2,x-11,yy+8,TEAL,1);d.end()

def raptor(d,view,p):
    side=view==2;back=view>=3;front=view==0;bob=p['body'];fold=p['fold'];lean=p['lean'];reach=p['reach'];hx=62+(-13 if side else 0 if front else -5)+lean*.5;hy=47+bob+p['head']
    # High counterbalanced body and long plated tail distinguish it from fox.
    d.path(f'M98 {95+bob} Q122 {108+bob} 144 {119+p["wave"]*.8}','none',INK,15)
    d.path(f'M98 {95+bob} Q122 {108+bob} 144 {119+p["wave"]*.8}','none',DARK,11)
    for i in range(5):
        x=105+i*8;y=100+i*4+bob*.3+p['wave']*.06*i
        d.plate([(x-3,y-6),(x+5,y-5),(x+7,y+5),(x-1,y+5)],STEEL)
        if i%2==0:d.poly([(x+1,y-5),(x+5,y-13),(x+9,y-5)],BRASS)
    d.poly([(141,112+p['wave']*.8),(155,119+p['wave']*.8),(140,125+p['wave']*.8)],LIGHT)
    # Thigh armour, exposed pistons, claw feet with lifted second toe.
    for far in [True,False]:
        x=87+(12 if far else -2);stride=p['stride']*(-1 if far else 1);y=101+bob
        d.plate([(x-10,y-7),(x+8,y-8),(x+13,y+8),(x+2,y+19),(x-12,y+10)],DARK if far else STEEL)
        d.hinge(x+2,y+9,5);d.piston(x+3,y+12,x-8+stride,128,5)
        foot(d,x-9+(5 if far else 0),134+(0 if far else 2),stride)
        d.poly([(x-16+stride,132),(x-20+stride,123),(x-11+stride,130)],BRASS)
        if far:
            d.plate([(69,73+bob),(91,72+bob),(108,89+bob),(101,107+bob),(83,118+bob),(64,103+bob),(58,87+bob)],DARK)
            d.plate([(68,75+bob),(85,72+bob),(96,84+bob),(90,103+bob),(77,109+bob),(63,98+bob)],STEEL)
            d.plate([(88,77+bob),(106,90+bob),(101,104+bob),(91,110+bob),(88,101+bob)],LIGHT)
            d.plate([(63,82+bob),(85,79+bob),(93,96+bob),(72,102+bob),(62,94+bob)],DEEP)
            d.core(71,90+bob,4.8,BLUE if p['hit']<1 else TWIN_GOLD,not p['dim'])
            d.core(84,88+bob,4.8,TWIN_GOLD if p['hit']<1 else BLUE,not p['dim'])
            for yy in [95,102]:d.line(93,yy+bob,99,yy-3+bob,DEEP,2)
    # Stacked vertebrae carry the head; brass braces are physical metal, not glow UI.
    d.plate([(63,90+bob),(74,79+bob),(72,60+bob),(60,55+bob),(53,72+bob)],DEEP)
    for i in range(4):
        y=61+i*7+bob;d.plate([(54,y),(67,y-3),(73,y+3),(59,y+7)],STEEL if i%2==0 else DARK)
        d.line(57,y+2,65,y,BRASS,1.2)
    # Single head, twin core motif (forehead plus chest), blade horns and jaw.
    d.plate([(hx-20,hy-9),(hx-18,hy-23),(hx+1,hy-29),(hx+22,hy-20),(hx+28,hy-4),(hx+19,hy+15),(hx-10,hy+21),(hx-29,hy+10)],DARK)
    for i in range(3):d.plate([(hx+8+i*5,hy-17+i*7),(hx+31+i*3,hy-24+i*7),(hx+21+i*3,hy-10+i*7)],STEEL if i%2==0 else DARK)
    if back:
        d.plate([(hx-19,hy-12),(hx-1,hy-23),(hx+17,hy-14),(hx+19,hy+6),(hx-1,hy+15),(hx-19,hy+7)],STEEL)
        d.plate([(hx-3,hy-22),(hx+5,hy-19),(hx+9,hy+12),(hx-1,hy+15)],DARK)
        for yy in [hy-5,hy+2,hy+9]:d.line(hx-14,yy,hx-6,yy-2,DEEP,2)
    else:
        d.plate([(hx-18,hy-13),(hx-2,hy-21),(hx+17,hy-11),(hx+12,hy+5),(hx-11,hy+10)],STEEL)
        eye_x=hx-10 if side else hx-9
        d.poly([(eye_x-7,hy-3),(eye_x+7,hy-6),(eye_x+5,hy+3),(eye_x-7,hy+5)],DEEP)
        d.line(eye_x-4,hy,eye_x+4,hy-1,GOLD if not p['dim'] else DARK,2.4)
        if front:
            d.poly([(hx+7,hy-5),(hx+18,hy-1),(hx+16,hy+7),(hx+7,hy+3)],DEEP);d.line(hx+9,hy,hx+15,hy+2,BLUE,2)
        mx=hx-21 if side else hx-11
        d.plate([(mx-11,hy+5),(mx+12,hy+1),(mx+23,hy+10),(mx+14,hy+21),(mx-12,hy+23),(mx-18,hy+16)],LIGHT)
        d.plate([(mx-14,hy+19),(mx+12,hy+17),(mx+20,hy+12),(mx+16,hy+24),(mx-8,hy+28)],DARK)
        for i in range(3):d.poly([(mx-7+i*6,hy+19),(mx-3+i*6,hy+19),(mx-4+i*6,hy+23)],WHITE,INK,.5)
        d.rivet(mx-11,hy+10);d.core(hx+1,hy-13,4,TWIN_GOLD if p['hit']==0 else BLUE,not p['dim'])
    # Paired claw arms alternate extension and retract into a compact guard.
    for s in [1,-1]:
        x=73+s*16;y=85+bob;angle=s*(8+fold)-reach*(1 if s<0 else .6)+p['wave']*.5
        d.group(f'rotate({angle} {x} {y})');d.hinge(x,y,4)
        d.piston(x,y,x-6,104+bob,4);d.plate([(x-10,99+bob),(x,98+bob),(x+2,110+bob),(x-7,114+bob)],STEEL)
        for i in range(2):d.poly([(x-8+i*6,109+bob),(x-7+i*6,120+bob),(x-1+i*6,112+bob)],BRASS if p['hit'] and i==0 else LIGHT)
        d.end()

def beast_front(d,kind,back,p):
    """Dedicated head-on/rear construction; never a compressed side silhouette."""
    foxlike=kind=='fox';bob=p['body'];fold=p['fold'];reach=p['reach'];stride=p['stride']
    base=108 if foxlike else 101
    # Tail recedes between the legs, with the back view showing its articulated plates.
    if back:
        ty=113+bob*.3
        d.path(f'M80 {base-12+bob}Q91 123 80 145','none',INK,12)
        d.path(f'M80 {base-12+bob}Q91 123 80 145','none',DARK,8)
        for i in range(4):d.plate([(76,ty+i*7),(84,ty+i*7-1),(86,ty+i*7+5),(77,ty+i*7+7)],STEEL)
        d.poly([(77,143),(80,151),(86,143)],LIGHT)
    # Paired feet and independent alternating knee pistons.
    for s in [-1,1]:
        x=80+s*(20 if foxlike else 17);st=stride*s
        d.plate([(x-8,base-10+bob),(x+8,base-11+bob),(x+10,base+4+bob),(x,base+11+bob),(x-9,base+4+bob)],DARK)
        d.hinge(x,base+4+bob,4);d.piston(x,base+6+bob,x+st,128,4);foot(d,x,135,st,small=foxlike)
    # Two symmetrical shoulder/body faces, clearly facing the viewer.
    d.plate([(56,76+bob),(80,69+bob),(104,76+bob),(108,98+bob),(96,116+bob),(66,116+bob),(52,98+bob)],DARK)
    d.plate([(57,78+bob),(78,74+bob),(77,111+bob),(64,108+bob),(55,95+bob)],STEEL)
    d.plate([(82,74+bob),(102,79+bob),(105,96+bob),(95,110+bob),(82,113+bob)],LIGHT)
    if back:
        for i in range(5):
            yy=77+i*7+bob;d.plate([(76,yy),(83,yy-3),(87,yy+3),(79,yy+7),(74,yy+4)],DEEP if i%2 else STEEL)
        for s in [-1,1]:
            for yy in [87,95,103]:d.line(80+s*12,yy+bob,80+s*19,yy-3+bob,DEEP,1.6)
    elif foxlike:
        d.poly([(80,83+bob),(87,94+bob),(81,106+bob),(73,94+bob)],TEAL if not p['dim'] else DEEP)
    else:
        d.plate([(64,82+bob),(94,82+bob),(98,101+bob),(64,103+bob)],DEEP)
        d.core(72,92+bob,5,BLUE if not p['hit'] else TWIN_GOLD,not p['dim']);d.core(89,92+bob,5,TWIN_GOLD if not p['hit'] else BLUE,not p['dim'])
    # Forelimbs/counterweight blades pivot about shoulders during attack and guard.
    for s in [-1,1]:
        x=80+s*24;y=84+bob
        angle=s*(fold*.6-reach*.8+p['wave']*.5)
        d.group(f'rotate({angle} {x} {y})');d.hinge(x,y,4)
        d.piston(x,y,x+s*5,109+bob,4)
        d.plate([(x+s*1,101+bob),(x+s*10,102+bob),(x+s*11,115+bob),(x+s*2,118+bob)],STEEL)
        for j in range(2):d.poly([(x+s*(2+j*5),114+bob),(x+s*(3+j*5),125+bob),(x+s*(7+j*5),117+bob)],LIGHT)
        d.end()
    hy=(57 if foxlike else 45)+p['head']+bob
    if foxlike:
        d.plate([(52,hy-5),(50,hy-34),(67,hy-21),(80,hy-26),(94,hy-22),(110,hy-34),(108,hy-3),(111,hy+16),(95,hy+29),(66,hy+29),(49,hy+14)],DARK)
        for s in [-1,1]:
            x=80+s*22;d.plate([(x-s*8,hy-15),(x+s*8,hy-31),(x+s*7,hy-7)],LIGHT)
            d.poly([(x-s*3,hy-13),(x+s*4,hy-26),(x+s*3,hy-10)],TEAL if not p['dim'] else DARK,INK,.8)
    else:
        d.plate([(52,hy-10),(55,hy-22),(80,hy-29),(104,hy-21),(110,hy-9),(105,hy+17),(91,hy+26),(67,hy+26),(52,hy+13)],DARK)
        for s in [-1,1]:
            d.plate([(80+s*13,hy-17),(80+s*34,hy-24),(80+s*27,hy-7),(80+s*17,hy-5)],LIGHT)
    d.plate([(56,hy-8),(80,hy-19),(104,hy-7),(102,hy+17),(81,hy+25),(57,hy+16)],STEEL)
    if back:
        d.plate([(75,hy-18),(84,hy-17),(88,hy+22),(76,hy+24)],DEEP)
        for s in [-1,1]:
            for yy in [-1,6,13]:d.line(80+s*11,hy+yy,80+s*20,hy+yy-3,DEEP,1.8)
        d.hinge(80,hy+9,4)
    else:
        for s in [-1,1]:
            x=80+s*15
            d.poly([(x-9,hy-1),(x+7,hy-4),(x+9,hy+5),(x-6,hy+8)],DEEP)
            d.line(x-5,hy+3,x+4,hy+1,(TEAL if foxlike else BLUE if s<0 else TWIN_GOLD) if not p['dim'] else DARK,2.7)
            d.plate([(x-11,hy-6),(x+6,hy-9),(x+9,hy-5),(x-5,hy-1)],LIGHT)
        d.plate([(64,hy+11),(80,hy+6),(97,hy+12),(96,hy+23),(80,hy+29),(64,hy+22)],LIGHT)
        d.poly([(74,hy+11),(85,hy+11),(84,hy+18),(77,hy+19)],INK)
        d.line(68,hy+23,80,hy+25,DEEP,1.2);d.line(80,hy+25,92,hy+23,DEEP,1.2)
        if not foxlike:d.core(80,hy-13,4,TWIN_GOLD if not p['hit'] else BLUE,not p['dim'])
    for x,y in [(59,hy+10),(101,hy+10),(60,86+bob),(100,86+bob)]:d.rivet(x,y)


def svg(kind,dir,action='stand',frame=0):
    view=dir if dir<=4 else 8-dir
    p=pose(action,frame);d=Draw()
    # Clear grounded shadows only, no baked rectangular backgrounds or UI.
    d.ellipse(80,139,43 if kind=='crab' else 30,6,'#17212780','none',0)
    if dir>4:d.group('translate(160 0) scale(-1 1)')
    beast_straight=kind in ('fox','raptor') and view in (0,4)
    if view==0 and not beast_straight:d.group('translate(17 0) scale(.79 1)')
    elif view==4 and not beast_straight:d.group('translate(13 0) scale(.84 1)')
    # Dedicated front/rear quadruped/biped drawings remove the side-facing
    # muzzle and tail; quarter views retain dimensional near/far armour.
    if beast_straight:beast_front(d,kind,view==4,p)
    else:{'owl':owl,'crab':crab,'fox':fox,'raptor':raptor}[kind](d,view,p)
    if view in (0,4) and not beast_straight:d.end()
    if dir>4:d.end()
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><title>Original {kind}: direction {dir}, {action}, frame {frame}</title>{d.string()}</svg>'

def raster_svgs(items,output,cols=12):
    # Chromium rasterizes original SVG geometry in a single sheet. 2x rendering
    # and a controlled fixed cel palette keep narrow steel glints readable.
    rows=math.ceil(len(items)/cols);width=cols*CELL;height=rows*CELL
    body=[]
    for i,code in enumerate(items):
        code=code.replace('<svg ',f'<svg x="{i%cols*CELL}" y="{i//cols*CELL}" ',1)
        body.append(code)
    sheet=f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}">'+''.join(body)+'</svg>'
    with sync_playwright() as pw:
        browser=pw.chromium.launch(args=['--disable-dev-shm-usage'])
        page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=2)
        page.set_content('<html><style>*{margin:0}body{background:transparent}</style>'+sheet+'</html>',wait_until='load')
        page.screenshot(path=str(output),omit_background=True,full_page=True)
        browser.close()
    image=Image.open(output).convert('RGBA').resize((width,height),Image.Resampling.LANCZOS)
    # Flat rendering only, no gradients. Quantization avoids soft 3D-looking
    # interpolation at sprite size while preserving thin anti-aliased contours.
    # Explicit palette protects tiny, intentional orange/blue/gold cores from
    # being erased as statistically rare colors by atlas-wide median-cut.
    colors=[]
    for color in [INK,DEEP,DARK,STEEL,LIGHT,WHITE,BRASS,GOLD,COPPER,TEAL,BLUE,ORANGE,TWIN_GOLD,'#8f9aa6','#6b7682','#c0c9d1','#ffcd9d']:
        rgb=ImageColor.getrgb(color);colors.append(rgb)
        for target in [ImageColor.getrgb(INK),ImageColor.getrgb(WHITE)]:
            for fraction in [.2,.4,.6,.8]:colors.append(tuple(round(a*(1-fraction)+b*fraction) for a,b in zip(rgb,target)))
    palette=Image.new('P',(1,1));colors=colors[:256];palette.putpalette([c for rgb in colors for c in rgb]+[0]*(768-len(colors)*3))
    alpha=image.getchannel('A');rgb=image.convert('RGB').quantize(palette=palette,dither=Image.Dither.NONE).convert('RGB');image=rgb.convert('RGBA');image.putalpha(alpha);image.save(output,optimize=True)
    return image

def make_preview():
    DESIGN.mkdir(parents=True,exist_ok=True);REPORT.mkdir(parents=True,exist_ok=True)
    items=[]
    for id,cn,en,kind in PETS:
        code=svg(kind,1);(DESIGN/f'{id}-{kind}.svg').write_text(code+'\n');items.append(code)
    raw=raster_svgs(items,REPORT/'hero-sprites.png',cols=4)
    sheet=Image.new('RGB',(1120,410),'#d6cfb7');d=ImageDraw.Draw(sheet)
    for i,(id,cn,en,kind) in enumerate(PETS):
        cell=raw.crop((i*160,0,(i+1)*160,160));big=cell.resize((280,280),Image.Resampling.NEAREST);sheet.paste(big,(i*280,58),big)
        d.text((i*280+16,18),f'{id} / {en}',fill=INK);d.text((i*280+16,354),{'owl':'Layered observer / steel + bronze','crab':'Clockwork shell / coral core','fox':'Fox-dragon / cyan seam armour','raptor':'Twin cores / blue + gold'}[kind],fill=INK)
    sheet.save(REPORT/'four-pet-concepts.png')
    views=[]
    for _,_,_,kind in PETS:
        views.extend(svg(kind,d) for d in range(8))
    raw=raster_svgs(views,REPORT/'direction-sprites.png',cols=8)
    paper=Image.new('RGB',(1280,704),'#d6cfb7');paper.paste(raw,(0,48),raw);draw=ImageDraw.Draw(paper)
    for i in range(8):draw.text((i*160+55,15),f'DIR {i}',fill=INK)
    paper.save(REPORT/'eight-direction-concepts.png')
    print('Preview ready:',REPORT/'four-pet-concepts.png',flush=True)

def generate(output):
    output=output.resolve();assert output.name=='ai-pets-v1' and output.parent.name=='extensions'
    output.mkdir(parents=True,exist_ok=True);(output/'pages').mkdir(exist_ok=True);(output/'anim').mkdir(exist_ok=True)
    manifest={'format':1,'id':'ai-pets-v1','pages':[],'images':[],'animations':[]};nextimage=9000000
    for page_index,(id,cn,en,kind) in enumerate(PETS):
        items=[];acts=[]
        for direction in range(8):
            for type,name,count,ticks in ACTIONS:
                frames=[]
                for frame in range(count):
                    ix=len(items);items.append(svg(kind,direction,name,frame));frames.append([nextimage,0,0,0]);manifest['images'].append([nextimage,page_index,(ix%12)*CELL,(ix//12)*CELL,CELL,CELL,-80,-140]);nextimage+=1
                acts.append({'dir':direction,'type':type,'ticks':ticks,'frames':frames})
        assert len(items)==192
        file=f'pages/{page_index:05d}.png';raster_svgs(items,output/file,cols=12)
        # Exact power-of-two width makes the pack easy to inspect/load; no page
        # exceeds the 4096 pixel hardware/validator limit.
        original=Image.open(output/file);page=Image.new('RGBA',(2048,2560));page.paste(original,(0,0));page.save(output/file,optimize=True)
        manifest['pages'].append({'file':file,'width':2048,'height':2560})
        anim={'id':id,'actions':acts,'pages':[f'ai-pets-v1/{page_index}']}
        (output/f'anim/{id}.json').write_text(json.dumps(anim,separators=(',',':'))+'\n')
        manifest['animations'].append({'id':id,'file':f'anim/{id}.json'})
        # Eight actions, sampled at the most informative frames, at 2x scale.
        sample=Image.new('RGB',(1280,360),'#d6cfb7');dr=ImageDraw.Draw(sample)
        for k,(type,name,count,ticks) in enumerate(ACTIONS):
            ix=24+sum(x[2] for x in ACTIONS[:k])+ (2 if name=='attack' else count-1 if name=='dead' else 1)
            cell=page.crop((ix%12*160,ix//12*160,ix%12*160+160,ix//12*160+160));large=cell.resize((160,160),Image.Resampling.NEAREST)
            sample.paste(large,(k*160,40),large);dr.text((k*160+16,12),name.upper(),fill=INK)
            if name=='attack':
                for fr in range(count):
                    q=24+sum(x[2] for x in ACTIONS[:k])+fr;c=page.crop((q%12*160,q//12*160,q%12*160+160,q//12*160+160));sample.paste(c,(fr*160+240,196),c)
        sample.save(REPORT/f'{id}-actions.png')
        print(f'Generated {id} / {kind}: 192 frames',flush=True)
    (output/'manifest.json').write_text(json.dumps(manifest,separators=(',',':'))+'\n')
    make_motion_proofs(output)
    validate(output)


def make_motion_proofs(output):
    pages=[Image.open(output/f'pages/{i:05d}.png').convert('RGBA') for i in range(4)]
    for name,count,start in [('walk',4,4),('attack',5,8),('dead',3,15)]:
        frames=[]
        for f in range(count):
            sheet=Image.new('RGB',(800,234),'#d6cfb7');dr=ImageDraw.Draw(sheet)
            for i,(_,_,en,_) in enumerate(PETS):
                ix=24+start+f;cell=pages[i].crop((ix%12*160,ix//12*160,ix%12*160+160,ix//12*160+160))
                sheet.paste(cell,(i*200+20,38),cell);dr.text((i*200+18,15),en+' / '+name.upper(),fill=INK)
            frames.append(sheet)
        frames[0].save(REPORT/f'{name}-motion.gif',save_all=True,append_images=frames[1:],duration=[140]*(count-1)+[300],loop=0,disposal=2)


def validate(output):
    manifest=json.loads((output/'manifest.json').read_text());ids=set();hashes={};framehashes={}
    assert manifest['format']==1 and manifest['id']=='ai-pets-v1'
    for p in manifest['pages']:
        im=Image.open(output/p['file']);assert im.size==(p['width'],p['height']);assert im.mode=='RGBA';assert max(im.size)<=4096
        hashes[p['file']]=hashlib.sha256((output/p['file']).read_bytes()).hexdigest()
    for id,page,x,y,w,h,ox,oy in manifest['images']:
        assert id not in ids and 9000000<=id<9100000;ids.add(id);assert w==h==160 and ox==-80 and oy==-140
        assert min(x,y)>=0 and x+w<=manifest['pages'][page]['width'] and y+h<=manifest['pages'][page]['height']
    for e in manifest['animations']:
        a=json.loads((output/e['file']).read_text());pairs=set();frames=0;unique=set();pages={};boxes=[];action_uniques=[]
        for ac in a['actions']:
            key=(ac['dir'],ac['type']);assert key not in pairs;pairs.add(key);assert ac['ticks']>0;local_unique=set()
            for f in ac['frames']:
                assert f[0] in ids and f[1:]==[0,0,0];frames+=1
                row=next(i for i in manifest['images'] if i[0]==f[0]);_,pi,x,y,w,h,_,_=row
                if pi not in pages:pages[pi]=Image.open(output/manifest['pages'][pi]['file'])
                cell=pages[pi].crop((x,y,x+w,y+h));digest=hashlib.sha256(cell.tobytes()).hexdigest();unique.add(digest);local_unique.add(digest)
                bbox=cell.getchannel('A').point(lambda v:255 if v>=128 else 0).getbbox();assert bbox is not None
                # Opaque geometry touching a cell edge indicates visible clipping.
                assert bbox[0]>0 and bbox[1]>0 and bbox[2]<160 and bbox[3]<160,(e['id'],key,f[0],bbox)
                boxes.append(bbox)
            assert len(local_unique)>1,(e['id'],key,'static action');action_uniques.append(len(local_unique))
        assert pairs=={(d,a[0]) for d in range(8) for a in ACTIONS};assert frames==192
        framehashes[str(e['id'])]={'actions':64,'frames':frames,'unique_pixel_frames':len(unique),'minimum_unique_frames_per_action':min(action_uniques),'opaque_bounds':[min(b[0] for b in boxes),min(b[1] for b in boxes),max(b[2] for b in boxes),max(b[3] for b in boxes)],'clipped_opaque_frames':0}
        hashes[e['file']]=hashlib.sha256((output/e['file']).read_bytes()).hexdigest()
    hashes['manifest.json']=hashlib.sha256((output/'manifest.json').read_bytes()).hexdigest()
    result={'format':1,'pack':'ai-pets-v1','art_origin':'original procedural cel illustration; no image-generation API','page_count':4,'image_count':len(ids),'frames_per_pet':192,'total_frames':768,'frame_cells':[160,160],'anchor':[-80,-140],'animations':framehashes,'hashes':hashes}
    (REPORT/'validation.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2),flush=True)

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--preview',action='store_true');ap.add_argument('--output',type=Path,default=Path('/tmp/sa-ai-pets-build/extensions/ai-pets-v1'));ap.add_argument('--validate-only',action='store_true');a=ap.parse_args()
    if a.validate_only:validate(a.output)
    elif a.preview:make_preview()
    else:make_preview();generate(a.output)
