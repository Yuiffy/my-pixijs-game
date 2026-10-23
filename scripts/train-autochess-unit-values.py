"""Fit bounded, static per-unit values from current 60 Hz combat labels.

This produces an inexpensive heuristic candidate, not a strength acceptance.
"""
import argparse
import hashlib
import json
from pathlib import Path
import random

import torch
from torch.nn import functional as F


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", action="append", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--seed", type=int, default=85700)
    args = parser.parse_args()
    datasets = [json.loads(Path(p).read_text(encoding="utf-8")) for p in args.cache]
    fingerprints = {d.get("sourceFingerprint") for d in datasets}
    if len(fingerprints) != 1 or None in fingerprints or "" in fingerprints:
        raise ValueError("Cannot mix missing or different battle-rule fingerprints")
    if any(d.get("combatHz") != 60 for d in datasets):
        raise ValueError("Only formal 60 Hz combat labels are accepted")
    ids = sorted(datasets[0]["unitFeatures"])
    if any(sorted(d["unitFeatures"]) != ids for d in datasets):
        raise ValueError("Different unit vocabularies")
    cost_index = datasets[0]["unitFeatureNames"].index("cost")
    base = torch.tensor([datasets[0]["unitFeatures"][id][cost_index] * 5 * 12
        for id in ids], dtype=torch.float32)
    if not (base > 0).all():
        raise ValueError("Every unit must have a positive base value")
    ix = {id: i for i, id in enumerate(ids)}
    rows = []
    star_power = {1: 1, 2: 2.6, 3: 7}
    for dataset in datasets:
        for key, score in dataset["entries"]:
            parts = key.split("/")
            if parts[1] != "hz:60":
                raise ValueError("Mixed combat timestep in cache entries")
            board, enemy, modifier = parts[-2], parts[-3], float(parts[-4])
            features = [0.] * len(ids)
            for token in board.split(","):
                _, id, star = token.split(":")
                features[ix[id]] += star_power[int(star)] / 100
            for token in enemy.split(","):
                id, star = token.split(":")
                features[ix[id]] -= star_power[int(star)] * modifier ** 2 / 100
            rows.append((features, float(score >= 5000), "/".join(parts[:-2])))
    contexts = sorted({r[2] for r in rows})
    random.Random(args.seed).shuffle(contexts)
    holdout = set(contexts[:len(contexts) // 5])
    train = [r for r in rows if r[2] not in holdout]
    test = [r for r in rows if r[2] in holdout]
    if not train or not test:
        raise ValueError("Need enough independent contexts for training and holdout")
    torch.set_num_threads(1)
    torch.manual_seed(args.seed)
    x, y = torch.tensor([r[0] for r in train]), torch.tensor([r[1] for r in train])
    xt, yt = torch.tensor([r[0] for r in test]), torch.tensor([r[1] for r in test])
    delta = torch.nn.Parameter(torch.zeros(len(ids)))
    bias, scale = torch.nn.Parameter(torch.tensor(0.)), torch.nn.Parameter(torch.tensor(0.))
    optimizer = torch.optim.Adam([delta, bias, scale], lr=.02)
    for _ in range(2200):
        values = base * (1 + .5 * delta.tanh())
        logits = (x @ values) * scale.exp() + bias
        loss = F.binary_cross_entropy_with_logits(logits, y) + .03 * delta.square().mean()
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
    values = (base * (1 + .5 * delta.tanh())).detach()
    with torch.no_grad():
        accuracy = ((xt @ values * scale.exp() + bias > 0) == yt.bool()).float().mean().item()
    result = {"schema": "autochess-novice-unit-values-v1",
        "purpose": "Offline linear combat values; no runtime neural inference.",
        "sourceFingerprint": next(iter(fingerprints)),
        "sourceData": [{"path": p, "sha256": hashlib.sha256(Path(p).read_bytes()).hexdigest()}
            for p in args.cache],
        "learnerSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "training": {"seed": args.seed, "trainSamples": len(train), "heldoutSamples": len(test),
            "heldoutAccuracy": accuracy, "maximumRelativeChange": .5},
        "values": {id: round(float(v), 3) for id, v in zip(ids, values)}}
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output), **result["training"]}))


if __name__ == "__main__":
    main()
