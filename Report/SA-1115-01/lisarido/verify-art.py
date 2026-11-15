"""Check final shipped frames, contracts and package; do not infer visual quality."""
import hashlib,io,json,tarfile
from pathlib import Path
from PIL import Image
import numpy as np
ROOT=Path(__file__).resolve().parents[3]
out=Path(__file__).resolve().parent
new=ROOT/'assets/extensions/lisarido-v3'
manifest=json.loads((new/'manifest.json').read_text())
old_tar=tarfile.open(ROOT/'update/lisarido-v2-assets.tar.gz')
def old_file(name):return old_tar.extractfile('extensions/lisarido-v2/'+name).read()
old_manifest=json.loads(old_file('manifest.json'))
old_anim=json.loads(old_file('anim/199300.json'))
anim=json.loads((new/'anim/199300.json').read_text())
assert len(manifest['images'])==256
assert manifest['images']==old_manifest['images'],'image IDs/rectangles/anchors drifted'
assert anim['actions']==old_anim['actions'],'directions/actions/ticks/frame contract drifted'
assert (new/'pages/00001.png').read_bytes()==old_file('pages/00001.png'),'ranged electrical effects changed'
old_page=Image.open(io.BytesIO(old_file('pages/00000.png'))).convert('RGBA')
new_page=Image.open(new/'pages/00000.png').convert('RGBA')
images={row[0]:row for row in manifest['images']}
preserved=0;changed=0;bounds=[]
for action in anim['actions']:
 for image,*_ in action['frames']:
  _,page,x,y,w,h,ax,ay=images[image]
  frame=new_page.crop((x,y,x+w,y+h));box=frame.getbbox();assert box
  assert box[0]>0 and box[1]>0 and box[2]<w and box[3]<h,(action['dir'],action['type'],box)
  same=frame.tobytes()==old_page.crop((x,y,x+w,y+h)).tobytes()
  if action['type'] in (3,4,1,2,10):assert same;preserved+=1
  else:changed+=not same
  bounds.append({'dir':action['dir'],'action':action['type'],'image':image,'bbox':box})
package=json.loads((ROOT/'update/lisarido-v3-assets.manifest.json').read_text())
archive=(ROOT/'update/lisarido-v3-assets.tar.gz').read_bytes()
assert hashlib.sha256(archive).hexdigest()==package['archive']['sha256']
assert len(archive)==package['archive']['size']
for entry in package['entries']:
 p=ROOT/'assets'/entry['path'];assert p.is_file() and not p.is_symlink()
 data=p.read_bytes();assert len(data)==entry['size'] and hashlib.sha256(data).hexdigest()==entry['sha256']
result={'image_frames':256,'character_frames':232,'character_actions':len(anim['actions']),'native_ids_rectangles_anchors_and_timing_preserved':True,'unchanged_stand_walk_damage_death_guard_frames':preserved,'changed_attack_hand_throw_frames':changed,'independent_electromagnetic_effect_png_unchanged':True,'all_character_frames_nonempty_inside_canvas':True,'installed_five_files_match_final_package':True,'package':package['archive'],'bounds':bounds}
(out/'art-validation.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='bounds'}))
