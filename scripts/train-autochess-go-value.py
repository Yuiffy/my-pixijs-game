#!/usr/bin/env python3
"""Train and export the learned combat ranker used by the Go autopilot.

The input is the persistent rollout cache produced by
benchmark-autochess-autopilot.mjs.  Cache files selected by --holdout-regex are
never used for gradient updates or early stopping.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import random
import re
import time
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

import torch
from torch import Tensor, nn
import torch.nn.functional as F


MODEL_SCHEMA = "go-combat-ranker-v2"
UNKNOWN_TOKEN = "<unk>"


@dataclass(frozen=True)
class CombatExample:
    cache_key: str
    source: str
    context_key: str
    enemy_seed: int
    round: int
    starter: str
    augments: tuple[str, ...]
    wave_tag: str
    modifier: float
    enemies: tuple[tuple[str, int, int], ...]
    players: tuple[tuple[str, int, int], ...]
    score: float


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--cache",
        action="append",
        default=[],
        help="Cache JSON file or directory. Repeat to add sources.",
    )
    parser.add_argument(
        "--holdout-regex",
        default=r"enemy-152102(?:-|\.)",
        help="Regex matched against cache paths reserved as the external holdout.",
    )
    parser.add_argument(
        "--output",
        default="src/components/autoChessGame/ai/goCombatModel.json",
        help="Exported browser inference model.",
    )
    parser.add_argument(
        "--report",
        default="artifacts/autochess-go-value-training-v1.json",
        help="Training and evaluation report.",
    )
    parser.add_argument("--epochs", type=int, default=500)
    parser.add_argument("--patience", type=int, default=80)
    parser.add_argument("--learning-rate", type=float, default=2e-3)
    parser.add_argument("--weight-decay", type=float, default=2e-4)
    parser.add_argument("--max-pairs-per-context", type=int, default=96)
    parser.add_argument("--seed", type=int, default=20260808)
    parser.add_argument("--cpu", action="store_true", help="Disable CUDA even when available.")
    return parser.parse_args()


def cache_files(requested: Sequence[str]) -> list[Path]:
    roots = list(requested) or [
        "artifacts/autochess-rollout-cache/efc4a58be34c04e0/benchmarks",
    ]
    files: list[Path] = []
    for raw in roots:
        path = Path(raw)
        if path.is_file():
            files.append(path)
        elif path.is_dir():
            files.extend(path.rglob("*.json"))
        else:
            raise FileNotFoundError(f"Cache source does not exist: {path}")
    return sorted(set(file.resolve() for file in files))


def parse_units(raw: str, positioned: bool) -> tuple[tuple[str, int, int], ...]:
    units: list[tuple[str, int, int]] = []
    if not raw:
        return ()
    for ordinal, token in enumerate(raw.split(",")):
        parts = token.split(":")
        if positioned:
            if len(parts) != 3:
                raise ValueError(f"Invalid positioned unit token: {token}")
            position, unit_id, star = parts
            units.append((unit_id, int(star), int(position)))
        else:
            if len(parts) != 2:
                raise ValueError(f"Invalid enemy unit token: {token}")
            unit_id, star = parts
            units.append((unit_id, int(star), ordinal))
    return tuple(units)


def parse_entry(cache_key: str, score: float, source: str) -> CombatExample | None:
    parts = cache_key.split("/")
    if len(parts) < 9 or not parts[1].startswith("hz:"):
        return None
    schema = parts[0]
    if schema == "combat-v1" and len(parts) == 9:
        _, hz, starter, augments, wave_tag, modifier, enemies, players, branch = parts
        enemy_seed = 0
        round_number = 0
        context_parts = (schema, hz, starter, augments, wave_tag, modifier, enemies, branch)
    elif schema in {"combat-go-v2", "combat-go-v3"} and len(parts) == 11:
        (
            _,
            hz,
            enemy_token,
            round_token,
            starter,
            augments,
            wave_tag,
            modifier,
            enemies,
            players,
            branch,
        ) = parts
        if not enemy_token.startswith("enemy:") or not round_token.startswith("round:"):
            return None
        enemy_seed = int(enemy_token.removeprefix("enemy:"))
        round_number = int(round_token.removeprefix("round:"))
        context_parts = (
            schema,
            hz,
            enemy_token,
            round_token,
            starter,
            augments,
            wave_tag,
            modifier,
            enemies,
            branch,
        )
    else:
        return None
    if not math.isfinite(float(score)):
        return None
    context_key = "/".join(context_parts)
    return CombatExample(
        cache_key=cache_key,
        source=source,
        context_key=context_key,
        enemy_seed=enemy_seed,
        round=round_number,
        starter=starter or UNKNOWN_TOKEN,
        augments=tuple(filter(None, augments.split(","))),
        wave_tag=wave_tag or UNKNOWN_TOKEN,
        modifier=float(modifier),
        enemies=parse_units(enemies, positioned=False),
        players=parse_units(players, positioned=True),
        score=float(score),
    )


def load_examples(files: Sequence[Path]) -> tuple[list[CombatExample], dict[str, int], dict]:
    deduplicated: dict[str, CombatExample] = {}
    unit_feature_names: list[str] = []
    unit_features: dict[str, list[float]] = {}
    rejected = 0
    raw_entries = 0
    for path in files:
        payload = json.loads(path.read_text(encoding="utf-8"))
        payload_feature_names = payload.get("unitFeatureNames", [])
        payload_unit_features = payload.get("unitFeatures", {})
        if payload_feature_names and payload_unit_features:
            if unit_feature_names and payload_feature_names != unit_feature_names:
                raise ValueError(f"Incompatible unit feature schema in {path}")
            unit_feature_names = list(payload_feature_names)
            unit_features.update({
                str(unit_id): [float(value) for value in values]
                for unit_id, values in payload_unit_features.items()
            })
        for entry in payload.get("entries", []):
            raw_entries += 1
            if not isinstance(entry, list) or len(entry) != 2:
                rejected += 1
                continue
            example = parse_entry(str(entry[0]), float(entry[1]), str(path))
            if example is None:
                rejected += 1
                continue
            deduplicated[example.cache_key] = example
    examples = sorted(deduplicated.values(), key=lambda example: example.cache_key)
    return examples, {
        "files": len(files),
        "rawEntries": raw_entries,
        "deduplicatedEntries": len(examples),
        "rejectedEntries": rejected,
    }, {
        "names": unit_feature_names,
        "values": unit_features,
    }


def stable_bucket(value: str, buckets: int = 10) -> int:
    digest = hashlib.sha256(value.encode("utf-8")).digest()
    return int.from_bytes(digest[:4], "big") % buckets


def vocab(values: Iterable[str]) -> list[str]:
    return [UNKNOWN_TOKEN, *sorted(set(value for value in values if value != UNKNOWN_TOKEN))]


class EncodedSplit:
    def __init__(
        self,
        examples: Sequence[CombatExample],
        vocabularies: dict[str, list[str]],
        modifier_mean: float,
        modifier_std: float,
        device: torch.device,
    ) -> None:
        self.examples = list(examples)
        unit_index = {value: index for index, value in enumerate(vocabularies["units"])}
        starter_index = {value: index for index, value in enumerate(vocabularies["starters"])}
        tag_index = {value: index for index, value in enumerate(vocabularies["waveTags"])}
        augment_index = {value: index for index, value in enumerate(vocabularies["augments"])}
        max_player = max((len(example.players) for example in examples), default=1)
        max_enemy = max((len(example.enemies) for example in examples), default=1)

        def token_tensor(team: str, field: int, maximum: int) -> Tensor:
            rows: list[list[int]] = []
            for example in examples:
                tokens = example.players if team == "player" else example.enemies
                values = []
                for token in tokens:
                    if field == 0:
                        values.append(unit_index.get(token[0], 0))
                    else:
                        values.append(token[field])
                rows.append(values + [0] * (maximum - len(values)))
            return torch.tensor(rows, dtype=torch.long, device=device)

        self.tensors = {
            "player_unit": token_tensor("player", 0, max_player),
            "player_star": token_tensor("player", 1, max_player),
            "player_position": token_tensor("player", 2, max_player),
            "player_mask": torch.tensor(
                [[1.0] * len(example.players) + [0.0] * (max_player - len(example.players)) for example in examples],
                dtype=torch.float32,
                device=device,
            ),
            "enemy_unit": token_tensor("enemy", 0, max_enemy),
            "enemy_star": token_tensor("enemy", 1, max_enemy),
            "enemy_position": token_tensor("enemy", 2, max_enemy),
            "enemy_mask": torch.tensor(
                [[1.0] * len(example.enemies) + [0.0] * (max_enemy - len(example.enemies)) for example in examples],
                dtype=torch.float32,
                device=device,
            ),
            "starter": torch.tensor(
                [starter_index.get(example.starter, 0) for example in examples],
                dtype=torch.long,
                device=device,
            ),
            "wave_tag": torch.tensor(
                [tag_index.get(example.wave_tag, 0) for example in examples],
                dtype=torch.long,
                device=device,
            ),
            "modifier": torch.tensor(
                [[(example.modifier - modifier_mean) / modifier_std] for example in examples],
                dtype=torch.float32,
                device=device,
            ),
            "augments": torch.tensor(
                [
                    [1.0 if augment in example.augments else 0.0 for augment in vocabularies["augments"]]
                    for example in examples
                ],
                dtype=torch.float32,
                device=device,
            ),
            "target": torch.tensor(
                [(example.score - 5000.0) / 1000.0 for example in examples],
                dtype=torch.float32,
                device=device,
            ),
        }


class GoCombatRanker(nn.Module):
    def __init__(
        self,
        vocabularies: dict[str, list[str]],
        max_enemy_position: int,
        unit_features: Tensor,
    ) -> None:
        super().__init__()
        embedding_dim = 24
        token_dim = 32
        context_dim = 12
        self.unit_embedding = nn.Embedding(len(vocabularies["units"]), embedding_dim)
        self.register_buffer("unit_features", unit_features)
        self.unit_feature_projection = nn.Linear(unit_features.shape[1], embedding_dim, bias=False)
        self.star_embedding = nn.Embedding(4, embedding_dim)
        self.player_position_embedding = nn.Embedding(24, embedding_dim)
        self.enemy_position_embedding = nn.Embedding(max_enemy_position, embedding_dim)
        self.starter_embedding = nn.Embedding(len(vocabularies["starters"]), 8)
        self.tag_embedding = nn.Embedding(len(vocabularies["waveTags"]), 8)
        self.player_token = nn.Sequential(nn.Linear(embedding_dim, token_dim), nn.ReLU())
        self.enemy_token = nn.Sequential(nn.Linear(embedding_dim, token_dim), nn.ReLU())
        self.augment_projection = nn.Sequential(
            nn.Linear(len(vocabularies["augments"]), context_dim),
            nn.ReLU(),
        )
        feature_dim = token_dim * 6 + 8 + 8 + context_dim + 3
        self.head = nn.Sequential(
            nn.Linear(feature_dim, 64),
            nn.ReLU(),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, 1),
        )

    @staticmethod
    def pool(tokens: Tensor, mask: Tensor) -> tuple[Tensor, Tensor, Tensor]:
        expanded = mask.unsqueeze(-1)
        count = expanded.sum(dim=1).clamp_min(1.0)
        total = (tokens * expanded).sum(dim=1)
        maximum = tokens.masked_fill(expanded == 0, -1e9).max(dim=1).values
        maximum = torch.where(torch.isfinite(maximum), maximum, torch.zeros_like(maximum))
        return total, maximum, count.squeeze(-1)

    def forward(self, batch: dict[str, Tensor]) -> Tensor:
        player_tokens = self.player_token(
            self.unit_embedding(batch["player_unit"])
            + self.unit_feature_projection(self.unit_features[batch["player_unit"]])
            + self.star_embedding(batch["player_star"])
            + self.player_position_embedding(batch["player_position"])
        )
        enemy_tokens = self.enemy_token(
            self.unit_embedding(batch["enemy_unit"])
            + self.unit_feature_projection(self.unit_features[batch["enemy_unit"]])
            + self.star_embedding(batch["enemy_star"])
            + self.enemy_position_embedding(batch["enemy_position"])
        )
        player_total, player_max, player_count = self.pool(player_tokens, batch["player_mask"])
        enemy_total, enemy_max, enemy_count = self.pool(enemy_tokens, batch["enemy_mask"])
        features = torch.cat(
            (
                player_total,
                player_max,
                enemy_total,
                enemy_max,
                torch.abs(player_total - enemy_total),
                player_total * enemy_total,
                self.starter_embedding(batch["starter"]),
                self.tag_embedding(batch["wave_tag"]),
                self.augment_projection(batch["augments"]),
                batch["modifier"],
                (player_count / 10.0).unsqueeze(1),
                (enemy_count / 20.0).unsqueeze(1),
            ),
            dim=1,
        )
        return self.head(features).squeeze(1)


def pair_indices(
    examples: Sequence[CombatExample],
    maximum_per_context: int,
    seed: int,
) -> tuple[list[int], list[int], list[float]]:
    grouped: dict[str, list[int]] = defaultdict(list)
    for index, example in enumerate(examples):
        grouped[example.context_key].append(index)
    rng = random.Random(seed)
    left: list[int] = []
    right: list[int] = []
    labels: list[float] = []
    for indices in grouped.values():
        candidates = [
            (a, b)
            for offset, a in enumerate(indices)
            for b in indices[offset + 1 :]
            if abs(examples[a].score - examples[b].score) >= 5.0
        ]
        rng.shuffle(candidates)
        for a, b in candidates[:maximum_per_context]:
            if rng.random() < 0.5:
                a, b = b, a
            left.append(a)
            right.append(b)
            labels.append(1.0 if examples[a].score > examples[b].score else 0.0)
    return left, right, labels


def pair_tensors(
    examples: Sequence[CombatExample],
    maximum_per_context: int,
    seed: int,
    device: torch.device,
) -> tuple[Tensor, Tensor, Tensor]:
    left, right, labels = pair_indices(examples, maximum_per_context, seed)
    return (
        torch.tensor(left, dtype=torch.long, device=device),
        torch.tensor(right, dtype=torch.long, device=device),
        torch.tensor(labels, dtype=torch.float32, device=device),
    )


def metrics(examples: Sequence[CombatExample], predictions: Tensor, maximum_pairs: int, seed: int) -> dict:
    values = predictions.detach().float().cpu().tolist()
    left, right, labels = pair_indices(examples, maximum_pairs, seed)
    pair_correct = sum(
        ((values[a] > values[b]) == (label > 0.5))
        for a, b, label in zip(left, right, labels)
    )
    groups: dict[str, list[int]] = defaultdict(list)
    for index, example in enumerate(examples):
        groups[example.context_key].append(index)
    regrets: list[float] = []
    top_one = 0
    top_k_retained = {3: 0, 6: 0, 12: 0, 24: 0}
    top_k_regrets = {3: [], 6: [], 12: [], 24: []}
    for indices in groups.values():
        predicted = max(indices, key=lambda index: values[index])
        actual = max(indices, key=lambda index: examples[index].score)
        regret = examples[actual].score - examples[predicted].score
        regrets.append(regret)
        top_one += int(regret < 5.0)
        ranked = sorted(indices, key=lambda index: values[index], reverse=True)
        for limit in top_k_retained:
            shortlisted = ranked[:limit]
            retained_regret = examples[actual].score - max(
                (examples[index].score for index in shortlisted),
                default=examples[actual].score,
            )
            top_k_regrets[limit].append(retained_regret)
            top_k_retained[limit] += int(retained_regret < 5.0)
    ordered_regrets = sorted(regrets)
    win_correct = sum(
        ((prediction >= 0.0) == (example.score >= 5000.0))
        for prediction, example in zip(values, examples)
    )
    return {
        "examples": len(examples),
        "contexts": len(groups),
        "pairs": len(left),
        "pairwiseAccuracy": pair_correct / max(1, len(left)),
        "top1Accuracy": top_one / max(1, len(groups)),
        "topK": {
            str(limit): {
                "bestRetainedRate": top_k_retained[limit] / max(1, len(groups)),
                "meanRegret": sum(top_k_regrets[limit]) / max(1, len(groups)),
            }
            for limit in top_k_retained
        },
        "meanTop1Regret": sum(regrets) / max(1, len(regrets)),
        "medianTop1Regret": ordered_regrets[len(ordered_regrets) // 2] if ordered_regrets else 0.0,
        "p90Top1Regret": ordered_regrets[min(len(ordered_regrets) - 1, int(len(ordered_regrets) * 0.9))]
        if ordered_regrets
        else 0.0,
        "winAccuracy": win_correct / max(1, len(examples)),
    }


def rounded(value):
    if isinstance(value, list):
        return [rounded(item) for item in value]
    return round(float(value), 7)


def export_model(
    path: Path,
    model: GoCombatRanker,
    vocabularies: dict[str, list[str]],
    modifier_mean: float,
    modifier_std: float,
    report_metrics: dict,
    unit_feature_names: list[str],
    verification: list[dict],
) -> None:
    state = {
        name: rounded(tensor.detach().float().cpu().tolist())
        for name, tensor in model.state_dict().items()
    }
    payload = {
        "schema": MODEL_SCHEMA,
        "trainedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "vocab": vocabularies,
        "unitFeatureNames": unit_feature_names,
        "normalization": {
            "modifierMean": modifier_mean,
            "modifierStd": modifier_std,
        },
        "metrics": report_metrics,
        "verification": verification,
        "state": state,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")


def main() -> None:
    args = parse_args()
    random.seed(args.seed)
    torch.manual_seed(args.seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(args.seed)
    device = torch.device("cpu" if args.cpu or not torch.cuda.is_available() else "cuda")
    files = cache_files(args.cache)
    examples, source_stats, static_features = load_examples(files)
    holdout_pattern = re.compile(args.holdout_regex)
    external_holdout = [example for example in examples if holdout_pattern.search(example.source)]
    train_pool = [example for example in examples if not holdout_pattern.search(example.source)]
    if not train_pool:
        raise RuntimeError("No training examples remain after applying --holdout-regex")
    train = [example for example in train_pool if stable_bucket(example.context_key) != 0]
    validation = [example for example in train_pool if stable_bucket(example.context_key) == 0]
    if not validation:
        raise RuntimeError("Validation split is empty")

    vocabularies = {
        "units": vocab(
            unit_id
            for example in examples
            for unit_id, _, _ in (*example.players, *example.enemies)
        ),
        "starters": vocab(example.starter for example in examples),
        "waveTags": vocab(example.wave_tag for example in examples),
        "augments": vocab(augment for example in examples for augment in example.augments),
    }
    if not static_features["names"] or not static_features["values"]:
        raise RuntimeError(
            "No unit features found. Include a dataset generated by "
            "generate-autochess-go-combat-dataset.mjs.",
        )
    unit_feature_rows = [
        static_features["values"].get(
            unit_id,
            [0.0] * len(static_features["names"]),
        )
        for unit_id in vocabularies["units"]
    ]
    unit_feature_tensor = torch.tensor(
        unit_feature_rows,
        dtype=torch.float32,
        device=device,
    )
    modifier_mean = sum(example.modifier for example in train) / len(train)
    modifier_variance = sum((example.modifier - modifier_mean) ** 2 for example in train) / len(train)
    modifier_std = max(1e-6, math.sqrt(modifier_variance))
    maximum_enemy_position = max(
        24,
        1 + max((position for example in examples for _, _, position in example.enemies), default=0),
    )

    encoded_train = EncodedSplit(train, vocabularies, modifier_mean, modifier_std, device)
    encoded_validation = EncodedSplit(validation, vocabularies, modifier_mean, modifier_std, device)
    encoded_holdout = EncodedSplit(external_holdout, vocabularies, modifier_mean, modifier_std, device)
    train_pairs = pair_tensors(
        train,
        args.max_pairs_per_context,
        args.seed + 1,
        device,
    )
    if train_pairs[0].numel() == 0:
        raise RuntimeError("No pairwise training examples were constructed")
    train_groups: dict[str, list[int]] = defaultdict(list)
    for index, example in enumerate(train):
        train_groups[example.context_key].append(index)
    listwise_groups = [
        torch.tensor(indices, dtype=torch.long, device=device)
        for indices in train_groups.values()
        if len(indices) > 1
    ]
    listwise_best = [
        max(indices.tolist(), key=lambda index: train[index].score)
        for indices in listwise_groups
    ]

    model = GoCombatRanker(
        vocabularies,
        maximum_enemy_position,
        unit_feature_tensor,
    ).to(device)
    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=args.learning_rate,
        weight_decay=args.weight_decay,
    )
    best_state = copy.deepcopy(model.state_dict())
    best_validation = -1.0
    best_epoch = 0
    stale_epochs = 0
    started = time.perf_counter()

    for epoch in range(1, args.epochs + 1):
        model.train()
        optimizer.zero_grad(set_to_none=True)
        predictions = model(encoded_train.tensors)
        left, right, labels = train_pairs
        pair_weights = torch.log1p(
            torch.abs(encoded_train.tensors["target"][left] - encoded_train.tensors["target"][right]),
        ).clamp(0.25, 5.0)
        pair_losses = F.binary_cross_entropy_with_logits(
            predictions[left] - predictions[right],
            labels,
            reduction="none",
        )
        pair_loss = (pair_losses * pair_weights).sum() / pair_weights.sum()
        listwise_loss = torch.stack([
            torch.logsumexp(predictions[indices] / 0.8, dim=0)
            - predictions[best] / 0.8
            for indices, best in zip(listwise_groups, listwise_best)
        ]).mean()
        value_loss = F.smooth_l1_loss(predictions, encoded_train.tensors["target"])
        win_loss = F.binary_cross_entropy_with_logits(
            predictions,
            (encoded_train.tensors["target"] >= 0).float(),
        )
        loss = pair_loss * 0.55 + listwise_loss * 0.35 + value_loss * 0.07 + win_loss * 0.03
        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), 5.0)
        optimizer.step()

        if epoch == 1 or epoch % 5 == 0:
            model.eval()
            with torch.no_grad():
                validation_predictions = model(encoded_validation.tensors)
            validation_metrics = metrics(
                validation,
                validation_predictions,
                args.max_pairs_per_context,
                args.seed + 2,
            )
            selection_score = (
                validation_metrics["pairwiseAccuracy"]
                + validation_metrics["top1Accuracy"] * 0.2
                - min(1.0, validation_metrics["medianTop1Regret"] / 10000.0) * 0.05
            )
            if selection_score > best_validation + 1e-6:
                best_validation = selection_score
                best_epoch = epoch
                best_state = copy.deepcopy(model.state_dict())
                stale_epochs = 0
            else:
                stale_epochs += 5
            if stale_epochs >= args.patience:
                break

    model.load_state_dict(best_state)
    model.eval()
    elapsed = time.perf_counter() - started
    with torch.no_grad():
        train_predictions = model(encoded_train.tensors)
        validation_predictions = model(encoded_validation.tensors)
        holdout_predictions = model(encoded_holdout.tensors) if external_holdout else torch.empty(0)
    final_metrics = {
        "train": metrics(train, train_predictions, args.max_pairs_per_context, args.seed + 3),
        "validation": metrics(
            validation,
            validation_predictions,
            args.max_pairs_per_context,
            args.seed + 4,
        ),
        "holdout": metrics(
            external_holdout,
            holdout_predictions,
            args.max_pairs_per_context,
            args.seed + 5,
        )
        if external_holdout
        else None,
    }
    verification_examples = external_holdout[:5] if external_holdout else validation[:5]
    verification_predictions = (
        holdout_predictions[:5] if external_holdout else validation_predictions[:5]
    ).detach().float().cpu().tolist()
    verification = [
        {
            "starter": example.starter if example.starter != UNKNOWN_TOKEN else None,
            "augments": list(example.augments),
            "waveTag": example.wave_tag,
            "modifier": example.modifier,
            "players": [
                {"id": unit_id, "star": star, "position": position}
                for unit_id, star, position in example.players
            ],
            "enemies": [
                {"id": unit_id, "star": star, "position": position}
                for unit_id, star, position in example.enemies
            ],
            "combatScore": example.score,
            "modelScore": prediction,
        }
        for example, prediction in zip(verification_examples, verification_predictions)
    ]
    report = {
        "schema": MODEL_SCHEMA,
        "device": str(device),
        "gpu": torch.cuda.get_device_name(0) if device.type == "cuda" else None,
        "seed": args.seed,
        "elapsedSeconds": elapsed,
        "epochsRequested": args.epochs,
        "bestEpoch": best_epoch,
        "source": source_stats,
        "split": {
            "train": len(train),
            "validation": len(validation),
            "holdout": len(external_holdout),
            "holdoutRegex": args.holdout_regex,
        },
        "vocabSizes": {key: len(values) for key, values in vocabularies.items()},
        "metrics": final_metrics,
        "output": str(Path(args.output).resolve()),
    }
    export_model(
        Path(args.output),
        model,
        vocabularies,
        modifier_mean,
        modifier_std,
        final_metrics,
        static_features["names"],
        verification,
    )
    report_path = Path(args.report)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
