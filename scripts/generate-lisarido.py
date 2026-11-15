#!/usr/bin/env python3
"""Build deterministic reference-derived Lisarido sprites and electromagnetic FX.

The supplied JPG contains a baked checkerboard. Keep the warm white fur inside
the silhouette, preserve all eight supplied views and the right-hand cannon,
then animate local ear/cannon layers. This is bitmap processing, not AI redraw.
Requires Pillow and NumPy only; deployment does not need these dependencies.
"""
from __future__ import annotations

import argparse
from collections import deque
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "img/lisarido.jpg"
PACK, CHAR, EFFECT, IMAGE_BASE = "lisarido-v2", 199300, 199301, 9200000
CELL, EFFECT_SIZE, EFFECT_FRAMES = 160, 240, 24
# Native directions run SW, W, NW, N, NE, E, SE, S. These are eight distinct
# source views; mirroring would move the cannon to her left hand.
SOURCE_ORDER = (2, 5, 3, 7, 6, 1, 4, 0)
ACTIONS = ((3, "stand", 4, 8), (4, "walk", 4, 5), (0, "attack", 6, 4),
           (1, "damage", 2, 6), (2, "dead", 3, 8), (6, "hand", 6, 4),
           (10, "guard", 2, 8), (12, "throw", 2, 6))



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

def fill_holes(mask: Image.Image) -> Image.Image:
    """Fill only enclosed background, so neutral white fur is never hollow."""
    arr = np.asarray(mask) > 0
    h, w = arr.shape
    outside = np.zeros((h, w), dtype=bool)
    q = deque()
    for y in range(h):
        for x in (0, w - 1):
            if not arr[y, x]: outside[y, x] = True; q.append((x, y))
    for x in range(w):
        for y in (0, h - 1):
            if not arr[y, x] and not outside[y, x]: outside[y, x] = True; q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x-1, y), (x+1, y), (x, y-1), (x, y+1)):
            if 0 <= nx < w and 0 <= ny < h and not arr[ny, nx] and not outside[ny, nx]:
                outside[ny, nx] = True; q.append((nx, ny))
    return Image.fromarray(np.uint8(~outside) * 255)


def cutout(cell: Image.Image) -> Image.Image:
    rgb = np.asarray(cell.convert("RGB")).astype(np.int16)
    # Gold, purple, pink ears and warm fur have chroma. The background is
    # neutral 204/255; close tiny JPEG gaps before filling the body silhouette.
    chroma = rgb.max(axis=2) - rgb.min(axis=2)
    fg = (chroma >= 13) | (rgb.mean(axis=2) < 154)
    mask = Image.fromarray(np.uint8(fg)*255)
    mask = mask.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    mask = fill_holes(mask)
    # Retain the central connected character, not JPEG ringing at a cell edge.
    a = np.asarray(mask) > 0; h, w = a.shape
    visited = np.zeros(a.shape, dtype=bool); components = []
    for y, x in zip(*np.nonzero(a)):
        if visited[y, x]: continue
        q = deque([(int(x), int(y))]); visited[y, x] = True; points = []
        while q:
            xx, yy = q.popleft(); points.append((xx, yy))
            for nx, ny in ((xx-1, yy), (xx+1, yy), (xx, yy-1), (xx, yy+1)):
                if 0 <= nx < w and 0 <= ny < h and a[ny, nx] and not visited[ny, nx]:
                    visited[ny, nx] = True; q.append((nx, ny))
        components.append(points)
    points = max(components, key=len)
    clean = Image.new("L", cell.size); p = clean.load()
    for x, y in points: p[x, y] = 255
    clean = fill_holes(clean).filter(ImageFilter.GaussianBlur(.5))
    result = cell.convert("RGBA"); result.putalpha(clean)
    box = clean.point(lambda v: 255 if v >= 100 else 0).getbbox()
    assert box, "reference cell has no character"
    return clean_alpha_fringe(result.crop(box))


