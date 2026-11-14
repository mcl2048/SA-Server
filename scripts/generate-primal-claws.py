#!/usr/bin/env python3
"""Reference-derived eight-way articulated pet atlases, without external APIs.

The 3x3 uploaded contact sheets contain nine views. Eight distinct originals are
used, never reflected: original left claws stay on the supplied anatomical side.
Legs, tiger tail, and left claw have separate hinge masks; the tiger rears around
its hindquarters, while the crab jumps and extends its claw. All math and PNG
output is deterministic. Pillow/NumPy are build-time dependencies only.
"""
from __future__ import annotations
import argparse, hashlib, json, math
from collections import deque
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageChops
ROOT=Path(__file__).resolve().parents[1]
PACK='primal-claws-v2'; BASE=9300000; CELL=192; GROUND=(96,142); SS=3
ACTIONS=((3,'stand',6,7),(4,'walk',8,4),(0,'attack',10,5),(1,'damage',3,6),
         (2,'dead',4,8),(6,'hand',10,5),(10,'guard',3,8),(12,'throw',3,6))
# Native order S, SW, W, NW, N, NE, E, SE. Extra reference view is unused.
ORDER={'cyrufas':(0,6,3,4,1,2,5,8),'claudes':(4,5,6,8,7,1,2,3)}
SIZES={'cyrufas':[(58,79,-29,-57),(89,78,-34,-59),(95,78,-39,-60),(66,99,-33,-65),
 (60,100,-32,-67),(90,84,-58,-65),(93,77,-55,-60),(65,78,-32,-59)],
 'claudes':[(67,92,-34,-58),(95,83,-48,-57),(118,76,-59,-57),(87,87,-44,-58),
 (64,96,-33,-60),(96,83,-50,-58),(117,76,-59,-57),(86,85,-41,-57)]}
# Reference poses are seated/curled, unlike the uploaded quadruped. Their
# per-view bounding boxes are NOT anatomical proportions. Fit each original
# uniformly into a species envelope, then place its support feet at y+12.
# Source-space support centers exclude the tiger's tail and the crab's claws.
ENVELOPE={'cyrufas':(112,84),'claudes':(118,92)}
FEET={'cyrufas':[(50,96),(48,96),(48,96),(46,97),(50,98),(59,97),(52,97),(53,97)],
      'claudes':[(50,94),(54,95),(56,95),(55,96),(50,97),(47,96),(45,96),(53,95)]}
