"""MuZero correctness checks, independent of strength acceptance."""
import importlib.util
from pathlib import Path
import random
import sys
import unittest

import torch

spec = importlib.util.spec_from_file_location("muzero", Path(__file__).resolve().parents[1] / "train-autochess-muzero.py")
m = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = m
spec.loader.exec_module(m)

comparison_spec = importlib.util.spec_from_file_location("muzero_compare",
    Path(__file__).resolve().parents[1] / "compare-autochess-muzero.py")
comparison = importlib.util.module_from_spec(comparison_spec)
comparison_spec.loader.exec_module(comparison)

merge_spec = importlib.util.spec_from_file_location("muzero_merge",
    Path(__file__).resolve().parents[1] / "merge-autochess-evaluations.py")
merger = importlib.util.module_from_spec(merge_spec)
merge_spec.loader.exec_module(merger)


class RewardModel:
    """A learned-model interface; search has no environment handle."""
    def initial(self, obs):
        return torch.zeros((1, 1)), torch.zeros((1, 2)), torch.zeros(1)

    def recurrent(self, latent, action):
        return latent + 1, (action.float() * 2 - 1), torch.zeros((1, 2)), torch.zeros(1)

    def value(self, latent):
        return torch.zeros((1, 1))


class MuZeroTests(unittest.TestCase):
    def test_single_player_backup_prefers_positive_reward(self):
        policy, value = m.search(RewardModel(), [0], 64, 0.97, random.Random(7), noise=False)
        self.assertGreater(policy[1], 0.75)
        self.assertGreater(value, 0)

    def test_recurrent_dynamics_learns_action_rewards(self):
        torch.set_num_threads(1)
        torch.manual_seed(7)
        model = m.Network(2, 2, hidden=16)
        optimizer = torch.optim.Adam(model.parameters(), lr=0.01)
        replay = [{"observations": [[1, 0], [0, a]], "actions": [a],
            "rewards": [float(a)], "returns": [float(a)], "policies": [[0.5, 0.5]]} for a in [0, 1]]
        rng = random.Random(7)
        for _ in range(100):
            m.train_batch(model, optimizer, replay, rng, 16, 0.97, unroll=1)
        latent, _, _ = model.initial(torch.tensor([[1., 0.]]))
        rewards = [model.recurrent(latent, torch.tensor([a]))[1].item() for a in [0, 1]]
        self.assertLess(abs(rewards[0]), 0.1)
        self.assertLess(abs(rewards[1] - 1), 0.1)

    def test_terminal_observation_has_no_future_value(self):
        torch.set_num_threads(1)
        torch.manual_seed(8)
        model = m.Network(2, 2, hidden=16)
        optimizer = torch.optim.Adam(model.parameters(), lr=0.01)
        replay = [{"observations": [[1, 0], [0, 1]], "actions": [0],
            "rewards": [1.], "returns": [1.], "policies": [[1., 0.]]}]
        rng = random.Random(8)
        for _ in range(150):
            m.train_batch(model, optimizer, replay, rng, 16, 0.97, unroll=2)
        _, _, values = model.initial(torch.tensor([[1., 0.], [0., 1.]]))
        self.assertGreater(values[0].item(), 0.9)
        self.assertLess(abs(values[1].item()), 0.1)
        terminal, _, _ = model.initial(torch.tensor([[0., 1.]]))
        for action in [0, 1]:
            _, reward, _, future_value = model.recurrent(terminal, torch.tensor([action]))
            self.assertLess(abs(reward.item()), 0.1)
            self.assertLess(abs(future_value.item()), 0.1)

    def test_real_environment_reset_is_deterministic_and_closes(self):
        env = m.Environment()
        try:
            results = []
            for _ in range(2):
                first = env.call(command="reset", seed=84999, level="novice", battles=2)
                self.assertEqual(len(first["fingerprint"]), 64)
                self.assertNotIn("seed", first["observation"])
                env.call(command="step", action=1)
                last = env.call(command="step", action=3)
                self.assertTrue(last["done"])
                results.append(last)
            self.assertEqual(results[0], results[1])
        finally:
            env.close()
        self.assertEqual(env.process.returncode, 0)

    def test_campaign_boss_failure_is_terminal_even_with_hp_left(self):
        env = m.Environment()
        try:
            state = env.call(command="reset", seed=86007, level="novice", battles=32)
            while not state["done"]:
                state = env.call(command="step", action=0)
            self.assertEqual(state["info"]["round"], 16)
            self.assertGreater(state["info"]["hp"], 0)
            self.assertFalse(state["info"]["cleared"])
            self.assertLess(state["reward"], 0)
        finally:
            env.close()


