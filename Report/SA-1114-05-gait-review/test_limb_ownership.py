"""Regression for source legs incorrectly left attached to the Cyrufas torso.

Landmarks are normalized source positions selected from the visible armour and
paw below each knee, not from generated polygon coordinates. A moving leg must
own these original pixels while the torso contains no duplicate old leg there.
"""
import importlib.util
from pathlib import Path
import unittest
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('primal_claws', ROOT / 'scripts/generate-primal-claws.py')
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)

class SourceLegOwnership(unittest.TestCase):
    def test_lateral_front_lower_leg_is_owned_by_the_animated_limb(self):
        sources = g.sources('cyrufas')
        landmarks = {
            2: [(37, 80), (36, 88), (35, 94)],
            6: [(65, 77), (69, 85), (73, 94)],
            3: [(42, 70), (41, 83), (40, 90)],
            7: [(62, 78), (64, 85), (69, 95)],
        }
        for direction, points in landmarks.items():
            base, body, parts, origin, size = g.rig('cyrufas', sources[direction], direction)
            for nx, ny in points:
                with self.subTest(direction=direction, source=(nx, ny)):
                    pos = (round((origin[0]+nx*size[0]/100)*g.SS), round((origin[1]+ny*size[1]/100)*g.SS))
                    original = base.getpixel(pos)[3]
                    self.assertGreater(original, 240, 'landmark must be real opaque source armour')
                    self.assertLessEqual(body.getpixel(pos)[3], 16, 'old lower leg remains attached to torso')
                    self.assertGreaterEqual(parts[0][0].getpixel(pos)[3], original-16, 'front limb lost its real source texture')

    def test_lateral_hind_paws_retain_their_original_texture(self):
        sources = g.sources('cyrufas')
        for direction, point in ((2, (62, 93)), (6, (41, 92)), (3, (78, 93)), (7, (42, 87))):
            base, body, parts, origin, size = g.rig('cyrufas', sources[direction], direction)
            nx, ny = point
            pos = (round((origin[0]+nx*size[0]/100)*g.SS), round((origin[1]+ny*size[1]/100)*g.SS))
            with self.subTest(direction=direction, source=point):
                original = base.getpixel(pos)[3]
                self.assertGreater(original, 240, 'landmark must be real opaque source paw')
                self.assertGreaterEqual(parts[3][0].getpixel(pos)[3], original-16, 'far hind paw was clipped out of its source layer')

    def test_lateral_torso_contains_no_old_pixels_below_the_knees(self):
        sources = g.sources('cyrufas')
        for direction in (2, 6, 3, 7):
            _, body, _, origin, size = g.rig('cyrufas', sources[direction], direction)
            start = round((origin[1]+size[1]*.73)*g.SS)
            opaque = np.count_nonzero(np.asarray(body.getchannel('A'))[start:] > 32)
            with self.subTest(direction=direction):
                self.assertEqual(opaque, 0, 'a duplicate lower-leg fragment still moves with the torso')

    def test_no_original_lower_leg_texture_is_discarded(self):
        sources = g.sources('cyrufas')
        for direction in (2, 6, 3, 7):
            base, body, parts, origin, size = g.rig('cyrufas', sources[direction], direction)
            start = round((origin[1]+size[1]*.73)*g.SS)
            original = np.asarray(base.getchannel('A'))[start:]
            covered = np.asarray(body.getchannel('A'))[start:].copy()
            for part, _, _ in parts:
                covered = np.maximum(covered, np.asarray(part.getchannel('A'))[start:])
            missing = np.count_nonzero((original > 240) & (covered < 200))
            with self.subTest(direction=direction):
                self.assertEqual(missing, 0, 'source paw/armour pixels were discarded instead of assigned to a limb')

if __name__ == '__main__':
    unittest.main(verbosity=2)