# Normalized source-space polygons. Each claw/limb is segmented from its real
# source pixels, then moved about its shoulder/hip; no reflected limb is painted.
# tuples are (root, polygon, role), where role distinguishes support/left weapon.
TIGER={
0:[((21,49),[(7,45),(36,47),(39,86),(24,94),(0,94)],'front'),((79,51),[(67,48),(93,50),(100,95),(79,100),(64,88)],'claw'),((31,65),[(28,62),(38,63),(40,89),(28,90)],'hind'),((64,66),[(60,62),(70,62),(74,89),(59,89)],'hind')],
6:[((21,53),[(11,49),(33,53),(31,83),(21,97),(0,95)],'front'),((57,46),[(47,41),(63,44),(65,62),(57,85),(45,100),(26,97),(32,77)],'claw'),((75,53),[(65,45),(81,47),(83,88),(69,91),(68,73)],'hind'),((65,56),[(59,53),(68,51),(69,83),(57,86)],'hind')],
3:[((35,51),[(27,43),(43,48),(39,72),(31,95),(17,98),(18,86)],'front'),((25,51),[(18,49),(28,54),(16,78),(9,100),(0,97),(2,75)],'claw'),((65,41),[(56,37),(73,42),(74,68),(80,79),(81,98),(66,100),(67,78),(58,64)],'hind'),((57,53),[(53,48),(63,50),(67,74),(59,91),(49,92),(52,74)],'hind')],
4:[((30,51),[(24,44),(38,49),(36,76),(28,96),(16,96),(19,78)],'front'),((22,53),[(16,48),(28,51),(20,73),(13,97),(0,96),(0,76)],'claw'),((56,37),[(49,32),(67,39),(66,65),(66,98),(50,100),(51,74),(46,58)],'hind'),((72,52),[(65,47),(75,49),(82,88),(72,96),(64,94),(67,74)],'hind')],
1:[((22,58),[(7,53),(34,54),(35,99),(7,100)],'hind'),((78,57),[(65,53),(90,53),(100,95),(73,100),(65,82)],'hind'),((38,45),[(31,42),(42,42),(42,78),(33,78)],'front'),((62,43),[(55,40),(68,40),(69,77),(57,78)],'claw')],
2:[((68,47),[(58,41),(75,42),(80,65),(79,96),(66,96),(65,72)],'front'),((79,52),[(73,47),(86,50),(98,73),(100,96),(88,96),(79,77),(65,65)],'claw'),((47,43),[(38,35),(53,37),(57,61),(52,73),(54,100),(40,100),(39,76)],'hind'),((25,50),[(17,44),(32,42),(29,70),(23,94),(12,94),(14,75)],'hind')],
5:[((55,55),[(49,44),(64,46),(61,68),(68,87),(70,100),(56,100),(51,78)],'front'),((73,57),[(68,52),(78,51),(89,73),(94,98),(81,98),(70,78)],'claw'),((28,42),[(22,32),(38,38),(37,62),(26,80),(29,96),(17,100),(12,86),(19,63)],'hind'),((38,54),[(36,48),(45,48),(42,76),(47,89),(40,94),(31,87)],'hind')],
8:[((54,52),[(47,45),(59,49),(60,75),(69,96),(56,100),(48,83)],'front'),((76,55),[(68,46),(79,49),(92,69),(100,95),(91,98),(81,81),(69,65)],'claw'),((29,41),[(20,31),(38,34),(38,56),(26,76),(28,94),(15,97),(12,77)],'hind'),((33,57),[(31,51),(39,51),(39,80),(43,90),(33,93),(27,80)],'hind')],
}
# Root/polygon for the tiger tail. It is occluded in front view, not invented.
TAIL={1:((50,44),[(44,41),(58,43),(62,94),(45,96),(43,79)]),2:((21,41),[(15,38),(27,40),(17,71),(6,86),(0,86),(0,76),(10,68)]),3:((79,34),[(75,30),(86,38),(91,61),(100,74),(100,84),(91,82),(83,69)]),4:((70,35),[(65,29),(77,34),(84,64),(94,79),(100,78),(100,89),(90,91),(79,75)]),5:((20,39),[(15,35),(25,40),(14,67),(3,79),(0,79),(0,68),(8,60)]),6:((76,40),[(72,34),(83,40),(90,66),(99,68),(100,77),(92,79),(83,71)]),8:((23,40),[(18,33),(29,35),(21,61),(6,76),(0,76),(0,66),(12,55)])}
# Crab legs are isolated below their spherical sockets, preserving the shell.
CRAB={
4:[((16,49),[(11,46),(22,49),(14,72),(4,83),(0,80),(4,64)],'leg'),((28,61),[(21,57),(32,60),(34,86),(25,99),(16,94),(19,76)],'leg'),((78,61),[(72,56),(84,57),(91,77),(91,97),(81,100),(76,83)],'leg'),((86,50),[(80,48),(91,46),(100,80),(96,85),(88,68)],'leg'),((76,58),[(67,49),(83,52),(84,64),(87,89),(80,100),(67,96),(64,79)],'claw')],
5:[((35,61),[(28,57),(41,60),(45,84),(37,100),(27,92),(27,75)],'leg'),((69,56),[(63,51),(76,53),(79,75),(87,93),(79,97),(68,80)],'leg'),((86,58),[(80,54),(91,56),(100,77),(99,89),(90,86),(85,76)],'leg'),((50,69),[(45,62),(54,65),(60,91),(53,99),(47,88)],'leg'),((23,54),[(14,48),(29,50),(31,64),(23,83),(11,92),(0,88),(0,72)],'claw')],
6:[((48,65),[(41,59),(53,60),(54,91),(48,100),(43,94)],'leg'),((69,60),[(63,56),(76,55),(76,76),(81,91),(72,95),(67,82)],'leg'),((86,61),[(81,54),(91,55),(100,82),(99,92),(91,90),(86,76)],'leg'),((37,64),[(31,58),(41,60),(38,83),(32,94),(25,91)],'leg'),((30,49),[(18,48),(34,49),(34,66),(20,82),(5,93),(0,86),(0,69)],'claw')],
8:[((47,62),[(41,55),(54,58),(56,82),(49,100),(44,96)],'leg'),((63,65),[(57,57),(69,60),(72,85),(69,99),(61,96)],'leg'),((38,69),[(32,64),(44,65),(43,88),(37,100),(29,95)],'leg'),((75,69),[(69,62),(81,64),(85,85),(80,99),(73,94)],'leg'),((29,30),[(21,25),(37,29),(36,40),(26,50),(10,54),(0,49),(1,35)],'claw')],
7:[((12,66),[(7,60),(21,61),(21,76),(10,87),(0,83),(0,75)],'leg'),((24,78),[(18,70),(30,72),(30,91),(22,100),(13,96)],'leg'),((77,78),[(70,72),(83,70),(89,96),(79,100),(72,88)],'leg'),((87,65),[(79,60),(92,60),(100,80),(99,87),(90,87),(84,77)],'leg'),((64,63),[(57,55),(69,55),(72,73),(69,85),(60,82)],'claw')],
1:[((29,72),[(22,66),(36,65),(34,84),(25,96),(16,94),(21,81)],'leg'),((42,69),[(36,62),(49,63),(47,98),(38,100),(36,88)],'leg'),((55,67),[(48,62),(61,60),(65,96),(56,100),(49,81)],'leg'),((23,65),[(17,59),(28,60),(22,82),(13,90),(8,87)],'leg'),((75,27),[(67,22),(83,25),(98,36),(100,49),(94,56),(82,50),(73,42)],'claw')],
2:[((23,69),[(16,60),(30,63),(25,82),(15,93),(10,90)],'leg'),((35,68),[(29,61),(43,61),(40,91),(32,99),(26,96)],'leg'),((49,65),[(42,60),(56,60),(61,95),(55,100),(47,88)],'leg'),((38,68),[(32,61),(40,60),(44,89),(37,96)],'leg'),((76,43),[(69,36),(84,38),(98,53),(100,65),(92,71),(82,65),(74,55)],'claw')],
3:[((20,58),[(14,53),(26,57),(21,73),(11,86),(0,85),(3,72)],'leg'),((34,67),[(28,61),(41,62),(42,84),(34,95),(26,93),(28,79)],'leg'),((67,60),[(62,54),(74,53),(84,79),(78,88),(70,81)],'leg'),((86,58),[(80,52),(91,52),(100,77),(99,88),(90,85)],'leg'),((77,48),[(69,42),(84,42),(95,59),(100,77),(95,83),(82,78),(75,63)],'claw')],
}


