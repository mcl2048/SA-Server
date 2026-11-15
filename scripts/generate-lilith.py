#!/usr/bin/env python3
"""Build the isolated Lilith bitmap extension from the supplied reference.

The reference is a JPG with a baked checkerboard.  A bright-neutral matte removes the baked checkerboard, including enclosed
holes, while retaining the dark costume and colour.  All output is deterministic and contains no
runtime or original Assets files.
"""
from __future__ import annotations
import argparse, hashlib, json, math
from collections import deque
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageOps
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "img/lilyse.jpg"
PACK = "lilith-v2"
CHAR = 199200
EFFECT = 199201
IMAGE_BASE = 9100000
CELL = 160


def ground_shadow(direction: int, action: str, frame: int) -> Image.Image:
    """A floor-space projection, never rotated or translated with the body.

    Native tiger shadows are low, dark and nearly horizontal. A narrow soft
    edge keeps this RGBA extension readable on both stone and grass floors.
    """
    scale=3
    layer=Image.new('RGBA',(CELL*scale,CELL*scale))
    draw=ImageDraw.Draw(layer)
    width=(52,56,46,50,52,50,46,56)[direction]
    if action=='dead':width+=8
    cx,cy=80*scale,130*scale
    draw.ellipse((cx-width*scale/2,cy-6*scale,cx+width*scale/2,cy+6*scale),fill=(0,0,0,145))
    return layer.filter(ImageFilter.GaussianBlur(.7*scale)).resize((CELL,CELL),Image.Resampling.LANCZOS)


def clean_alpha_fringe(image: Image.Image) -> Image.Image:
    """Extend real interior colours into the feathered matte, removing JPG grey halos."""
    arr=np.array(image);alpha=arr[:,:,3];known=alpha>=248
    for _ in range(2):
        total=np.zeros(arr[:,:,:3].shape,np.float32);count=np.zeros(alpha.shape,np.float32)
        for dy,dx in ((-1,0),(1,0),(0,-1),(0,1),(-1,-1),(-1,1),(1,-1),(1,1)):
            support=np.roll(known,(dy,dx),(0,1))
            # Cropped alpha has a transparent margin; do not wrap across edges.
            if dy<0:support[-1,:]=False
            if dy>0:support[0,:]=False
            if dx<0:support[:,-1]=False
            if dx>0:support[:,0]=False
            total+=np.roll(arr[:,:,:3],(dy,dx),(0,1))*support[:,:,None];count+=support
        weak=(alpha>0)&~known&(count>0)
        arr[weak,:3]=np.rint(total[weak]/count[weak,None]).clip(0,255).astype(np.uint8)
        known|=weak
    return Image.fromarray(arr)

def neutral_background(im: Image.Image) -> Image.Image:
    """Remove pale neutral checkerboard and its enclosed holes."""
    rgb = im.convert("RGB")
    w, h = rgb.size
    px = rgb.load()
    def bg(x: int, y: int) -> bool:
        r, g, b = px[x, y]
        # JPG blocks vary by a few levels; the checkerboard is near-neutral and
        # bright. Costume blacks and cyan/purple/gold details are disconnected.
        return max(r, g, b) - min(r, g, b) <= 20 and (r + g + b) // 3 >= 155
    seen = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()
    for x in range(w):
        for y in (0, h - 1):
            if bg(x, y): seen[y*w+x] = 1; q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if bg(x, y) and not seen[y*w+x]: seen[y*w+x] = 1; q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny*w+nx] and bg(nx, ny):
                seen[ny*w+nx] = 1; q.append((nx, ny))
    out = rgb.convert("RGBA")
    alpha = Image.new("L", (w, h), 255)
    ap = alpha.load()
    for y in range(h):
        for x in range(w):
            if seen[y*w+x] or bg(x, y): ap[x, y] = 0
    # A light feather on the cut edge removes JPEG halos without erasing the
    # thin gold ring. Keep the transition narrow and deterministic.
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.65))
    out.putalpha(alpha)
    return clean_alpha_fringe(out)

