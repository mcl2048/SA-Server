#!/usr/bin/env python3
"""Regression checks for the shoulder-led right-cannon attack, not texture variance."""
import importlib.util
from pathlib import Path
import unittest

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('lisarido', ROOT / 'scripts/generate-lisarido.py')
art = importlib.util.module_from_spec(spec)
spec.loader.exec_module(art)


class CannonAttack(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sources = art.source_frames()

    def pose(self, direction, amount):
        self.assertTrue(callable(getattr(art, 'pose_cannon', None)),
                        'attack must raise the complete right cannon arm around its shoulder')
        return art.pose_cannon(self.sources[direction], direction, amount)

    def test_all_eight_views_raise_the_gun_hand_and_aim_the_actual_muzzle(self):
        # The v2 ±13-degree rotation around the gun centre cannot lift the hand
        # or align its muzzle with the enemy in the rear/front directions.
        for direction in range(8):
            with self.subTest(direction=direction):
                rest, aim = self.pose(direction, 0), self.pose(direction, 1)
                self.assertLess(aim['hand'][1], rest['hand'][1] - 7,
                                'gun hand must rise visibly, not just the barrel texture')
                self.assertEqual(aim['shoulder'], rest['shoulder'], 'arm detached from shoulder')
                muzzle = np.array(aim['muzzle']) - aim['breech']
                facing = np.array(art.CANNON_FACING[direction])
                cosine = np.dot(muzzle, facing) / np.linalg.norm(muzzle) / np.linalg.norm(facing)
                self.assertGreater(cosine, .995, 'physical muzzle points away from the opponent')
                for point in (aim['muzzle'], aim['hand']):
                    self.assertTrue(all(9 < v < 151 for v in point), 'raised cannon clipped the frame')
                self.assertGreater(aim['arm'].getchannel('A').getextrema()[1], 240)

    def test_complete_right_arm_is_removed_before_it_is_reposed(self):
        for direction in range(8):
            with self.subTest(direction=direction):
                rest = self.pose(direction, 0)
                source = np.asarray(self.sources[direction])
                removed = np.asarray(rest['body'])
                arm = np.asarray(rest['arm'])
                # The resting gun must occur once. Repairing with a mirrored
                # whole-body sample used to leave gun-coloured ghosts/limbs.
                mask = arm[:, :, 3] > 220
                brown = lambda a: ((a[:, :, 0] > a[:, :, 2] + 9) &
                                   (a[:, :, 1] > a[:, :, 2] + 4) &
                                   (a[:, :, 0] < 181) & (a[:, :, 1] < 166) &
                                   (a[:, :, 2] < 145) & (a[:, :, 3] > 160))
                self.assertGreater(np.count_nonzero(mask & brown(source.astype(int))), 150)
                y, x = np.indices(mask.shape)
                mx, my = art.CANNON_RIG[direction]['muzzle']
                muzzle_area = (x-mx)**2 + (y-my)**2 <= 7**2
                self.assertLess(np.count_nonzero(mask & brown(removed.astype(int)) & muzzle_area), 8,
                                'the original lowered muzzle survives behind the raised one')

    def test_attacking_does_not_copy_or_remove_the_legs_with_the_cannon(self):
        for direction,source in enumerate(self.sources):
            rest=np.asarray(art.character_frame(source,'attack',0,direction))
            for frame in (1,2):
                attack=np.asarray(art.character_frame(source,'attack',frame,direction))
                self.assertTrue(np.array_equal(rest[118:,60:97],attack[118:,60:97]),
                                f'dir{direction} frame{frame}: gun mask owns a leg or planted foot')


    def test_attack_returns_to_rest_without_moving_feet_or_floor(self):
        for direction, source in enumerate(self.sources):
            for action in ('attack', 'hand'):
                rest = art.character_frame(source, action, 0, direction)
                returned = art.character_frame(source, action, 5, direction)
                self.assertTrue(np.array_equal(np.asarray(rest)[114:], np.asarray(returned)[114:]),
                                'attack return changed planted feet or fixed shadow')
                a = np.asarray(art.character_frame(source, action, 3, direction))
                self.assertGreater(a[130, 80, 3], 65)
                self.assertEqual(art.ground_shadow(direction, action, 0).tobytes(),
                                 art.ground_shadow(direction, action, 3).tobytes())

    def test_hit_flash_waits_until_after_the_aim_pose(self):
        # Read actual composited pixels: no orange muzzle flare on rest/aim,
        # visible flare only on the firing frame, removed by complete return.
        for direction, source in enumerate(self.sources):
            counts = []
            for frame in (0, 2, 3, 5):
                a = np.asarray(art.character_frame(source, 'attack', frame, direction)).astype(int)
                flare = (a[:, :, 0] > 235) & (a[:, :, 1] > 70) & (a[:, :, 1] < 205) & (a[:, :, 2] < 100) & (a[:, :, 3] > 150)
                counts.append(int(np.count_nonzero(flare)))
            self.assertLess(counts[1], 8, f'dir{direction}: flame obscures the raised aim pose')
            self.assertGreater(counts[2], 25)
            self.assertLess(counts[3], 8)


if __name__ == '__main__':
    unittest.main()