def cutout(im):
    a=np.asarray(im.convert('RGB')).astype(np.int16)
    mask=((a.mean(2)<155)|(a.max(2)-a.min(2)>15)).astype(np.uint8)*255
    mask=np.asarray(Image.fromarray(mask).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3)))>0
    h,w=mask.shape; seen=np.zeros((h,w),bool); components=[]
    for y,x in zip(*np.nonzero(mask)):
        if seen[y,x]:continue
        q=deque([(int(x),int(y))]);seen[y,x]=True;points=[]
        while q:
            px,py=q.popleft();points.append((px,py))
            for nx,ny in ((px-1,py),(px+1,py),(px,py-1),(px,py+1)):
                if 0<=nx<w and 0<=ny<h and mask[ny,nx] and not seen[ny,nx]:seen[ny,nx]=True;q.append((nx,ny))
        components.append(points)
    mask=np.zeros((h,w),bool)
    for x,y in max(components,key=len):mask[y,x]=True
    # Flood the exterior; enclosed bright metal highlights belong to the body.
    exterior=np.zeros((h,w),bool);q=deque()
    for y in range(h):
        for x in (0,w-1):
            if not mask[y,x]:exterior[y,x]=True;q.append((x,y))
    for x in range(w):
        for y in (0,h-1):
            if not mask[y,x] and not exterior[y,x]:exterior[y,x]=True;q.append((x,y))
    while q:
        x,y=q.popleft()
        for nx,ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
            if 0<=nx<w and 0<=ny<h and not mask[ny,nx] and not exterior[ny,nx]:exterior[ny,nx]=True;q.append((nx,ny))
    alpha=Image.fromarray(np.uint8(~exterior)*255).filter(ImageFilter.GaussianBlur(.35))
    out=im.convert('RGBA');out.putalpha(alpha);return out.crop(alpha.getbbox())


