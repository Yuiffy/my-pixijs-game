"""Merge disjoint Chrome evaluation ranges without changing their protocol."""
import argparse
import hashlib
import json
from pathlib import Path


def merge(reports, seed, runs):
    if runs < 1:
        raise ValueError("Runs must be positive")
    if not reports:
        raise ValueError("No reports")
    first = reports[0]
    seen = {}
    for report in reports:
        if (report["fingerprint"] != first["fingerprint"]
                or report.get("runtime") != first.get("runtime")
                or report["config"]["level"] != first["config"]["level"]
                or report["config"]["battles"] != first["config"]["battles"]):
            raise ValueError("Different source, runtime, difficulty or horizon")
        if report.get("errors"):
            raise ValueError("Evaluation errors")
        for result in report["results"]:
            if result["seed"] in seen:
                raise ValueError("Duplicate seed")
            if (result["level"] != first["config"]["level"]
                    or not result.get("trace")
                    or result["trace"][-1]["round"] != result["round"]):
                raise ValueError("Invalid game trace")
            seen[result["seed"]] = result
    if set(seen) != set(range(seed, seed + runs)):
        raise ValueError("Missing or unexpected seeds")
    results = [seen[s] for s in sorted(seen)]
    return {**first, "config": {**first["config"], "seed": seed, "runs": runs},
        "meanWins": sum(r["wins"] for r in results) / runs,
        "clears": sum(r["cleared"] for r in results), "results": results}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("reports", nargs="+")
    parser.add_argument("--seed", type=int, required=True)
    parser.add_argument("--runs", type=int, default=32)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    paths = [Path(p) for p in args.reports]
    result = merge([json.loads(p.read_text(encoding="utf-8")) for p in paths], args.seed, args.runs)
    result["mergedFrom"] = [{"path": str(p), "sha256": hashlib.sha256(p.read_bytes()).hexdigest()}
        for p in paths]
    Path(args.output).write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": args.output, "runs": len(result["results"]),
        "meanWins": result["meanWins"], "clears": result["clears"]}))


if __name__ == "__main__":
    main()
