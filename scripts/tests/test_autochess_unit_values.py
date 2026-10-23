import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


class UnitValueLabelsTest(unittest.TestCase):
    def test_close_wins_below_ten_thousand_remain_positive_training_labels(self):
        # Identical inputs with comfortable and close wins must have one label.
        # The old 10000 cutoff made each pair contradictory and capped accuracy
        # at 50%; the combat scorer's win/loss clusters are separated by 5000.
        entries = []
        for round_number in range(1, 27):
            for branch, score in enumerate([9990, 10020]):
                key = (f"combat-go-v5/hz:60/enemy:1/round:{round_number}"
                       f"/bastion//normal/1/unit:1/0:unit:1/actual:{branch}")
                entries.append([key, score])
        payload = {"sourceFingerprint": "0" * 64, "combatHz": 60,
                   "unitFeatureNames": ["cost"], "unitFeatures": {"unit": [0.2]},
                   "entries": entries}
        with tempfile.TemporaryDirectory(prefix="autochess-unit-values-") as directory:
            source = Path(directory) / "labels.json"
            output = Path(directory) / "values.json"
            source.write_text(json.dumps(payload), encoding="utf-8")
            subprocess.run([sys.executable, "scripts/train-autochess-unit-values.py",
                            "--cache", str(source), "--output", str(output)],
                           check=True, capture_output=True, text=True, timeout=60)
            report = json.loads(output.read_text(encoding="utf-8"))
            self.assertGreater(report["training"]["heldoutSamples"], 0)
            self.assertEqual(report["training"]["heldoutAccuracy"], 1)


if __name__ == "__main__":
    unittest.main()