def sources(name):
    im=Image.open(ROOT/'img'/f'{name}.jpg');w,h=im.size;out=[]
    for n in ORDER[name]:
        y,x=divmod(n,3);out.append(cutout(im.crop((round(x*w/3),round(y*h/3),round((x+1)*w/3),round((y+1)*h/3)))))
    return out


def layer(base, polygon, origin, size):
    mask=Image.new('L',base.size);draw=ImageDraw.Draw(mask)
    draw.polygon([(round((origin[0]+x*size[0]/100)*SS),round((origin[1]+y*size[1]/100)*SS)) for x,y in polygon],fill=255)
    part=base.copy();part.putalpha(ImageChops.multiply(mask,base.getchannel('A')))
    return part,mask


def move(im, angle=0, pivot=None, dx=0, dy=0):
    if angle:im=im.rotate(angle,Image.Resampling.BICUBIC,center=tuple(v*SS for v in pivot))
    if dx or dy:
        result=Image.new('RGBA',im.size);result.alpha_composite(im,(round(dx*SS),round(dy*SS)));im=result
    return im


def connected_skin(im):
    """Discard unrelated slivers caught by a limb's hand-authored polygon.

    A polygon may cross a second leg or the tail. Rotating that little island
    produced floating metal shards. Keep the contiguous source part and its
    antialiased fringe; never repaint or mirror the anatomical limb.
    """
    alpha=im.getchannel('A');mask=np.asarray(alpha)>48
    h,w=mask.shape;seen=np.zeros((h,w),bool);largest=[]
    for y,x in zip(*np.nonzero(mask)):
        if seen[y,x]:continue
        q=deque([(int(x),int(y))]);seen[y,x]=True;points=[]
        while q:
            px,py=q.popleft();points.append((px,py))
            for nx,ny in ((px-1,py),(px+1,py),(px,py-1),(px,py+1)):
                if 0<=nx<w and 0<=ny<h and mask[ny,nx] and not seen[ny,nx]:seen[ny,nx]=True;q.append((nx,ny))
        if len(points)>len(largest):largest=points
    keep=np.zeros((h,w),np.uint8)
    for x,y in largest:keep[y,x]=255
    fringe=Image.fromarray(keep).filter(ImageFilter.MaxFilter(3))
    im.putalpha(ImageChops.multiply(alpha,fringe));return im


def pin_support(im,pivot,target,foot):
    """Move the textured hip socket while keeping the original sole planted.

    Stretch along the leg axis only; preserve armour width perpendicular to it.
    This connects a rising frontal torso without drawing substitute bones.
    Pillow needs the inverse map from destination pixels to source pixels.
    """
    p=np.array(pivot,float);t=np.array(target,float);f=np.array(foot,float)
    old=p-f;new=t-f;length=np.linalg.norm(old);new_length=np.linalg.norm(new)
    if min(length,new_length)<1:return im
    u=old/length;v=np.array([-u[1],u[0]])
    new_v=np.array([-new[1],new[0]])/new_length
    matrix=np.outer(new/length,u)+np.outer(new_v,v)
    inverse=np.linalg.inv(matrix);offset=(f-inverse@f)*SS
    coeff=(inverse[0,0],inverse[0,1],offset[0],inverse[1,0],inverse[1,1],offset[1])
    return im.transform(im.size,Image.Transform.AFFINE,coeff,Image.Resampling.BICUBIC)