def source_frames() -> list[Image.Image]:
    original = Image.open(SOURCE).convert("RGB")
    sw, sh = original.size; views = []
    for n in range(8):
        row, col = divmod(n, 4)
        crop = cutout(original.crop((round(col*sw/4), round(row*sh/2), round((col+1)*sw/4), round((row+1)*sh/2))))
        scale = 98 / crop.height
        assert crop.width*scale < 140, "reference must leave cannon recoil margins"
        crop = crop.resize((round(crop.width*scale), 98), Image.Resampling.LANCZOS)
        frame = Image.new("RGBA", (CELL, CELL))
        frame.alpha_composite(crop, ((CELL-crop.width)//2, 13))
        views.append(frame)
    return [views[n] for n in SOURCE_ORDER]


def cannon_layer(base: Image.Image) -> tuple[Image.Image, tuple[int, int]]:
    a = np.asarray(base)
    y, x = np.mgrid[:CELL, :CELL]
    r, g, b, alpha = (a[:, :, i].astype(np.int16) for i in range(4))
    brown = (y >= 57) & (y <= 102) & (alpha > 100) & (r > b+9) & (g > b+4) & (r < 181) & (g < 166) & (b < 145)
    candidate = np.asarray(Image.fromarray(np.uint8(brown)*255).filter(ImageFilter.MaxFilter(3))) > 0
    seen = np.zeros(candidate.shape, dtype=bool); components = []
    for yy, xx in zip(*np.nonzero(candidate)):
        if seen[yy, xx]: continue
        q = deque([(int(xx), int(yy))]); seen[yy, xx] = True; points = []
        while q:
            px, py = q.popleft(); points.append((px, py))
            for nx, ny in ((px-1,py),(px+1,py),(px,py-1),(px,py+1)):
                if 0 <= nx < CELL and 0 <= ny < CELL and candidate[ny,nx] and not seen[ny,nx]:
                    seen[ny,nx] = True; q.append((nx,ny))
        components.append(points)
    # Gold embroidery and warm fur are smaller disconnected colour islands.
    # Moving every brown pixel would tear those parts away with the cannon.
    mask = Image.new('L', base.size); mp = mask.load()
    for px, py in max(components,key=len): mp[px,py]=255
    mask = fill_holes(mask).filter(ImageFilter.MaxFilter(3))
    # Keep the mask inside the reference's alpha, preserving the cutout edge.
    mask = Image.fromarray(np.minimum(np.asarray(mask), a[:, :, 3]))
    box = mask.getbbox(); assert box, "right-hand cannon could not be isolated"
    layer = base.copy(); layer.putalpha(mask)
    return layer, ((box[0]+box[2])//2, (box[1]+box[3])//2)


def character_frame(base: Image.Image, action: str, frame: int, direction: int) -> Image.Image:
    phase = frame*math.tau/(6 if action in ("attack", "hand") else 4)
    # Cat ears hinge at the top of the head. Hair/body remain at the same scale.
    mesh = []
    for y in range(0, CELL, 8):
        for x in range(0, CELL, 8):
            def point(xx, yy):
                strength = max(0, 1-abs(yy-25)/20)*max(0, min(1, (abs(xx-80)-7)/14))
                return xx-math.sin(phase+direction)*1.8*strength, yy-math.cos(phase)*.55*strength
            mesh.append(((x, y, x+8, y+8), (*point(x,y), *point(x,y+8), *point(x+8,y+8), *point(x+8,y))))
    body = base.transform(base.size, Image.Transform.MESH, mesh, Image.Resampling.BICUBIC)
    active = action in ("attack", "hand", "throw")
    envelope = (0, .35, .85, 1, .65, .1)[frame] if action in ("attack", "hand") else .5
    if active:
        gun, center = cannon_layer(body)
        # Restore the part behind the moving gun with the opposite sleeve/dress
        # colour. Only pixels belonging to the cannon layer are replaced.
        pixels = np.array(body); gun_mask = np.asarray(gun)[:, :, 3] > 180
        mirrored = pixels[:, ::-1].copy()
        pixels[gun_mask] = mirrored[gun_mask]
        body = Image.fromarray(pixels)
        facing_left = direction in (0, 1, 2)
        angle = (-13 if facing_left else 13)*envelope
        gun = gun.rotate(angle, Image.Resampling.BICUBIC, center=center)
        raised = Image.new("RGBA", base.size)
        recoil = round(3*envelope) if frame in (3, 4) else 0
        raised.alpha_composite(gun, ((1 if facing_left else -1)*recoil, -round(5*envelope)))
        body = Image.alpha_composite(body, raised)
        if envelope >= .6:
            # Native normal attack carries a short-range muzzle explosion in
            # this same atlas; the ranged skill also has a separate target FX.
            vx, vy = ((-1, .15), (-1, -.08), (-.7, -.55), (0, -.75), (.7, -.55), (1, -.08), (1, .15), (-.25, .65))[direction]
            cx, cy = center[0]+vx*20, center[1]+vy*16-5
            burst = Image.new("RGBA", base.size); d = ImageDraw.Draw(burst)
            radius = 5+8*envelope
            for i in range(16):
                angle = i*math.tau/16+phase*.12
                rr = radius*(1 if i % 2 else 1.5)
                px, py = cx+math.cos(angle)*rr, cy+math.sin(angle)*rr
                d.line((cx, cy, px, py), fill=(255, 188, 66, 210), width=2)
            d.ellipse((cx-radius, cy-radius*.8, cx+radius, cy+radius*.8), fill=(255, 116, 31, 145))
            d.ellipse((cx-radius*.5, cy-radius*.5, cx+radius*.5, cy+radius*.5), fill=(220, 253, 255, 255))
            body = Image.alpha_composite(body, burst.filter(ImageFilter.GaussianBlur(2)))
            body = Image.alpha_composite(body, burst)
    # Keep ground contact explicit: v1 placed feet ~20px above its floor ring
    # and bobbed the entire standing body. Ears and cannon still animate, while
    # planted feet stay at the native origin (image y130, world y0).
    source_alpha=np.asarray(base.getchannel('A'))>128
    yy,xx=np.nonzero(source_alpha)
    support_y=int(yy.max())
    shift=130-support_y
    if action == "damage": body = body.rotate((-4, 3)[frame], Image.Resampling.BICUBIC, center=(80, support_y))
    if action == "dead":
        # Fall around the contact point instead of sinking an already floating
        # cutout through the ground. Shadow remains a separate flat floor layer.
        body = body.rotate((0, 15, 28)[frame], Image.Resampling.BICUBIC, center=(80, support_y))
    im=ground_shadow(direction,action,frame)
    ring = Image.new("RGBA", base.size); d = ImageDraw.Draw(ring)
    d.ellipse((51,125,109,135),outline=(110,228,255,105),width=1)
    d.ellipse((55,127,105,133),outline=(220,180,255,85),width=1)
    im=Image.alpha_composite(im,ring.filter(ImageFilter.GaussianBlur(.8)))
    floor=Image.alpha_composite(im,ring)
    im=Image.new('RGBA',base.size);im.alpha_composite(body,(0,shift))
    return Image.alpha_composite(floor,im)


def electromagnetic_frame(frame: int) -> Image.Image:
    size = EFFECT_SIZE; p = frame/(EFFECT_FRAMES-1)
    yy, xx = np.mgrid[:size, :size].astype(np.float32)
    dx, dy = xx-120, yy-120; radius = np.sqrt(dx*dx+dy*dy)
    fade = min(1, (1-p)*3); pulse = 10+p*85
    shock = np.exp(-((radius-pulse)/(3+3*p))**2)*fade
    core = np.exp(-(radius/(12+29*math.sin(p*math.pi)))**2)*min(1,p*8)*fade
    corona = np.exp(-((radius-pulse*.6)/14)**2)*.4*fade
    alpha = np.clip((shock*.8+core+corona)*235, 0, 240)
    rgba = np.stack((65+core*180+shock*40, 95+core*154+shock*105, 205+core*50, alpha), axis=-1).clip(0,255).astype(np.uint8)
    im = Image.fromarray(rgba); bolt = Image.new("RGBA", im.size); d = ImageDraw.Draw(bolt)
    for n in range(10):
        angle = n*math.tau/10+p*.7; points = []
        for k in range(7):
            rr = (12+k*12)*(min(1,p*5))
            a = angle+math.sin(k*2.3+n+frame*.8)*.18
            points.append((120+math.cos(a)*rr,120+math.sin(a)*rr))
        opacity = round(240*fade*min(1,p*7))
        d.line(points, fill=(101,139,255,opacity), width=4)
        d.line(points, fill=(210,252,255,opacity), width=1)
    for n in range(28):
        angle=n*2.399; rr=(18+n%7*9)*(.5+p*.8)
        x=120+math.cos(angle)*rr; y=120+math.sin(angle)*rr
        d.ellipse((x-1,y-1,x+1,y+1), fill=(228,207,255,round(200*fade)))
    im=Image.alpha_composite(im,bolt.filter(ImageFilter.GaussianBlur(3)))
    return Image.alpha_composite(im,bolt)


def generate(out: Path, report: Path | None = None) -> dict:
    if not SOURCE.is_file(): raise FileNotFoundError(SOURCE)
    out.mkdir(parents=True,exist_ok=True)
    (out/'pages').mkdir(exist_ok=True); (out/'anim').mkdir(exist_ok=True)
    refs=source_frames(); images=[]; actions=[]; image_id=IMAGE_BASE
    character_count=sum(n for _,_,n,_ in ACTIONS)*8
    columns=13; rows=math.ceil(character_count/columns)
    page=Image.new('RGBA',(columns*CELL,rows*CELL))
    for direction, base in enumerate(refs):
        for typ, name, count, ticks in ACTIONS:
            frames=[]
            for f in range(count):
                idx=len(images); x=(idx%columns)*CELL; y=(idx//columns)*CELL
                page.alpha_composite(character_frame(base,name,f,direction),(x,y))
                images.append([image_id,0,x,y,CELL,CELL,-80,-130]); frames.append([image_id,0,0,0]); image_id+=1
            actions.append({'dir':direction,'type':typ,'ticks':ticks,'frames':frames})
    page.save(out/'pages/00000.png',optimize=True)
    effect_page=Image.new('RGBA',(6*EFFECT_SIZE,4*EFFECT_SIZE)); frames=[]
    for f in range(EFFECT_FRAMES):
        x=f%6*EFFECT_SIZE; y=f//6*EFFECT_SIZE
        effect_page.alpha_composite(electromagnetic_frame(f),(x,y))
        images.append([image_id,1,x,y,EFFECT_SIZE,EFFECT_SIZE,-120,-120]); frames.append([image_id,0,0,0]); image_id+=1
    effect_page.save(out/'pages/00001.png',optimize=True)
    character={'id':CHAR,'actions':actions,'pages':[PACK+'/0']}
    effect={'id':EFFECT,'actions':[{'dir':0,'type':3,'ticks':2,'frames':frames}],'pages':[PACK+'/1']}
    for obj in (character,effect): (out/'anim'/f'{obj["id"]}.json').write_text(json.dumps(obj,separators=(',',':'))+'\n')
    manifest={'format':1,'id':PACK,'pages':[{'file':'pages/00000.png','width':page.width,'height':page.height},{'file':'pages/00001.png','width':effect_page.width,'height':effect_page.height}], 'images':images,'animations':[{'id':i,'file':f'anim/{i}.json'} for i in (CHAR,EFFECT)]}
    (out/'manifest.json').write_text(json.dumps(manifest,separators=(',',':'))+'\n')
    result={'pack':PACK,'source':str(SOURCE.relative_to(ROOT)),'source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'character_frames':character_count,'effect_frames':EFFECT_FRAMES,'image_count':len(images),'character_anchor':[-80,-130],'effect_anchor':[-120,-120],'source_order':list(SOURCE_ORDER),'art_origin':'User JPG silhouette extraction, local ear/cannon deformation and deterministic bitmap FX. No image generation API called.'}
    report=report or ROOT/'Report/SA-1114-05-shadow-design'; report.mkdir(parents=True,exist_ok=True)
    (report/'lisarido-art-generation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(result,ensure_ascii=False))
    return manifest


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=Path('/tmp/sa-lisarido-build/extensions/lisarido-v2'))
    parser.add_argument('--report',type=Path);args=parser.parse_args();generate(args.output.resolve(),args.report)
