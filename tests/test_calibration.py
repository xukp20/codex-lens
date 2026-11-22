import random
import unittest

from codex_lens.calibration import BASE, calibrate


class CalibrationTests(unittest.TestCase):
    def test_component_model_generalizes_to_contiguous_blocks(self):
        rng = random.Random(42)
        data = []
        for i in range(36):
            a,b,c = (rng.uniform(.1, 4) for _ in range(3))
            d,e,f = (rng.uniform(.1, 4) for _ in range(3))
            mix = {BASE: (a,b,c), "gpt-6.2-astra": (d,e,f)}
            usd = sum((a,b,c,d,e,f))
            data.append({"covered": True, "usd": usd, "components": mix,
                         "delta": (a + 2.8*b + c + d + 2.8*e + f) * .88})
        result = calibrate(data)
        by_name = {r["name"]:r for r in result["candidates"]}
        self.assertEqual(len(by_name), 8)
        self.assertLess(by_name["C"]["holdoutMae"], by_name["Base"]["holdoutMae"]*.4)
        self.assertEqual(result["recommended"], "C")
        estimate = by_name["C"]["params"]["C"]
        self.assertAlmostEqual(estimate["value"], 2.8, delta=.18)
        self.assertLess(estimate["low"], estimate["value"])
        self.assertGreater(estimate["high"], estimate["value"])

    def test_collinear_parameters_are_exploratory(self):
        data = [{"covered": True, "usd": 6*i, "components": {BASE:(i,i*2,i*3)}, "delta": i*4}
                for i in range(1,15)]
        result = calibrate(data)
        self.assertEqual(result["recommended"], "Base")
        self.assertEqual(result["candidates"][2]["status"], "exploratory")