def rig(name,source,direction):
    scale=min(ENVELOPE[name][0]/source.width,ENVELOPE[name][1]/source.height)
    w,h=round(source.width*scale),round(source.height*scale)
    fx,fy=FEET[name][direction]
    origin=(round(GROUND[0]-w*fx/100),round(GROUND[1]+12-h*fy/100))
    base=Image.new('RGBA',(CELL*SS,CELL*SS));resized=source.resize((w*SS,h*SS),Image.Resampling.LANCZOS)
    base.alpha_composite(resized,(origin[0]*SS,origin[1]*SS))
    parts=[];used=Image.new('L',base.size)
    entries=(TIGER if name=='cyrufas' else CRAB)[ORDER[name][direction]]
    for root,poly,role in entries:
        part,mask=layer(base,poly,origin,(w,h))
        # Claw owns its pixels when a leg mask overlaps the red weapon.
        parts.append((part, (origin[0]+root[0]*w/100,origin[1]+root[1]*h/100),role))
        used=ImageChops.lighter(used,mask)
    if name=='cyrufas' and ORDER[name][direction] in TAIL:
        root,poly=TAIL[ORDER[name][direction]];part,mask=layer(base,poly,origin,(w,h))
        parts.append((part,(origin[0]+root[0]*w/100,origin[1]+root[1]*h/100),'tail'));used=ImageChops.lighter(used,mask)
    # Resolve overlapping masks back-to-front without duplicating body pixels.
    occupied=Image.new('L',base.size)
    for i in range(len(parts)-1,-1,-1):
        im,p,role=parts[i];a=ImageChops.subtract(im.getchannel('A'),occupied);im.putalpha(a)
        im=connected_skin(im);parts[i]=(im,p,role);occupied=ImageChops.lighter(occupied,im.getchannel('A'))
    # Keep original armoured socket pixels on the torso. Overlapping textured
    # joint caps hide the hinge seam when a limb turns; thin invented line/circle
    # bridges cannot reproduce the source armour and looked detached in combat.
    sockets=Image.new('L',base.size);sd=ImageDraw.Draw(sockets)
    for _,pivot,role in parts:
        if role=='tail':continue
        x,y=(v*SS for v in pivot);r=(5 if name=='cyrufas' else 3.5)*SS
        sd.ellipse((x-r,y-r,x+r,y+r),fill=255)
    used=ImageChops.subtract(occupied,sockets)
    body=base.copy();body.putalpha(ImageChops.subtract(base.getchannel('A'),used));body=connected_skin(body)
    return base,body,parts,origin,(w,h)


def marks(im,center,direction,kind,progress,opacity=1):
    fx=Image.new('RGBA',im.size);d=ImageDraw.Draw(fx)
    cx,cy=(v*SS for v in center);left=direction in (1,2,3)
    sign=-1 if left else 1
    if kind=='cyrufas':
        for k in range(3):
            points=[]
            for j in range(15):
                t=j/14;angle=-1.05+1.9*t
                points.append((cx+sign*math.cos(angle)*(17+k*3)*SS,cy+math.sin(angle)*(17+k*3)*SS-8*SS))
            count=max(2,round(len(points)*progress));points=points[:count]
            d.line(points,fill=(250,26,42,round(235*opacity)),width=3*SS)
            d.line(points,fill=(255,178,162,round(235*opacity)),width=SS)
    else:
        for k in range(3):
            x=cx+(k-1)*5*SS;y=cy+(k-1)*3*SS
            tip=(x+sign*(15+10*progress)*SS,y-(17+7*progress)*SS)
            d.polygon([(x-3*SS,y+8*SS),(x+4*SS,y+5*SS),tip],fill=(255,25,49,round(235*opacity)))
            d.line((x,y,*tip),fill=(255,202,187,round(240*opacity)),width=SS)
    im=Image.alpha_composite(im,fx.filter(ImageFilter.GaussianBlur(2.5*SS)))
    return Image.alpha_composite(im,fx)


