"""Reanalyse replay with MuZero, distil its economic actions into a small tree.

Only the 16 public economic/roster summary features are used by the tree. The
teacher still sees the full observation. This creates candidates, not approvals.
"""
import argparse
from collections import Counter
import hashlib
import importlib.util
import json
from pathlib import Path
import random
import sys

import torch

spec = importlib.util.spec_from_file_location("muzero_distill", Path(__file__).with_name("train-autochess-muzero.py"))
m = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = m
spec.loader.exec_module(m)

FEATURES = ["round/32", "hp/20", "gold/100", "level/10", "xpCost/40", "cap/10",
    "boardCount/10", "benchCount/8", "twoStars/10", "threeStars/10", "melee/10",
    "enemyModifier", "novice", "veteran", "deep", "oracle"]


def tree(rows, depth, minimum):
    counts = Counter(y for _, y in rows)
    leaf = {"action": counts.most_common(1)[0][0], "samples": len(rows), "counts": dict(counts)}
    if depth == 0 or len(rows) < minimum * 2 or len(counts) == 1:
        return leaf
    best = None
    for feature in range(len(FEATURES)):
        values = sorted(set(x[feature] for x, _ in rows))
        thresholds = [(a + b) / 2 for a, b in zip(values, values[1:])]
        if len(thresholds) > 32:
            thresholds = [thresholds[i * len(thresholds) // 32] for i in range(32)]
        for threshold in thresholds:
            left = [(x, y) for x, y in rows if x[feature] <= threshold]
            right = [(x, y) for x, y in rows if x[feature] > threshold]
            if min(len(left), len(right)) < minimum:
                continue
            def impurity(group):
                return len(group) - sum(n * n for n in Counter(y for _, y in group).values()) / len(group)
            score = impurity(left) + impurity(right)
            if best is None or score < best[0]:
                best = score, feature, threshold, left, right
    if best is None:
        return leaf
    _, feature, threshold, left, right = best
    return {**leaf, "feature": feature, "threshold": threshold,
        "left": tree(left, depth - 1, minimum), "right": tree(right, depth - 1, minimum)}


def predict(node, observation):
    while "feature" in node:
        node = node["left"] if observation[node["feature"]] <= node["threshold"] else node["right"]
    return node["action"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("checkpoint")
    parser.add_argument("--samples", type=int, default=1200)
    parser.add_argument("--simulations", type=int, default=48)
    parser.add_argument("--depth", type=int, default=4)
    parser.add_argument("--minimum", type=int, default=24)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    torch.set_num_threads(1)
    rng = random.Random(77018)
    saved = torch.load(args.checkpoint, weights_only=False)
    network = m.Network(saved["inputs"], len(saved["actions"]))
    network.load_state_dict(saved["network"])
    network.eval()
    observations = [o for e in saved["replay"] for o in e["observations"][:-1]]
    rng.shuffle(observations)
    rows, details = [], []
    for i, obs in enumerate(observations[:args.samples]):
        visits, value = m.search(network, obs, args.simulations, 0.97, rng, noise=False)
        action = max(range(len(visits)), key=lambda a: visits[a])
        rows.append((obs[:len(FEATURES)], action))
        details.append({"observation": obs[:len(FEATURES)], "action": action, "visits": visits, "value": value})
        if (i + 1) % 100 == 0:
            print(json.dumps({"labelled": i + 1}), flush=True)
    # This split checks fidelity to the teacher; it is NOT gameplay validation.
    split = int(len(rows) * 0.8)
    distilled = tree(rows[:split], args.depth, args.minimum)
    fidelity = sum(predict(distilled, obs) == y for obs, y in rows[split:]) / max(1, len(rows) - split)
    result = {"schema": "autochess-muzero-economic-tree-v1", "fingerprint": saved["fingerprint"],
        "checkpointSha256": hashlib.sha256(Path(args.checkpoint).read_bytes()).hexdigest(),
        "config": vars(args), "features": FEATURES, "actions": saved["actions"],
        "teacherFidelity": fidelity, "tree": distilled, "labels": details}
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output), "teacherFidelity": fidelity, "tree": distilled}), flush=True)


if __name__ == "__main__":
    main()