class AcceptanceTests(unittest.TestCase):
    @staticmethod
    def report(seed, wins=13, fingerprint="baseline"):
        return {"config": {"level": "novice", "battles": 32},
            "fingerprint": fingerprint, "results": [
                {"seed": seed + i, "wins": wins, "cleared": False, "round": 16}
                for i in range(32)]}

    def test_two_complete_frozen_groups_can_pass(self):
        baselines = [self.report(100), self.report(200)]
        candidates = [self.report(100, 14, "candidate"), self.report(200, 14, "candidate")]
        result = comparison.acceptance(baselines, candidates)
        self.assertTrue(result["passed"])
        self.assertEqual(result["combined"]["runs"], 64)

    def test_partial_overlap_or_changed_strategy_is_rejected(self):
        baselines = [self.report(100), self.report(200)]
        candidates = [self.report(100, 14, "candidate"), self.report(200, 14, "candidate")]
        candidates[1]["results"].pop()
        with self.assertRaisesRegex(ValueError, "Incomplete"):
            comparison.acceptance(baselines, candidates)
        with self.assertRaisesRegex(ValueError, "overlap"):
            comparison.acceptance([self.report(100), self.report(100)],
                [self.report(100, 14, "candidate"), self.report(100, 14, "candidate")])
        with self.assertRaisesRegex(ValueError, "Strategy changed"):
            comparison.acceptance(baselines,
                [self.report(100, 14, "candidate"), self.report(200, 14, "changed")])

    def test_total_gain_cannot_hide_a_regressing_group(self):
        result = comparison.acceptance([self.report(100), self.report(200)],
            [self.report(100, 16, "candidate"), self.report(200, 12, "candidate")])
        self.assertGreater(result["combined"]["meanWinDelta"], 0.25)
        self.assertFalse(result["passed"])

    def test_runtime_differences_cannot_be_pooled_or_compared(self):
        baseline = self.report(100)
        candidate = self.report(100, 14, "candidate")
        candidate["runtime"] = {"browser": "Chrome 1", "hz": 60}
        with self.assertRaisesRegex(ValueError, "Different simulation runtimes"):
            comparison.compare(baseline, candidate, 32)
        baseline["runtime"] = {"browser": "Chrome 1", "hz": 60}
        self.assertEqual(comparison.compare(baseline, candidate, 32)["meanWinDelta"], 1)
        baseline2 = self.report(200)
        candidate2 = self.report(200, 14, "candidate")
        baseline2["runtime"] = candidate2["runtime"] = {"browser": "Chrome 2", "hz": 60}
        with self.assertRaisesRegex(ValueError, "runtime changed"):
            comparison.acceptance([baseline, baseline2], [candidate, candidate2])

    def test_browser_errors_cannot_pass_acceptance(self):
        baseline = self.report(100)
        candidate = self.report(100, 14, "candidate")
        candidate["errors"] = ["Worker crashed"]
        with self.assertRaisesRegex(ValueError, "Evaluation errors"):
            comparison.compare(baseline, candidate, 32)


class MergeTests(unittest.TestCase):
    @staticmethod
    def report(seed):
        return {"config": {"level": "deep", "battles": 32},
            "fingerprint": "frozen", "runtime": {"engine": "Chrome Worker"},
            "results": [{"seed": seed, "level": "deep", "round": 16,
                "wins": 12, "cleared": False, "trace": [{"round": 16}]}], "errors": []}

    def test_complete_disjoint_shards_merge_in_seed_order(self):
        result = merger.merge([self.report(101), self.report(100)], 100, 2)
        self.assertEqual([r["seed"] for r in result["results"]], [100, 101])
        self.assertEqual(result["meanWins"], 12)

    def test_missing_duplicate_and_changed_runtime_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "Missing"):
            merger.merge([self.report(100)], 100, 2)
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            merger.merge([self.report(100), self.report(100)], 100, 2)
        changed = self.report(101)
        changed["runtime"] = {"engine": "Node"}
        with self.assertRaisesRegex(ValueError, "Different"):
            merger.merge([self.report(100), changed], 100, 2)

    def test_errors_and_incomplete_trace_are_rejected(self):
        broken = self.report(100)
        broken["errors"] = ["Worker crashed"]
        with self.assertRaisesRegex(ValueError, "Evaluation errors"):
            merger.merge([broken], 100, 1)
        broken = self.report(100)
        broken["results"][0]["trace"] = []
        with self.assertRaisesRegex(ValueError, "Invalid game trace"):
            merger.merge([broken], 100, 1)


if __name__ == "__main__":
    unittest.main()