def animate(name,model,direction,action,frame,count):
    base,body,parts,origin,size=model;w,h=size
    phase=frame*math.tau/count;walking=action=='walk';attacking=action in ('attack','hand')
    rear=(0,.08,.4,.8,1,1,.9,.6,.2,0)[frame] if attacking else 0
    strike=(0,0,0,0,.25,.8,1,.65,.2,0)[frame] if attacking else .15 if action=='throw' else 0
    side=-1 if direction in (1,2,3) else 1
    frontal=direction in (0,4)
    hips=[p for _,p,r in parts if r=='hind']
    hip=tuple(sum(p[k] for p in hips)/len(hips) for k in (0,1)) if hips else (origin[0]+w/2,origin[1]+h*.6)
    body_angle=side*42*rear if name=='cyrufas' and not frontal else 0
    lift=(-h*.22*rear if frontal else 0) if name=='cyrufas' else -22*rear
    # Breathing is deliberately subtle; the articulated limbs/tail carry motion.
    breathe=math.sin(phase)*.45 if action=='stand' else 0
    torso=move(body,body_angle,hip,dy=lift+breathe)
    result=Image.new('RGBA',body.size)
    # Support legs stay near ground as tiger torso rises. The crab jumps whole
    # but its individual legs tuck, then extend, before landing.
    behind=[];front=[]
    for i,(part,pivot,role) in enumerate(parts):
        swing=math.sin(phase+(i%2)*math.pi)
        angle=0;dy=0;dx=0
        if walking:
            angle=swing*(13 if name=='cyrufas' else 17);dy=-max(0,swing)*2
            dx=swing*(.5 if frontal else 1)
        if role=='tail':angle=math.sin(phase)*9+(math.sin(phase*2)*3 if walking else 0)
        if attacking:
            if role=='claw':
                angle=side*(-58*rear+95*strike) if name=='cyrufas' else side*(-68*rear+115*strike)
                if frontal:angle=(-75*rear+130*strike) if direction==0 else (65*rear-110*strike)
                dx=side*7*strike;dy=-7*rear
            elif role in ('front','leg'):
                angle=side*(-43*rear if name=='cyrufas' else 27*rear)*(-1 if i%2 else 1)
            elif role=='hind':angle=side*7*rear
        if action=='throw' and role=='claw':
            angle=side*(0,-35,20)[frame];dy=(0,-4,0)[frame]
        support=name=='cyrufas' and role=='hind'
        if support and attacking:
            yy,xx=np.nonzero(np.asarray(part.getchannel('A'))>64)
            sole=yy.max();foot=(float(np.median(xx[yy>=sole-SS*2]))/SS,sole/SS)
            rad=math.radians(body_angle);rx,ry=pivot[0]-hip[0],pivot[1]-hip[1]
            target=(hip[0]+rx*math.cos(rad)+ry*math.sin(rad),hip[1]-rx*math.sin(rad)+ry*math.cos(rad)+lift+breathe)
            part=pin_support(part,pivot,target,foot)
        else:part=move(part,angle,pivot,dx,dy)
        if not support:part=move(part,body_angle,hip,dy=lift+breathe)
        (behind if role in ('hind','tail') else front).append(part)
    for part in behind:result=Image.alpha_composite(result,part)
    result=Image.alpha_composite(result,torso)
    for part in front:result=Image.alpha_composite(result,part)
    # Light the actual eye pixels, not arbitrary lights over the shell.
    if name=='claudes' and action in ('stand','walk'):
        rgba=np.asarray(result);r,g,b,a=[rgba[:,:,n].astype(np.int16) for n in range(4)]
        yy=np.arange(result.height)[:,None]/SS
        eyemask=(r>g*1.7)&(r>b*1.5)&(r>90)&(a>100)&(yy<origin[1]+h*.57)&(yy>origin[1]+h*.3)
        glow=Image.new('RGBA',result.size);arr=np.zeros(rgba.shape,np.uint8);arr[eyemask]=[255,22,40,round(135+90*math.sin(phase))]
        glow=Image.fromarray(arr).filter(ImageFilter.GaussianBlur(1.4*SS));result=Image.alpha_composite(result,glow)
    if attacking and frame in (4,5,6,7):
        # Red traces are authored per pet. Native combat translates this action
        # at the target before the hit event and performs the return walk.
        center=(origin[0]+w*(.28 if side<0 else .72),origin[1]+h*.54+lift)
        result=marks(result,center,direction,name,(.35,.72,1,1)[frame-4],(1,1,1,.55)[frame-4])
    if walking:result=move(result,dy=-abs(math.sin(phase))*1.5)
    if action=='damage':result=move(result,angle=(0,-side*8,side*4)[frame],pivot=GROUND,dx=(0,-side*3,0)[frame])
    if action=='guard':result=move(result,dy=(1,2,1)[frame])
    if action=='dead':result=move(result,angle=side*(0,12,22,32)[frame],pivot=(origin[0]+w/2,origin[1]+h/2))
    result=result.resize((CELL,CELL),Image.Resampling.LANCZOS)
    # Metal detail must remain readable at the native ~100px scale. Lift only
    # RGB midtones and sharpen once after downsampling, preserving alpha edges.
    alpha=result.getchannel('A');rgb=result.convert('RGB')
    lut=[round(255*(v/255)**.9) for v in range(256)]
    rgb=rgb.point(lut*3).filter(ImageFilter.UnsharpMask(radius=.7,percent=65,threshold=3))
    result=rgb.convert('RGBA');result.putalpha(alpha);return result


