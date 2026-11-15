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
PACK, CHAR, EFFECT, IMAGE_BASE = "lisarido-v3", 199300, 199301, 9200000
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


# Each rig belongs to the right cannon arm in its own supplied view.
# Shoulder/grip/muzzle points, weapon regions and torso repair boundaries
# prevent colour-keyed hair, dress trim and feet from becoming weapon pixels.
CANNON_RIG = (
    {"shoulder": (73, 55), "hand": (69, 66), "breech": (67, 68), "muzzle": (47, 84),
     "torso": ((72,54),(87,56),(96,82),(65,82)), "donor": 13},
    {"shoulder": (73, 55), "hand": (68, 68), "breech": (65, 72), "muzzle": (52, 82),
     "torso": ((71,55),(80,56),(88,84),(64,82)), "donor": 13},
    {"shoulder": (96, 57), "hand": (101, 70), "breech": (103, 73), "muzzle": (110, 85),
     "torso": ((75,55),(89,55),(89,83),(70,85)), "donor": -17},
    {"shoulder": (96, 57), "hand": (102, 70), "breech": (104, 73), "muzzle": (111, 85),
     "torso": ((75,55),(89,55),(89,83),(70,85)), "donor": -17},
    {"shoulder": (80, 54), "hand": (85, 69), "breech": (88, 72), "muzzle": (115, 82),
     "torso": ((65,57),(81,56),(87,81),(63,85)), "donor": -15},
    {"shoulder": (70, 54), "hand": (74, 68), "breech": (78, 71), "muzzle": (112, 86),
     "torso": ((68,56),(80,57),(88,84),(62,84)), "donor": -12},
    {"shoulder": (71, 56), "hand": (67, 67), "breech": (64, 70), "muzzle": (45, 85),
     "torso": ((73,55),(86,57),(95,83),(67,84)), "donor": 15},
    {"shoulder": (71, 55), "hand": (67, 68), "breech": (64, 71), "muzzle": (44, 86),
     "torso": ((73,55),(86,57),(96,83),(66,84)), "donor": 16},
)
# These projected directions agree with the native eight-way battle heading.
# Front/rear views retain their own original right-arm texture, never a mirror.
CANNON_FACING = ((-.85,.4),(-1,0),(-.8,-.45),(0,-1),(.8,-.45),(1,0),(.85,.4),(0,1))


