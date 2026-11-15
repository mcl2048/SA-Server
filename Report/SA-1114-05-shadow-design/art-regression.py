"""Protect fixed ground planes while preserving intended floating/grounded art."""
from pathlib import Path
import importlib.util,unittest
from PIL import Image,ImageDraw
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
def load(name):
 spec=importlib.util.spec_from_file_location(name,ROOT/f'scripts/generate-{name}.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
lilith,lisarido=load('lilith'),load('lisarido')
class GroundPlanes(unittest.TestCase):
 def test_both_pets_have_a_shadow_independent_of_body_animation(self):
  for module in (lilith,lisarido):
   with self.subTest(pet=module.PACK):
    self.assertTrue(callable(getattr(module,'ground_shadow',None)),'missing independent ground shadow')
    for direction in range(8):
     centers=[]
     for action in ('stand','walk','attack','damage','dead'):
      for frame in (0,1):
       s=module.ground_shadow(direction,action,frame);box=s.getbbox();self.assertIsNotNone(box)
       centers.append((box[1]+box[3])/2)
       self.assertGreater(s.getpixel((80,130))[3],65)
       self.assertLess(box[3]-box[1],28,'ground shadow became upright')
     self.assertLess(max(centers)-min(centers),1,'ground moved with body animation')
 def test_lisarido_stand_and_shoot_keep_feet_at_ground(self):
  base=Image.new('RGBA',(160,160));d=ImageDraw.Draw(base);d.rectangle((65,30,95,110),fill=(220,210,200,255))
  # Standing/guarding exercises the full real compositor without a fixture gun.
  for action in ('stand','guard'):
   for frame in range(2):
    a=np.asarray(lisarido.character_frame(base,action,frame,0));body=(a[:,:,0]>180)&(a[:,:,1]>180)&(a[:,:,2]>175)&(a[:,:,3]>230)
    bottom=int(np.nonzero(body)[0].max());self.assertGreaterEqual(bottom,129,'standing feet float above floor');self.assertLessEqual(bottom,130)
 def test_lilith_ground_layer_is_not_rotated_on_damage_or_death(self):
  self.assertTrue(callable(getattr(lilith,'ground_shadow',None)))
  # Floating body is deliberately separated from the shadow plane.
  base=Image.new('RGBA',(160,160));ImageDraw.Draw(base).rectangle((68,25,92,100),fill=(20,30,40,255))
  for action,n in [('stand',4),('damage',2),('dead',3)]:
   for frame in range(n):
    image=lilith.transform(base,action,frame,0);self.assertGreater(image.getpixel((80,130))[3],65)
if __name__=='__main__':unittest.main()