def source_frames() -> list[Image.Image]:
    im = neutral_background(Image.open(SOURCE))
    sw, sh = im.size
    frames = []
    for row in range(2):
        for col in range(4):
            # The supplied reference is a clean 4x2 contact sheet. Slightly
            # overlap cells to retain ear and ring pixels at JPEG boundaries.
            x0, x1 = round(col*sw/4), round((col+1)*sw/4)
            y0, y1 = round(row*sh/2), round((row+1)*sh/2)
            crop = im.crop((max(0,x0-2), max(0,y0-2), min(sw,x1+2), min(sh,y1+2)))
            bbox = crop.getchannel("A").point(lambda v: 255 if v > 18 else 0).getbbox()
            if not bbox: raise ValueError("reference cell has no visible artwork")
            crop = crop.crop(bbox)
            # 2/3 of the established large dragon battle height: include the
            # halo/ring in the frame while keeping the body around 96..108px.
            scale = min(112 / crop.height, 132 / crop.width)
            crop = crop.resize((max(1,round(crop.width*scale)), max(1,round(crop.height*scale))), Image.Resampling.LANCZOS)
            frame = Image.new("RGBA", (CELL, CELL), (0,0,0,0))
            frame.alpha_composite(crop, ((CELL-crop.width)//2, 10))
            frames.append(frame)
    # Contact sheet order: front, three-quarter, side, back then the reverse.
    return [frames[0], ImageOps.mirror(frames[1]), *frames[2:5], *[ImageOps.mirror(f) for f in frames[5:]]]

def transform(base: Image.Image, action: str, frame: int, direction: int) -> Image.Image:
    # Displace only the ear/hair region independently of the floating body.
    # Inverse mesh coordinates keep the source pixels contiguous at each hinge.
    phase = frame * math.tau / (5 if action == 'attack' else 4)
    mesh=[]
    for y in range(0,CELL,8):
        for x in range(0,CELL,8):
            def point(xx,yy):
                side=max(0,min(1,(abs(xx-80)-12)/18))
                ear=max(0,1-abs(yy-57)/31)*side
                return xx-math.sin(phase+yy*.035+direction)*2.0*ear, yy
            mesh.append(((x,y,x+8,y+8),(*point(x,y),*point(x,y+8),*point(x+8,y+8),*point(x+8,y))))
    im=base.transform(base.size,Image.Transform.MESH,mesh,Image.Resampling.BICUBIC)
    # Ring stays at the ground plane; the boots rise several pixels above it.
    # Extract the floor light by colour rather than cutting through the boots.
    pix=im.load()
    for py in range(94,CELL):
        for px in range(CELL):
            r,g,b,a=pix[px,py]
            if min(r,g,b)>65 or (r>110 and g>85 and b<r*.8): pix[px,py]=(0,0,0,0)
    bob=round(math.sin(phase)*1.5)-4
    if action=='dead': bob=[0,8,15][frame]
    floating=Image.new('RGBA',im.size);floating.alpha_composite(im,(0,bob))
    im=floating
    if action in ('attack','hand','throw'):
        reach=([0.0,.45,1,.85,.2] if action=='attack' else [.25,.65,1,.65])[frame]
        vx=-math.sin(direction*math.pi/4);vy=math.cos(direction*math.pi/4)*.58
        # Matching dark cloth and gold cuffs form both articulated forearms.
        # The energy is cast between the hands, in the actual facing direction.
        draw=ImageDraw.Draw(im)
        hands=[]
        for shoulder,offset in [((69,78),-4),((90,78),4)]:
            sx,sy=shoulder;ex=sx+vx*21*reach;ey=sy+vy*18*reach-5*reach+offset
            draw.line((sx,sy+bob,ex,ey+bob),fill=(16,22,25,255),width=9)
            draw.line((sx,sy+bob-1,ex,ey+bob-1),fill=(42,41,44,255),width=5)
            draw.ellipse((ex-4,ey+bob-4,ex+4,ey+bob+4),fill=(18,25,27,255),outline=(103,83,48,230),width=1)
            hands.append((ex,ey+bob))
        if reach>.3:
            cx=sum(h[0] for h in hands)/2+vx*13;cy=sum(h[1] for h in hands)/2+vy*12
            glow=Image.new('RGBA',im.size);g=ImageDraw.Draw(glow)
            radius=4+8*reach
            g.ellipse((cx-radius*1.6,cy-radius*1.5,cx+radius*1.6,cy+radius*1.5),fill=(86,48,255,120))
            im=Image.alpha_composite(im,glow.filter(ImageFilter.GaussianBlur(5)))
            draw=ImageDraw.Draw(im)
            for k in range(4):
                rr=radius*(1-k*.19);color=[(83,44,203,90),(87,100,245,130),(100,201,255,185),(198,235,255,235)][k]
                draw.ellipse((cx-rr,cy-rr*.8,cx+rr,cy+rr*.8),fill=color)
            for k in range(7):
                angle=phase+k*math.tau/7;rr=radius+3+2*math.sin(k+phase)
                x=cx+math.cos(angle)*rr;y=cy+math.sin(angle)*rr*.7
                draw.ellipse((x-1,y-1,x+1,y+1),fill=(146,122,255,220))
    if action=='damage':
        im=im.rotate([-4,2][frame],resample=Image.Resampling.BICUBIC,center=(80,115))
    if action=='dead':
        im=im.rotate([-6,-16,-28][frame],resample=Image.Resampling.BICUBIC,center=(80,115))
    # Floor light and dark projection are composed after body transforms.
    # The previous compositor rotated the complete ring on damage/death and
    # retained part of the source's baked ring beneath the floating boots.
    ring=Image.new('RGBA',im.size);rd=ImageDraw.Draw(ring)
    for radius,color in [(37,(242,192,64,40)),(34,(255,221,101,150)),(29,(255,241,157,175))]:
        rd.ellipse((80-radius,130-radius*.19,80+radius,130+radius*.19),outline=color,width=1)
    floor=Image.alpha_composite(ground_shadow(direction,action,frame),ring.filter(ImageFilter.GaussianBlur(1.2)))
    floor=Image.alpha_composite(floor,ring)
    return Image.alpha_composite(floor,im)


def effect_frame(frame: int, count: int = 28) -> Image.Image:
    # A raster fluid field forms layered blue fire, with fine spatial turbulence
    # and rising filaments. No runtime DOM/canvas replacement is involved.
    w,h=440,330;p=frame/(count-1);t=p*math.tau
    yy,xx=np.mgrid[0:h,0:w].astype(np.float32);x=xx/w;y=yy/h
    grow=min(1,p*4);fade=min(1,(1-p)*5);density=np.zeros_like(x)
    for i in range(17):
        cx=.04+i*.058+np.sin(y*12+t*2+i)*.022
        top=.13+.22*(.5+.5*math.sin(i*2.6+t*.6))
        width=.018+.014*np.sin(y*9+i)**2
        tongue=np.exp(-((x-cx)/width)**2)*np.clip((y-top)/.18,0,1)*np.clip((.96-y)/.15,0,1)
        density+=tongue
    turbulence=(np.sin(x*73+y*51-t*8)+np.sin(x*137-y*87+t*5)+np.sin(x*31-y*125-t*9))*.12
    core=np.clip(density*.85,0,1)*np.clip(.88+turbulence*.4,.6,1)
    envelope=np.clip((.99-abs(x-.5)*1.85)*3,0,1)*np.clip((y-.03)*5,0,1)
    alpha=np.clip(core*200*envelope*grow*fade,0,220)
    rgba=np.stack((35+core*88,60+core*164,188+core*67,alpha),axis=-1).astype(np.uint8)
    im=Image.fromarray(rgba)
    im=Image.alpha_composite(im.filter(ImageFilter.GaussianBlur(8)),im)
    # Skull contours have hollow sockets, nasal cavity, cheekbones and teeth;
    # a second blurred copy integrates them into the surrounding blue flame.
    layer=Image.new('RGBA',(w*2,h*2));d=ImageDraw.Draw(layer)
    for i,(cx,cy,r) in enumerate(((92,180,31),(222,135,45),(350,187,34))):
        cx=(cx+math.sin(t+i)*6)*2;cy=(cy+math.cos(t*1.5+i)*5)*2;r*=2
        opacity=round(210*grow*fade)
        pts=[(cx-r*.92,cy+r*.03),(cx-r*.95,cy-r*.36),(cx-r*.63,cy-r*.84),(cx,cy-r),(cx+r*.63,cy-r*.84),(cx+r*.95,cy-r*.36),(cx+r*.92,cy+r*.03),(cx+r*.67,cy+r*.32),(cx+r*.45,cy+r*.42),(cx+r*.38,cy+r*.85),(cx-r*.38,cy+r*.85),(cx-r*.45,cy+r*.42),(cx-r*.67,cy+r*.32)]
        d.polygon(pts,fill=(76,164,237,round(opacity*.60)))
        d.line(pts+[pts[0]],fill=(164,233,255,opacity),width=3,joint='curve')
        for side in (-1,1):
            ex=cx+side*r*.38
            d.polygon([(ex-r*.23,cy-r*.27),(ex+r*.23,cy-r*.18),(ex+r*.19,cy+r*.1),(ex-r*.17,cy+r*.15)],fill=(11,28,88,round(opacity*.95)))
            d.arc((ex-r*.26,cy-r*.3,ex+r*.26,cy+r*.2),10,170,fill=(79,235,255,opacity),width=3)
        d.polygon([(cx,cy+r*.05),(cx-r*.13,cy+r*.36),(cx+r*.13,cy+r*.36)],fill=(17,41,96,opacity))
        for tooth in range(5):
            tx=cx-r*.32+tooth*r*.14
            d.rounded_rectangle((tx,cy+r*.48,tx+r*.1,cy+r*.72),radius=2,fill=(185,237,255,opacity))
        d.arc((cx-r*.65,cy-r*.69,cx+r*.65,cy+r*.22),196,300,fill=(215,248,255,round(opacity*.75)),width=3)
    skull=layer.resize((w,h),Image.Resampling.LANCZOS)
    im=Image.alpha_composite(im,skull.filter(ImageFilter.GaussianBlur(7)))
    im=Image.alpha_composite(im,skull)
    d=ImageDraw.Draw(im)
    for i in range(100):
        px=(i*83.37+math.sin(t+i)*14)%420+10;py=(i*47.13-p*280*(1+i%3*.2))%260+25
        a=round((90+90*math.sin(i)**2)*grow*fade);radius=1 if i%4 else 2
        d.ellipse((px-radius,py-radius,px+radius,py+radius),fill=(126,204,255,a))
    # Shock ring expands once, then the flame contracts into transparent embers.
    rw=30+370*min(1,p*2);rh=rw*.19
    d.ellipse((220-rw/2,280-rh/2,220+rw/2,280+rh/2),outline=(89,203,255,round(160*fade)),width=2)
    return im

def generate(out: Path, report: Path | None = None) -> dict:
    out.mkdir(parents=True, exist_ok=True); (out/'pages').mkdir(exist_ok=True); (out/'anim').mkdir(exist_ok=True)
    refs = source_frames(); images=[]; actions=[]; image_id=IMAGE_BASE
    for direction, base in enumerate(refs):
        for typ, name, n, ticks in ((3,'stand',4,8),(4,'walk',4,5),(0,'attack',5,5),(1,'damage',2,6),(2,'dead',3,8),(6,'hand',4,6),(10,'guard',2,8),(12,'throw',2,6)):
            frames=[]
            for f in range(n):
                images.append((image_id,0,(len(images)%13)*CELL,(len(images)//13)*CELL,CELL,CELL,-80,-130))
                frames.append([image_id,0,0,0]); image_id += 1
            actions.append((direction,typ,ticks,frames,name))
    char_page = Image.new('RGBA',(13*CELL,16*CELL),(0,0,0,0))
    ix=0
    for direction, base in enumerate(refs):
        for typ,name,n,ticks in ((3,'stand',4,8),(4,'walk',4,5),(0,'attack',5,5),(1,'damage',2,6),(2,'dead',3,8),(6,'hand',4,6),(10,'guard',2,8),(12,'throw',2,6)):
            for f in range(n): char_page.alpha_composite(transform(base,name,f,direction),((ix%13)*CELL,(ix//13)*CELL)); ix+=1
    char_page.save(out/'pages/00000.png', optimize=True)
    char_actions=[{'dir':d,'type':t,'ticks':ticks,'frames':fr} for d,t,ticks,fr,_ in actions]
    # Effects use a separate RGBA page and a single native STAND animation.
    eff_page=Image.new('RGBA',(4*440,7*330),(0,0,0,0)); eff_frames=[]; eid=image_id
    for f in range(28):
        x=(f%4)*440; y=(f//4)*330; eff=effect_frame(f); eff_page.alpha_composite(eff,(x,y))
        eff_frames.append([eid,0,0,0]); images.append((eid,1,x,y,440,330,-220,-165)); eid+=1
    eff_page.save(out/'pages/00001.png', optimize=True)
    (out/'anim'/f'{CHAR}.json').write_text(json.dumps({'id':CHAR,'actions':char_actions,'pages':[f'{PACK}/0']},separators=(',',':'))+'\n')
    (out/'anim'/f'{EFFECT}.json').write_text(json.dumps({'id':EFFECT,'actions':[{'dir':0,'type':3,'ticks':3,'frames':eff_frames}],'pages':[f'{PACK}/1']},separators=(',',':'))+'\n')
    manifest={'format':1,'id':PACK,'pages':[{'file':'pages/00000.png','width':2080,'height':2560},{'file':'pages/00001.png','width':1760,'height':2310}], 'images':[list(x) for x in images], 'animations':[{'id':CHAR,'file':f'anim/{CHAR}.json'},{'id':EFFECT,'file':f'anim/{EFFECT}.json'}]}
    (out/'manifest.json').write_text(json.dumps(manifest,separators=(',',':'))+'\n')
    # Validate all alpha images and animation references before packaging.
    for p in manifest['pages']:
        im=Image.open(out/p['file']); assert im.mode=='RGBA' and im.size==(p['width'],p['height'])
    assert len(images)==208+28 and len(char_actions)==64
    result={'pack':PACK,'source':str(SOURCE.relative_to(ROOT)),'source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'pages':2,'character_frames':208,'effect_frames':28,'character_anchor':[-80,-130],'image_count':len(images),'manifest_sha256':hashlib.sha256((out/'manifest.json').read_bytes()).hexdigest()}
    report=report or ROOT/'Report/SA-1114-05-shadow-design';report.mkdir(parents=True,exist_ok=True)
    (report/'lilith-art-validation.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
    print(json.dumps(result,ensure_ascii=False)); return manifest

if __name__ == '__main__':
    ap=argparse.ArgumentParser(); ap.add_argument('--output',type=Path,default=Path('/tmp/sa-lilith-build/extensions/lilith-v2'));ap.add_argument('--report',type=Path);args=ap.parse_args();generate(args.output.resolve(),args.report)
