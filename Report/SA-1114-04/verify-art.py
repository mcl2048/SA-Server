"""Validate the new native atlas and retain offline artwork previews."""
from pathlib import Path
import hashlib
import json

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
PACK = Path('/tmp/sa-lisarido-build/extensions/lisarido-v1')
manifest = json.loads((PACK/'manifest.json').read_text())
pages = [Image.open(PACK/p['file']).convert('RGBA') for p in manifest['pages']]
entries = {e[0]: e for e in manifest['images']}
assert len(entries) == len(manifest['images']) == 256
assert all(9200000 <= i < 9300000 for i in entries)


def cell(image_id):
    _, pi, x, y, w, h, *_ = entries[image_id]
    assert x >= 0 and y >= 0 and x+w <= pages[pi].width and y+h <= pages[pi].height
    return pages[pi].crop((x, y, x+w, y+h))


character = json.loads((PACK/'anim/199300.json').read_text())
effect = json.loads((PACK/'anim/199301.json').read_text())
assert len(character['actions']) == 64
idle_heights, unique_counts = [], []
for action in character['actions']:
    hashes = set()
    for frame in action['frames']:
        im = cell(frame[0]); assert im.size == (160, 160)
        box = im.getchannel('A').point(lambda v: 255 if v >= 80 else 0).getbbox()
        assert box and box[0] > 0 and box[1] > 0 and box[2] < 160 and box[3] < 160, (action, box)
        hashes.add(hashlib.sha256(im.tobytes()).hexdigest())
        if action['type'] == 3:
            body = im.crop((0,0,160,116)).getchannel('A').point(lambda v:255 if v>=80 else 0).getbbox()
            assert body and body[3] < 116
            idle_heights.append(body[3]-body[1])
    assert len(hashes) > 1, (action['dir'],action['type'])
    unique_counts.append(len(hashes))
assert min(idle_heights) >= 95 and max(idle_heights) <= 100
assert len(effect['actions'][0]['frames']) == 24
assert all(cell(f[0]).size == (240,240) for f in effect['actions'][0]['frames'])

art = OUT/'art'; art.mkdir(exist_ok=True)
sheet = Image.new('RGB',(1280,380),'#263643'); draw = ImageDraw.Draw(sheet)
for direction in range(8):
    action = next(a for a in character['actions'] if a['type']==3 and a['dir']==direction)
    c = cell(action['frames'][0][0]); sheet.paste(c,(direction*160,24),c)
    draw.text((direction*160+48,8),'DIR '+str(direction),fill='white')
for i,(typ,f,label) in enumerate(((3,1,'IDLE'),(4,2,'FLOAT'),(0,1,'RAISE'),(0,2,'FIRE'),(0,3,'BURST'),(6,4,'CANNON'),(1,0,'HIT'),(2,2,'FAINT'))):
    action=next(a for a in character['actions'] if a['type']==typ and a['dir']==7)
    c=cell(action['frames'][f][0]); sheet.paste(c,(i*160,210),c)
    draw.text((i*160+40,188),label,fill='white')
sheet.save(art/'lisarido-directions-actions.png')
for typ,name in ((3,'idle'),(0,'attack'),(6,'cannon')):
    action=next(a for a in character['actions'] if a['type']==typ and a['dir']==0); frames=[]
    for frame in action['frames']:
        c=cell(frame[0]).resize((320,320),Image.Resampling.NEAREST)
        im=Image.new('RGB',c.size,'#263643'); im.paste(c,(0,0),c); frames.append(im)
    frames[0].save(art/(name+'.gif'),save_all=True,append_images=frames[1:],duration=action['ticks']*1000//60,loop=0)
frames=[]
for frame in effect['actions'][0]['frames']:
    c=cell(frame[0]); im=Image.new('RGB',c.size,'#263643'); im.paste(c,(0,0),c); frames.append(im)
frames[0].save(art/'electromagnetic.gif',save_all=True,append_images=frames[1:],duration=33,loop=0)
frames[10].save(art/'electromagnetic.png')
result = {
    'character_frames':232,'effect_frames':24,'all_64_actions_animated':True,
    'minimum_unique_action_frames':min(unique_counts),'clipped_opaque_character_frames':0,
    'idle_body_height_px':{'min':min(idle_heights),'max':max(idle_heights),'frames':len(idle_heights)},
    'lilith_reference_body_px':[96,98], 'dragon_reference_front_px':145,
    'relative_to_dragon_front':[min(idle_heights)/145,max(idle_heights)/145],
    'height_excludes':'transparent margins and floor ring',
    'files':{p.relative_to(PACK).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(PACK.rglob('*')) if p.is_file()},
}
(OUT/'art-validation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result,ensure_ascii=False))
