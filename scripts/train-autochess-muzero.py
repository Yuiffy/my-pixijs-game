"""Offline, round-action MuZero. Learns dynamics/reward/policy/value from real games.

No combat labels, pretrained weights or engine access inside tree search. The
existing autopilot is a fixed low-level controller, so this is NOT full-game
MuZero learning atomic chess actions. Observations expose no future/random seed.
Reference: https://arxiv.org/abs/1911.08265 (single-player discounted backup).
"""
import argparse
from dataclasses import dataclass, field
import json
import hashlib
import math
from pathlib import Path
import random
import subprocess
import time

import torch
from torch import nn
from torch.nn import functional as F


class Network(nn.Module):
    def __init__(self, inputs, actions, hidden=64):
        super().__init__()
        self.actions = actions
        self.representation = nn.Sequential(nn.Linear(inputs, hidden), nn.Tanh(), nn.Linear(hidden, hidden), nn.Tanh())
        self.dynamics = nn.Sequential(nn.Linear(hidden + actions, hidden), nn.Tanh(), nn.Linear(hidden, hidden), nn.Tanh())
        self.reward = nn.Linear(hidden, 1)
        self.policy = nn.Linear(hidden, actions)
        self.value = nn.Linear(hidden, 1)

    def initial(self, observation):
        latent = self.representation(observation)
        return latent, self.policy(latent), self.value(latent).squeeze(-1)

    def recurrent(self, latent, action):
        encoded = F.one_hot(action, self.actions).to(latent.dtype)
        latent = self.dynamics(torch.cat([latent, encoded], dim=-1))
        return latent, self.reward(latent).squeeze(-1), self.policy(latent), self.value(latent).squeeze(-1)


@dataclass
class Node:
    prior: float = 1.0
    visits: int = 0
    total: float = 0.0
    reward: float = 0.0
    latent: object = None
    children: dict = field(default_factory=dict)

    @property
    def mean(self):
        return self.total / self.visits if self.visits else 0.0

    def expand(self, latent, logits):
        self.latent = latent
        priors = logits.softmax(-1).squeeze(0).tolist()
        self.children = {a: Node(p) for a, p in enumerate(priors)}


@torch.no_grad()
def search(network, observation, simulations, discount, rng, noise=True):
    latent, logits, value = network.initial(torch.tensor([observation], dtype=torch.float32))
    root = Node()
    root.expand(latent, logits)
    if noise:
        samples = [rng.gammavariate(0.3, 1) for _ in root.children]
        for child, sample in zip(root.children.values(), samples):
            child.prior = 0.75 * child.prior + 0.25 * sample / sum(samples)
    low, high = float("inf"), float("-inf")
    for _ in range(simulations):
        node = root
        path = [root]
        depth = 0
        while node.children and depth < 6:
            def ucb(pair):
                child = pair[1]
                q = child.reward + discount * child.mean if child.visits else 0
                normalized = (q - low) / (high - low) if high > low else 0
                return normalized + 1.5 * child.prior * math.sqrt(node.visits + 1) / (child.visits + 1)
            action, child = max(node.children.items(), key=ucb)
            path.append(child)
            depth += 1
            if child.latent is None:
                latent, reward, logits, value = network.recurrent(node.latent, torch.tensor([action]))
                child.reward = reward.item()
                child.expand(latent, logits)
                break
            node = child
            value = network.value(node.latent).squeeze(-1)
        backed = value.item()
        for visited in reversed(path):
            visited.total += backed
            visited.visits += 1
            q = visited.reward + discount * visited.mean
            low, high = min(low, q), max(high, q)
            backed = visited.reward + discount * backed
    counts = [node.visits for node in root.children.values()]
    return [n / sum(counts) for n in counts], root.mean


