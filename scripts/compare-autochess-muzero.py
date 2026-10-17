"""Paired complete-game comparisons; partial/mismatched reports never pass."""
import argparse
import json
from pathlib import Path
import random
import statistics


def compare(baseline, candidate, expected_runs):
    if baseline.get("runtime") != candidate.get("runtime"):
        raise ValueError("Different simulation runtimes")
    for report in [baseline, candidate]:
        if report.get("errors"):
            raise ValueError("Evaluation errors")
        if len(report["results"]) != expected_runs:
            raise ValueError("Incomplete game report")
        if len({r["seed"] for r in report["results"]}) != expected_runs:
            raise ValueError("Duplicate seeds")
    if baseline["config"]["battles"] != candidate["config"]["battles"]:
        raise ValueError("Different battle horizons")
    left = {r["seed"]: r for r in baseline["results"]}
    right = {r["seed"]: r for r in candidate["results"]}
    if left.keys() != right.keys() or baseline["config"]["level"] != candidate["config"]["level"]:
        raise ValueError("Not paired by seed and difficulty")
    deltas = [right[s]["wins"] - left[s]["wins"] for s in sorted(left)]
    rng = random.Random(77017)
    samples = sorted(statistics.mean(rng.choices(deltas, k=len(deltas))) for _ in range(10000))
    # Descriptive uncertainty, NOT a substitute for fresh acceptance seeds.
    return {"level": baseline["config"]["level"], "runs": expected_runs,
        "meanWinDelta": statistics.mean(deltas),
        "pairedBootstrap95": [samples[250], samples[9749]],
        "bootstrapPositiveFraction": sum(s > 0 for s in samples) / len(samples),
        "moreWins": sum(d > 0 for d in deltas), "fewerWins": sum(d < 0 for d in deltas),
        "clearDelta": sum(right[s]["cleared"] - left[s]["cleared"] for s in left),
        "earlyEndDelta": sum((right[s]["round"] <= 8) - (left[s]["round"] <= 8) for s in left),
        "deltas": deltas, "baselineFingerprint": baseline["fingerprint"],
        "candidateFingerprint": candidate["fingerprint"]}


def acceptance(baselines, candidates):
    if len(baselines) != 2 or len(candidates) != 2:
        raise ValueError("Acceptance requires two independent groups")
    groups = [compare(a, b, 32) for a, b in zip(baselines, candidates)]
    reports = [*baselines, *candidates]
    if any(r["config"]["battles"] != 32 for r in reports):
        raise ValueError("Acceptance requires the full 32-battle horizon")
    if len({r["config"]["level"] for r in reports}) != 1:
        raise ValueError("Acceptance groups must use one difficulty")
    for pair in [baselines, candidates]:
        if pair[0].get("runtime") != pair[1].get("runtime"):
            raise ValueError("Simulation runtime changed between acceptance groups")
        if pair[0]["fingerprint"] != pair[1]["fingerprint"]:
            raise ValueError("Strategy changed between acceptance groups")
        if {r["seed"] for r in pair[0]["results"]} & {r["seed"] for r in pair[1]["results"]}:
            raise ValueError("Acceptance seed groups overlap")
    merged = [{**pair[0], "results": pair[0]["results"] + pair[1]["results"]}
        for pair in [baselines, candidates]]
    combined = compare(*merged, 64)
    checks = {
        "bothGroupsImprove": all(g["meanWinDelta"] > 0 for g in groups),
        "meanAtLeastQuarterWin": combined["meanWinDelta"] >= 0.25,
        "noFewerClears": combined["clearDelta"] >= 0,
        "earlyEndsWithinOne": combined["earlyEndDelta"] <= 1,
        "bootstrapPositiveAtLeast80Percent": combined["bootstrapPositiveFraction"] >= 0.8,
    }
    return {"groups": groups, "combined": combined, "checks": checks,
        "passed": all(checks.values())}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("baseline")
    parser.add_argument("candidate")
    parser.add_argument("--runs", type=int, required=True)
    parser.add_argument("--second-baseline")
    parser.add_argument("--second-candidate")
    parser.add_argument("--output")
    args = parser.parse_args()
    read = lambda path: json.loads(Path(path).read_text(encoding="utf-8"))
    if bool(args.second_baseline) != bool(args.second_candidate):
        parser.error("Both second-group reports are required")
    if args.second_baseline:
        if args.runs != 32:
            parser.error("Acceptance uses 32 runs per group")
        result = acceptance([read(args.baseline), read(args.second_baseline)],
            [read(args.candidate), read(args.second_candidate)])
    else:
        result = compare(read(args.baseline), read(args.candidate), args.runs)
    encoded = json.dumps(result, indent=2)
    if args.output:
        Path(args.output).write_text(encoded, encoding="utf-8")
    print(encoded)


if __name__ == "__main__":
    main()