def pose_cannon(base: Image.Image, direction: int, amount: float, recoil: float = 0) -> dict:
    """Raise a complete weapon arm from its shoulder, with a physical muzzle.

    The local transform is shared by image pixels, hand and muzzle. Recoil
    bends the forearm slightly back at the fixed shoulder; it must not detach
    the whole limb by translating its socket. The weapon/body keep native
    size and grounded feet; no world-space attack travel is baked here.
    """
    rig = CANNON_RIG[direction]
    src = np.asarray(base).copy()
    # Authored ownership restricts the colour segmentation to the weapon;
    # in the old colour-only pass the rear hair and even feet were selected.
    boxes = ((38,57,78,95),(46,62,76,92),(91,60,125,94),(91,60,125,94),
             (79,61,126,94),(70,64,121,96),(37,57,78,97),(36,56,78,97))
    x0,y0,x1,y1 = boxes[direction]
    colors = src.astype(int)
    brown = ((colors[:,:,0]>colors[:,:,2]+9) & (colors[:,:,1]>colors[:,:,2]+4) &
             (colors[:,:,0]<181) & (colors[:,:,1]<166) & (colors[:,:,2]<145) & (colors[:,:,3]>100))
    region = np.zeros((CELL,CELL),bool);region[y0:y1,x0:x1] = True
    candidate = brown & region
    seen = np.zeros(candidate.shape,bool);components = []
    for cy,cx in zip(*np.nonzero(candidate)):
        if seen[cy,cx]: continue
        queue = deque([(int(cx),int(cy))]);seen[cy,cx]=True;points=[]
        while queue:
            px,py=queue.popleft();points.append((px,py))
            for nx,ny in ((px-1,py),(px+1,py),(px,py-1),(px,py+1)):
                if 0<=nx<CELL and 0<=ny<CELL and candidate[ny,nx] and not seen[ny,nx]:
                    seen[ny,nx]=True;queue.append((nx,ny))
        components.append(points)
    gun_mask = Image.new('L',base.size);gp=gun_mask.load()
    for px,py in max(components,key=len):gp[px,py]=255
    gun_mask = fill_holes(gun_mask.filter(ImageFilter.MaxFilter(3))).filter(ImageFilter.MaxFilter(3))
    # The tiny fur cuff is part of the gripping hand, while the original
    # skirt hem and resting other arm are independent foreground objects.
    upper = Image.new('L',base.size);ud=ImageDraw.Draw(upper)
    ud.line((*rig['shoulder'],*rig['hand']),fill=255,width=7)
    gun_pixels=np.asarray(gun_mask).copy()
    gy,gx=np.mgrid[:CELL,:CELL]
    if direction==5:gun_pixels[(gy>85)&(gx<96)&~brown]=0
    if direction==5:gun_pixels[(gy>89)&(gx<91)]=0
    if direction==6:gun_pixels[(gy>84)&(gx>64)&~brown]=0
    if direction==4:gun_pixels[(gy>83)&(gx<94)&~brown]=0
    if direction in (0,7):gun_pixels[(gy>84)&(gx>64)&~brown]=0
    if direction==1:gun_pixels[(gy>83)&(gx>64)&~brown]=0
    if direction in (0,6,7):gun_pixels[(gy>=87)&(gx>=63)]=0
    if direction==1:gun_pixels[(gy>=86)&(gx>=62)]=0
    if direction==4:gun_pixels[(gy>=87)&(gx<=102)]=0
    if direction==5:gun_pixels[(gy>=88)&(gx<=96)]=0
    gun_mask=Image.fromarray(gun_pixels)
    owned = Image.fromarray(np.maximum(np.asarray(upper),gun_pixels))
    mask = np.minimum(np.asarray(owned), src[:, :, 3])
    repaired = src.copy(); repaired[mask > 0] = 0
    # The hidden torso is reconstructed from adjacent same-row dress texels.
    # No opposite arm, legs or hair is reflected into the exposed gun cavity.
    torso = Image.new('L', base.size)
    ImageDraw.Draw(torso).polygon(rig['torso'], fill=255)
    # Only restore the actual torso envelope, not a rectangle reaching into
    # the old barrel cavity. Its boundaries are authored in the source view.
    yy, xx = np.nonzero((mask > 0) & (np.asarray(torso) > 0))
    for y, x in zip(yy, xx):
        row = src[y].astype(int)
        purple = (row[:,2] > row[:,0]*1.04) & (row[:,2] > row[:,1]*1.15)
        candidates = np.flatnonzero(purple & (row[:,3] > 235) & (mask[y] == 0))
        if len(candidates):
            donor = candidates[np.argmin(abs(candidates - (x + rig['donor'])))]
            repaired[y,x] = src[y,donor]
        elif y < 60:
            donor = int(np.clip(x + rig['donor'], 0, CELL - 1))
            repaired[y,x] = src[y,donor]
    # The original barrel overlaps the skirt edge in these two side views.
    # Its lower opaque silhouette extends beyond the connected colour island;
    # remove that known barrel-only strip without transporting the feet.
    if direction==4: repaired[87:95,90:124]=0
    if direction==5: repaired[88:97,90:121]=0
    body = Image.fromarray(repaired)
    shoulder = np.array(rig['shoulder'], dtype=float)
    hand = np.array(rig['hand'], dtype=float)
    breech, muzzle = np.array(rig['breech'], dtype=float), np.array(rig['muzzle'], dtype=float)
    facing = np.array(CANNON_FACING[direction], dtype=float)
    original = muzzle - breech
    angle = (math.atan2(facing[1],facing[0]) - math.atan2(original[1],original[0]) + math.pi) % math.tau - math.pi
    angle = angle * amount + recoil * (-1 if facing[0] < 0 else 1)
    rotation = np.array(((math.cos(angle),-math.sin(angle)),(math.sin(angle),math.cos(angle))))
    # Two joints: the shoulder raises the upper arm, while the hand levels
    # the barrel. Rotating the entire assembly alone cannot both raise the
    # hand and aim the weapon, especially in the front/back projections.
    raised_hand = shoulder + ((-35,-1) if direction==2 else (12*facing[0], 2*facing[1]))
    target_hand = hand*(1-amount) + raised_hand*amount
    def posed(point):
        return tuple(target_hand + rotation @ (np.array(point)-hand))
    def transform(layer, matrix, src_pivot, dst_pivot):
        inverse = np.linalg.inv(matrix)
        offset = dst_pivot - matrix @ src_pivot
        sample_offset = -inverse @ offset
        coeff = (*inverse[0],sample_offset[0],*inverse[1],sample_offset[1])
        return layer.transform(base.size,Image.Transform.AFFINE,coeff,Image.Resampling.BICUBIC)
    # An overlapping cuff seam keeps the raster pieces connected. The upper
    # arm keeps its shoulder socket; the cannon and gripping hand remain a
    # rigid piece with unchanged proportions and texture.
    y, x = np.mgrid[:CELL,:CELL]
    along = ((x-shoulder[0])*(hand[0]-shoulder[0]) + (y-shoulder[1])*(hand[1]-shoulder[1])) / np.dot(hand-shoulder,hand-shoulder)
    gm = np.asarray(gun_mask)
    upper_alpha = np.where((along < 1.13) & (gm<128),mask,0).astype(np.uint8)
    gun_alpha = np.where((gm>0) | ((along>.78)&(along<1.12)),mask,0).astype(np.uint8)
    upper = base.copy();upper.putalpha(Image.fromarray(upper_alpha))
    gun = base.copy();gun.putalpha(Image.fromarray(gun_alpha))
    old_arm, new_arm = hand-shoulder,target_hand-shoulder
    upper_angle = math.atan2(new_arm[1],new_arm[0])-math.atan2(old_arm[1],old_arm[0])
    scale = np.linalg.norm(new_arm)/np.linalg.norm(old_arm)
    upper_matrix = np.array(((math.cos(upper_angle),-math.sin(upper_angle)),(math.sin(upper_angle),math.cos(upper_angle))))*scale
    upper = transform(upper,upper_matrix,shoulder,shoulder)
    gun = transform(gun,rotation,hand,target_hand)
    arm = Image.alpha_composite(upper,gun)
    if direction == 1:
        foreground_mask=Image.new('L',base.size)
        ImageDraw.Draw(foreground_mask).polygon(((74,51),(80,54),(79,63),(75,71),(71,78),(65,79),(65,73),(69,66),(70,57)),fill=255)
        foreground=base.copy();foreground.putalpha(Image.fromarray(np.minimum(np.asarray(foreground_mask),src[:,:,3])))
        # Occlusion belongs to the same independently authored view. The
        # near left arm does not move when the far right cannon arm is raised.
        body=Image.alpha_composite(body,foreground)
    return {'body':body,'arm':arm,'shoulder':tuple(shoulder),
            'hand':tuple(target_hand),'breech':posed(breech),'muzzle':posed(muzzle)}


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
    envelope = (0, .45, 1, 1, .65, 0)[frame] if action in ("attack", "hand") else .5
    if active and envelope:
        pose = pose_cannon(body, direction, envelope, recoil=.075 if frame == 4 else 0)
        body = Image.alpha_composite(pose['arm'], pose['body']) if direction in (1,2,3) else Image.alpha_composite(pose['body'], pose['arm'])
        if frame in (3, 4):
            # Derive the flash from the exact transformed muzzle. The aim
            # frame remains clear, so the lifted right arm is readable first.
            cx, cy = pose['muzzle']
            burst = Image.new("RGBA", base.size); d = ImageDraw.Draw(burst)
            radius = 8 if frame == 3 else 5
            for i in range(12):
                a = i*math.tau/12
                rr = radius*(1 if i % 2 else 1.45)
                d.line((cx, cy, cx+math.cos(a)*rr, cy+math.sin(a)*rr), fill=(255,188,66,220), width=2)
            d.ellipse((cx-radius,cy-radius*.75,cx+radius,cy+radius*.75), fill=(255,116,31,160))
            d.ellipse((cx-radius*.45,cy-radius*.45,cx+radius*.45,cy+radius*.45), fill=(220,253,255,255))
            body = Image.alpha_composite(body, burst.filter(ImageFilter.GaussianBlur(1.2)))
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
    parser.add_argument('--output',type=Path,default=Path('/tmp/sa-lisarido-build/extensions/lisarido-v3'))
    parser.add_argument('--report',type=Path);args=parser.parse_args();generate(args.output.resolve(),args.report)