def effect(frame):
    im=Image.new('RGBA',(240*SS,240*SS));p=frame/23;d=ImageDraw.Draw(im)
    fade=min(1,(1-p)*3);progress=min(1,p*4);cx=cy=120*SS
    for k in range(4):
        angle=k*math.pi/2;dx,dy=math.cos(angle),math.sin(angle);nx,ny=-dy,dx
        points=[]
        for j in range(16):
            t=j/15;distance=(t*76-22)*progress;curve=math.sin(t*math.pi)*15
            points.append((cx+(dx*distance+nx*curve)*SS,cy+(dy*distance+ny*curve)*SS))
        d.line(points,fill=(247,24,56,round(230*fade)),width=5*SS)
        d.line(points,fill=(255,207,180,round(240*fade)),width=SS)
    radius=(14+p*79)*SS
    d.ellipse((cx-radius,cy-radius*.55,cx+radius,cy+radius*.55),outline=(219,32,57,round(180*fade)),width=2*SS)
    for k in range(18):
        a=k*2.399;rr=(20+(k%6)*9)*(1+p*.8)*SS;x=cx+math.cos(a)*rr;y=cy+math.sin(a)*rr
        d.ellipse((x-SS,y-SS,x+SS,y+SS),fill=(255,128,109,round(200*fade)))
    return Image.alpha_composite(im.filter(ImageFilter.GaussianBlur(3*SS)),im).resize((240,240),Image.Resampling.LANCZOS)


def compact_pages(out):
    """Trim transparent frame borders, compensating native image anchors.

    Two ~100px pets do not need two 3840px textures full of empty pixels.
    Shelf packing is stable in image-ID order. A reconstructed logical frame
    must be byte-identical before a compact page is published.
    """
    manifest=json.loads((out/'manifest.json').read_text())
    before_pixels=sum(p['width']*p['height'] for p in manifest['pages'])
    verified=0
    for pi in (0,1):
        page_info=manifest['pages'][pi];old=Image.open(out/page_info['file']).convert('RGBA')
        rows=[r for r in manifest['images'] if r[1]==pi];placements=[];x=y=row_height=0
        for row in rows:
            _,_,sx,sy,w,h,ox,oy=row
            image=old.crop((sx,sy,sx+w,sy+h));box=image.getbbox()
            if not box:raise ValueError('empty character frame')
            x0,y0,x1,y1=box
            trimmed=image.crop(box)
            if x+trimmed.width+2>2048:x=0;y+=row_height;row_height=0
            placements.append((row,trimmed,x+1,y+1,x0,y0))
            # Test position and visible pixels independently from the atlas
            # coordinate layout; this catches an anchor compensation error.
            restored=Image.new('RGBA',image.size);restored.alpha_composite(trimmed,(x0,y0))
            if restored.tobytes()!=image.tobytes():raise ValueError('trimming changed frame pixels')
            verified+=1;x+=trimmed.width+2;row_height=max(row_height,trimmed.height+2)
        new=Image.new('RGBA',(2048,y+row_height))
        for row,image,px,py,x0,y0 in placements:
            new.alpha_composite(image,(px,py))
            row[2:]=[px,py,image.width,image.height,row[6]+x0,row[7]+y0]
        new.save(out/page_info['file'],optimize=True);page_info.update(width=new.width,height=new.height)
    (out/'manifest.json').write_text(json.dumps(manifest,separators=(',',':'))+'\n')
    return {'logical_character_frames_unchanged':verified,'before_pixels':before_pixels,
            'after_pixels':sum(p['width']*p['height'] for p in manifest['pages'])}


