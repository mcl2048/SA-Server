#!/usr/bin/env python3
"""Protect source anatomy, not the unrelated seated reference's bounding box."""
import importlib.util
from pathlib import Path
import unittest
from PIL import Image,ImageDraw

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('primal_art',ROOT/'scripts/generate-primal-claws.py')
art=importlib.util.module_from_spec(spec);spec.loader.exec_module(art)

class SourceAnatomy(unittest.TestCase):
    def test_all_eight_directions_keep_source_aspect_ratio(self):
        # The old generator squeezes combat dir3/7 to about half their width.
        # Assert independently of the chosen display envelope or native pose.
        for name in art.ORDER:
            for direction,source in enumerate(art.sources(name)):
                with self.subTest(pet=name,direction=direction):
                    _,_,_,_,(w,h)=art.rig(name,source,direction)
                    ratio=(w/source.width)/(h/source.height)
                    self.assertLess(abs(ratio-1),.015,f'anatomy stretched: x/y={ratio:.3f}')

    def test_turning_does_not_shrink_a_long_side_view(self):
        # A longest-edge cap used to reduce tiger side height from 84 to 63px.
        # Visible body height excludes tail/claw width and must survive turning.
        for name,lo,hi in [('cyrufas',80,88),('claudes',84,92)]:
            for direction,source in enumerate(art.sources(name)):
                _,_,_,_,(w,h)=art.rig(name,source,direction)
                with self.subTest(pet=name,direction=direction):
                    self.assertGreaterEqual(h,lo,'side-view animal shrinks on turning')
                    self.assertLessEqual(h,hi)

class GroundShadow(unittest.TestCase):
    def test_shadow_remains_on_ground_during_rear_and_jump(self):
        self.assertTrue(callable(getattr(art,'ground_shadow',None)), 'missing native floor shadow')
        for name in ('cyrufas','claudes'):
            for direction in range(8):
                centers=[]
                for frame in (0,4,6,9):
                    im=art.ground_shadow(name,direction,'attack',frame,10)
                    box=im.getbbox();self.assertIsNotNone(box)
                    centers.append((box[1]+box[3])/2/art.SS)
                    self.assertGreater(im.getpixel((art.GROUND[0]*art.SS,(art.GROUND[1]+10)*art.SS))[3],35)
                self.assertLess(max(centers)-min(centers),1)

class JointSkin(unittest.TestCase):
    def test_support_joint_moves_while_sole_stays_planted(self):
        im=Image.new('RGBA',(art.CELL*art.SS,art.CELL*art.SS));d=ImageDraw.Draw(im)
        d.rectangle((28*art.SS,30*art.SS,32*art.SS,60*art.SS),fill=(80,90,100,255))
        pinned=art.pin_support(im,(30,30),(25,20),(30,60))
        self.assertGreater(pinned.getpixel((30*art.SS,60*art.SS))[3],128)
        self.assertGreater(pinned.getpixel((25*art.SS,20*art.SS))[3],128)

    def test_running_leg_bends_at_knee_and_reaches_contact(self):
        self.assertTrue(callable(getattr(art,'run_limb',None)), 'missing two-joint running articulation')
        im=Image.new('RGBA',(art.CELL*art.SS,art.CELL*art.SS));d=ImageDraw.Draw(im)
        d.rectangle((28*art.SS,30*art.SS,32*art.SS,61*art.SS),fill=(80,90,100,255))
        pose=art.run_limb(im,(30,30),(30,45),(30,60),(30,30),(40,50))
        self.assertGreater(pose.getpixel((40*art.SS,50*art.SS))[3],64)
        self.assertLess(pose.getbbox()[0],28*art.SS,'leg was only rotated as a rigid straight strip')

    def test_skin_removes_detached_scrap_but_keeps_main_limb(self):
        im=Image.new('RGBA',(60,60));d=ImageDraw.Draw(im)
        d.rectangle((10,10,24,45),fill=(80,90,100,255))
        d.rectangle((40,20,42,22),fill=(80,90,100,255))
        cleaned=art.connected_skin(im)
        self.assertEqual(cleaned.getpixel((15,30)),(80,90,100,255))
        self.assertEqual(cleaned.getpixel((41,21))[3],0)

if __name__=='__main__':unittest.main()
