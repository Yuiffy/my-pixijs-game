"""Evaluate fixed macros or MuZero search on independent full games; writes traces."""
import argparse
import importlib.util
import json
from pathlib import Path
import random
import sys
import time

import torch

spec = importlib.util.spec_from_file_location("autochess_muzero", Path(__file__).with_name("train-autochess-muzero.py"))
m = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = m
spec.loader.exec_module(m)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint")
    parser.add_argument("--tree")
    parser.add_argument("--fixed-action", type=int, default=0)
    parser.add_argument("--strategy", choices=["fixed", "focus-healthy", "focus-opening", "spend-boss"], default="fixed")
    parser.add_argument("--seed", type=int, default=86000)
    parser.add_argument("--runs", type=int, default=16)
    parser.add_argument("--level", default="veteran")
    parser.add_argument("--battles", type=int, default=32)
    parser.add_argument("--simulations", type=int, default=48)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    if args.tree and args.checkpoint:
        parser.error("Choose a tree or a MuZero checkpoint")
    tree_model = json.loads(Path(args.tree).read_text()) if args.tree else None
    torch.set_num_threads(1)
    env = m.Environment()
    results = []
    network = None
    started = time.monotonic()
    try:
        for run in range(args.runs):
            state = env.call(command="reset", seed=args.seed + run, level=args.level, battles=args.battles)
            fingerprint = state["fingerprint"]
            if tree_model and tree_model["fingerprint"] != fingerprint:
                raise ValueError("Tree was distilled from a different environment")
            if args.checkpoint and network is None:
                saved = torch.load(args.checkpoint, weights_only=False)
                if saved["fingerprint"] != state["fingerprint"]:
                    raise ValueError("Cannot evaluate a model on a different environment")
                network = m.Network(saved["inputs"], len(saved["actions"]))
                network.load_state_dict(saved["network"])
                network.eval()
            trace = []
            while not state["done"]:
                if tree_model:
                    node = tree_model["tree"]
                    while "feature" in node:
                        node = node["left"] if state["observation"][node["feature"]] <= node["threshold"] else node["right"]
                    action, policy, value = node["action"], None, None
                elif network:
                    policy, value = m.search(network, state["observation"], args.simulations, 0.97,
                        random.Random(args.seed + run), noise=False)
                    action = max(range(len(policy)), key=lambda a: policy[a])
                else:
                    action, policy, value = args.fixed_action, None, None
                    if args.strategy == "focus-healthy":
                        action = 3 if state["observation"][1] * 20 >= 16 else 0
                    elif args.strategy == "focus-opening":
                        action = 3 if state["observation"][0] * 32 <= 8 else 0
                    elif args.strategy == "spend-boss":
                        action = 4 if state["observation"][0] * 32 == 16 else 0
                obs = state["observation"]
                state = env.call(command="step", action=action)
                trace.append({"observation": obs, "action": action, "policy": policy,
                    "value": value, "reward": state["reward"], **state["info"]})
            result = {**state["info"], "trace": trace}
            results.append(result)
            print(json.dumps({**state["info"], "elapsed": round(time.monotonic() - started, 2)}), flush=True)
            output = Path(args.output)
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(json.dumps({"config": vars(args), "fingerprint": fingerprint,
                "meanWins": sum(r["wins"] for r in results) / len(results),
                "meanRounds": sum(r["round"] for r in results) / len(results),
                "clears": sum(r["cleared"] for r in results),
                "horizonReached": sum(r["round"] >= args.battles for r in results),
                "results": results}, indent=2), encoding="utf-8")
    finally:
        env.close()


if __name__ == "__main__":
    main()
