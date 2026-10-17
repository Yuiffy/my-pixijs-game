"""Train additional recurrent updates on existing replay, without new games."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import random
import sys

import torch

spec = importlib.util.spec_from_file_location("muzero_refine", Path(__file__).with_name("train-autochess-muzero.py"))
m = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = m
spec.loader.exec_module(m)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("checkpoint")
    parser.add_argument("--updates", type=int, default=2000)
    parser.add_argument("--seed", type=int, default=77019)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    torch.set_num_threads(1)
    torch.manual_seed(args.seed)
    rng = random.Random(args.seed)
    saved = torch.load(args.checkpoint, weights_only=False)
    network = m.Network(saved["inputs"], len(saved["actions"]))
    network.load_state_dict(saved["network"])
    optimizer = torch.optim.Adam(network.parameters(), lr=0.0003, weight_decay=1e-5)
    losses = []
    for update in range(args.updates):
        loss = m.train_batch(network, optimizer, saved["replay"], rng, 64, 0.97)
        losses.append(loss)
        if (update + 1) % 200 == 0:
            print(json.dumps({"updates": update + 1, "loss": sum(losses[-200:]) / 200}), flush=True)
    saved["network"] = network.state_dict()
    saved["optimizer"] = optimizer.state_dict()
    saved["refinement"] = {**vars(args), "parentSha256": hashlib.sha256(Path(args.checkpoint).read_bytes()).hexdigest(),
        "learnerSha256": hashlib.sha256(Path(m.__file__).read_bytes()).hexdigest()}
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    torch.save(saved, output)


if __name__ == "__main__":
    main()