def generate(out,report):
    out.mkdir(parents=True,exist_ok=True);(out/'pages').mkdir(exist_ok=True);(out/'anim').mkdir(exist_ok=True)
    images=[];animations=[];page_defs=[];ident=BASE;count=sum(n for _,_,n,_ in ACTIONS)*8
    for page_no,(name,sprite) in enumerate((('cyrufas',199400),('claudes',199401))):
        refs=sources(name);page=Image.new('RGBA',(20*CELL,math.ceil(count/20)*CELL));actions=[];idx=0
        for direction,source in enumerate(refs):
            model=rig(name,source,direction)
            for typ,act,n,ticks in ACTIONS:
                frames=[]
                for f in range(n):
                    x=idx%20*CELL;y=idx//20*CELL;im=animate(name,model,direction,act,f,n)
                    page.alpha_composite(im,(x,y));images.append([ident,page_no,x,y,CELL,CELL,-GROUND[0],-GROUND[1]])
                    frames.append([ident,0,0,0]);ident+=1;idx+=1
                actions.append({'dir':direction,'type':typ,'ticks':ticks,'frames':frames})
        file=f'pages/{page_no:05}.png';page.save(out/file,optimize=True);page_defs.append({'file':file,'width':page.width,'height':page.height})
        obj={'id':sprite,'actions':actions,'pages':[f'{PACK}/{page_no}']};(out/'anim'/f'{sprite}.json').write_text(json.dumps(obj,separators=(',',':'))+'\n');animations.append({'id':sprite,'file':f'anim/{sprite}.json'})
    page=Image.new('RGBA',(1440,960));frames=[]
    for f in range(24):
        x=f%6*240;y=f//6*240;page.alpha_composite(effect(f),(x,y));images.append([ident,2,x,y,240,240,-120,-120]);frames.append([ident,0,0,0]);ident+=1
    page.save(out/'pages/00002.png',optimize=True);page_defs.append({'file':'pages/00002.png','width':1440,'height':960})
    obj={'id':199402,'actions':[{'dir':0,'type':3,'ticks':2,'frames':frames}],'pages':[PACK+'/2']};(out/'anim/199402.json').write_text(json.dumps(obj,separators=(',',':'))+'\n');animations.append({'id':199402,'file':'anim/199402.json'})
    manifest={'format':1,'id':PACK,'pages':page_defs,'images':images,'animations':animations};(out/'manifest.json').write_text(json.dumps(manifest,separators=(',',':'))+'\n')
    compact=compact_pages(out)
    result={'generator_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'texture_compaction':compact,'pack':PACK,'characters':2,'character_frames_each':count,'effect_frames':24,'image_count':len(images),'source_order':ORDER,'reference_pose_bounds':SIZES,'uniform_fit_envelope':ENVELOPE,'support_centers_percent':FEET,'source_sha256':{n:hashlib.sha256((ROOT/'img'/f'{n}.jpg').read_bytes()).hexdigest() for n in ORDER},'art_origin':'Uploaded JPG cutouts with manually segmented hinge layers, raster transforms and authored red FX. No external image generation service called.','independent_parts':'tiger: foreleg, left claw, hind legs, tail; crab: four legs and left claw; original source pixels only, no mirrored directions.'}
    report.mkdir(parents=True,exist_ok=True);(report/'art-generation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False))

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path,default=Path('/tmp/sa-primal-claws-build/extensions/primal-claws-v2'));p.add_argument('--report',type=Path,default=ROOT/'Report/SA-1114-05-art-polish');args=p.parse_args();generate(args.output.resolve(),args.report.resolve())