class Environment:
    def __init__(self):
        self.process = subprocess.Popen(["node", "scripts/autochess-muzero-environment.mjs"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding="utf-8", bufsize=1)

    def call(self, **request):
        self.process.stdin.write(json.dumps(request) + "\n")
        self.process.stdin.flush()
        line = self.process.stdout.readline()
        if not line:
            raise RuntimeError(f"Game environment exited: {self.process.poll()}")
        response = json.loads(line)
        if "error" in response:
            raise RuntimeError(response["error"])
        return response

    def close(self):
        if self.process.poll() is None:
            self.process.stdin.write('{"command":"close"}\n')
            self.process.stdin.flush()
            self.process.stdin.close()
            self.process.wait(timeout=10)
        self.process.stdout.close()


def train_batch(network, optimizer, replay, rng, batch_size, discount, unroll=3):
    positions = [(rng.choice(replay), None) for _ in range(batch_size)]
    # Include the terminal observation: MuZero must learn V(terminal)=0, rather
    # than inventing further wins after a death or the campaign-boss failure.
    positions = [(episode, rng.randrange(len(episode["actions"]) + 1)) for episode, _ in positions]
    observations = torch.tensor([e["observations"][t] for e, t in positions], dtype=torch.float32)
    latent, policy, value = network.initial(observations)
    loss = torch.zeros(())
    for k in range(unroll + 1):
        indices = [min(t + k, len(e["actions"])) for e, t in positions]
        mask = torch.tensor([float(t + k < len(e["actions"])) for e, t in positions])
        # Past the end, train an absorbing state: zero value/reward for every
        # action. Merely masking these steps permits imaginary post-death wins.
        value_mask = torch.ones(len(positions))
        values = torch.tensor([e["returns"][i] if i < len(e["actions"]) else 0.
            for (e, _), i in zip(positions, indices)])
        policies = torch.tensor([e["policies"][i] if i < len(e["actions"])
            else [1 / network.actions] * network.actions for (e, _), i in zip(positions, indices)])
        loss = loss + (F.mse_loss(value, values, reduction="none") * value_mask
            - (policies * policy.log_softmax(-1)).sum(-1) * mask).mean()
        if k == unroll:
            break
        actions = torch.tensor([e["actions"][i] if i < len(e["actions"])
            else rng.randrange(network.actions) for (e, _), i in zip(positions, indices)])
        latent, reward, policy, value = network.recurrent(latent, actions)
        rewards = torch.tensor([e["rewards"][i] if i < len(e["actions"]) else 0.
            for (e, _), i in zip(positions, indices)])
        loss = loss + F.mse_loss(reward, rewards)
        next_observations = torch.tensor([e["observations"][min(i + 1, len(e["actions"]))]
            for (e, _), i in zip(positions, indices)], dtype=torch.float32)
        with torch.no_grad():
            true_latent = network.representation(next_observations)
        loss = loss + 0.1 * ((latent - true_latent) ** 2).mean()
    optimizer.zero_grad()
    loss.backward()
    nn.utils.clip_grad_norm_(network.parameters(), 5)
    optimizer.step()
    return loss.item()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--episodes", type=int, default=128)
    parser.add_argument("--seed", type=int, default=85000)
    parser.add_argument("--levels", default="novice,veteran")
    parser.add_argument("--simulations", type=int, default=24)
    parser.add_argument("--updates", type=int, default=24)
    parser.add_argument("--battles", type=int, default=32)
    parser.add_argument("--exploration", type=float, default=0.15)
    parser.add_argument("--output", default="artifacts/autochess-muzero")
    parser.add_argument("--resume")
    args = parser.parse_args()
    torch.set_num_threads(1)
    torch.manual_seed(args.seed)
    rng = random.Random(args.seed)
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    env = Environment()
    initial = env.call(command="reset", seed=args.seed, level=args.levels.split(",")[0], battles=args.battles)
    network = Network(len(initial["observation"]), len(initial["actions"]))
    optimizer = torch.optim.Adam(network.parameters(), lr=0.001, weight_decay=1e-5)
    replay, reports, lineage = [], [], []
    if args.resume:
        saved = torch.load(args.resume, weights_only=False)
        if saved["fingerprint"] != initial["fingerprint"]:
            raise ValueError("Game rules changed since checkpoint")
        network.load_state_dict(saved["network"])
        optimizer.load_state_dict(saved["optimizer"])
        replay = saved["replay"]
        lineage = [*saved.get("lineage", []), saved["config"]]
    started = time.monotonic()
    try:
        for episode_index in range(args.episodes):
            level = args.levels.split(",")[episode_index % len(args.levels.split(","))]
            state = env.call(command="reset", seed=args.seed + episode_index, level=level, battles=args.battles)
            if state["fingerprint"] != initial["fingerprint"]:
                raise ValueError("Environment rules changed")
            episode = {"seed": args.seed + episode_index, "level": level,
                "observations": [state["observation"]], "actions": [], "rewards": [], "policies": []}
            values = []
            while not state["done"]:
                visits, value = search(network, state["observation"], args.simulations, 0.97, rng)
                # Cold-start exploration genuinely has no pretrained guidance.
                if len(replay) < 12:
                    action = rng.randrange(network.actions)
                    visits = [1 / network.actions] * network.actions
                elif rng.random() < args.exploration:
                    action = rng.randrange(network.actions)
                else:
                    temperature = 1 if len(replay) < 48 else 0.5
                    action = rng.choices(range(network.actions), [p ** (1 / temperature) for p in visits])[0]
                state = env.call(command="step", action=action)
                episode["observations"].append(state["observation"])
                episode["actions"].append(action)
                episode["policies"].append(visits)
                episode["rewards"].append(state["reward"])
                values.append(value)
            returns, value = [], 0
            for reward in reversed(episode["rewards"]):
                value = reward + 0.97 * value
                returns.append(value)
            episode["returns"] = list(reversed(returns))
            replay.append(episode)
            replay = replay[-512:]
            losses = [train_batch(network, optimizer, replay, rng, 64, 0.97) for _ in range(args.updates)]
            report = {"episode": episode_index + 1, **state["info"],
                "reward": sum(episode["rewards"]), "loss": sum(losses) / max(1, len(losses)),
                "actionCounts": [episode["actions"].count(a) for a in range(network.actions)],
                "elapsed": round(time.monotonic() - started, 2)}
            reports.append(report)
            print(json.dumps(report), flush=True)
            if (episode_index + 1) % 8 == 0 or episode_index + 1 == args.episodes:
                temporary = output / "checkpoint.next.pt"
                torch.save({"network": network.state_dict(), "optimizer": optimizer.state_dict(),
                    "replay": replay, "inputs": len(initial["observation"]), "actions": initial["actions"],
                    "fingerprint": initial["fingerprint"], "config": vars(args), "lineage": lineage,
                    "learnerSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}, temporary)
                temporary.replace(output / "checkpoint.pt")
                report_file = output / "report.next.json"
                report_file.write_text(json.dumps({"config": vars(args),
                    "fingerprint": initial["fingerprint"], "episodes": reports}, indent=2), encoding="utf-8")
                report_file.replace(output / "report.json")
    finally:
        env.close()


if __name__ == "__main__":
    main()
