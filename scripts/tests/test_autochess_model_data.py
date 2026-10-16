"""Training-only checks: python scripts/tests/test_autochess_model_data.py."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

spec = importlib.util.spec_from_file_location(
    "autochess_trainer", Path(__file__).resolve().parents[1] / "train-autochess-go-value.py"
)
trainer = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = trainer
spec.loader.exec_module(trainer)


class RulesVersionTest(unittest.TestCase):
    def load(self, fingerprints):
        with tempfile.TemporaryDirectory() as directory:
            files = []
            for index, fingerprint in enumerate(fingerprints):
                path = Path(directory) / f"{index}.json"
                payload = {"entries": []}
                if fingerprint is not None:
                    payload["sourceFingerprint"] = fingerprint
                path.write_text(json.dumps(payload), encoding="utf-8")
                files.append(path)
            return trainer.load_examples(files, 60)

    def test_current_datasets_retain_rules_version(self):
        self.assertEqual(self.load(["current", "current"])[1]["sourceFingerprint"], "current")

    def test_live_combat_labels_are_accepted(self):
        example = trainer.parse_entry(
            "combat-v2/hz:60/bastion/vitality/normal/1.0/mossback:1/11:sui:2/actual:42",
            10120, "on-policy.json",
        )
        self.assertEqual(example.players, (("sui", 2, 11),))
        self.assertEqual(example.combat_hz, 60)
        self.assertEqual(example.score, 10120)

    def test_different_rules_cannot_share_training_labels(self):
        with self.assertRaisesRegex(ValueError, "different game rules"):
            self.load(["old", "current"])

    def test_unversioned_labels_cannot_join_current_training(self):
        with self.assertRaisesRegex(ValueError, "unversioned caches"):
            self.load([None, "current"])
        self.assertIsNone(self.load([None])[1]["sourceFingerprint"])

    def test_fine_tuning_maps_inserted_features_and_reordered_vocabularies(self):
        torch = trainer.torch
        old_vocab = {"units": ["<unk>", "old"], "starters": ["<unk>", "blaze"],
                     "waveTags": ["normal", "boss"], "augments": ["x", "y"]}
        old = trainer.GoCombatRanker(old_vocab, 24, torch.tensor([[0., 0.], [.1, .2]]))
        previous = {"state": {key: value.tolist() for key, value in old.state_dict().items()},
                    "vocab": old_vocab, "unitFeatureNames": ["a", "b"]}
        new_vocab = {"units": ["<unk>", "new", "old"], "starters": ["blaze", "<unk>"],
                     "waveTags": ["boss", "normal"], "augments": ["y", "extra", "x"]}
        features = torch.tensor([[0., 0., 0.], [.1, .7, .4], [0., .2, .1]])
        new = trainer.GoCombatRanker(new_vocab, 24, features)
        trainer.initialize_model(new, previous, new_vocab, ["newTrait", "b", "a"])
        batch = {"player_unit": torch.tensor([[1]]), "enemy_unit": torch.tensor([[1]]),
                 "player_star": torch.tensor([[2]]), "enemy_star": torch.tensor([[1]]),
                 "player_position": torch.tensor([[3]]), "enemy_position": torch.tensor([[0]]),
                 "player_mask": torch.ones(1, 1), "enemy_mask": torch.ones(1, 1),
                 "starter": torch.tensor([1]), "wave_tag": torch.tensor([0]),
                 "augments": torch.tensor([[1., 0.]]), "modifier": torch.tensor([[.2]])}
        remapped = {**batch, "player_unit": torch.tensor([[2]]), "enemy_unit": torch.tensor([[2]]),
                    "starter": torch.tensor([0]), "wave_tag": torch.tensor([1]),
                    "augments": torch.tensor([[0., 0., 1.]])}
        torch.testing.assert_close(old(batch), new(remapped), rtol=1e-6, atol=1e-6)
        torch.testing.assert_close(new.unit_features, features)
        torch.testing.assert_close(new.unit_embedding.weight[1], old.unit_embedding.weight[0])


if __name__ == "__main__":
    unittest.main()
