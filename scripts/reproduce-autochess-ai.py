"""Reproduce accepted AI weights from the frozen 2026-10-23 research archive.

The archive and its adjacent digest index are read-only. Original learners run
only in a newly created scratch directory; production weights are never edited.
"""

import argparse
import hashlib
import importlib.metadata
import json
from pathlib import Path, PurePosixPath
import subprocess
import sys
import zipfile


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--archive",
        type=Path,
        default=Path("docs/experiments/autochess-ai-20261023-reproduction.zip"),
    )
    parser.add_argument("--work-dir", type=Path, required=True)
    args = parser.parse_args()
    archive_path = args.archive.resolve()
    index = read_json(archive_path.with_suffix(".json"))
    if hashlib.sha256(archive_path.read_bytes()).hexdigest() != index["sha256"]:
        raise ValueError("Reproduction archive does not match its digest index")
    work = args.work_dir.resolve()
    if work.exists():
        raise FileExistsError("Use a new scratch directory; existing work is preserved")

    root = "tmp/ai-20261023/"
    required = {
        "scripts/train-autochess-go-value.py",
        "scripts/train-autochess-unit-values.py",
        root + "train-missing-unit-embeddings.py",
        root + "freeze-observed-unit-adaptation.py",
        root + "chrome-labels-train.json",
        root + "chrome-labels-deep-train.json",
    }
    prefixes = (root + "reference/src/", root + "chrome-missing-unit-embeddings/src/")
    with zipfile.ZipFile(archive_path) as archive:
        manifest = json.loads(archive.read("REPRODUCTION-MANIFEST.json"))
        contents = {}
        for entry in manifest["files"]:
            name = entry["path"]
            relative = PurePosixPath(name)
            if relative.is_absolute() or ".." in relative.parts or "\\" in name:
                raise ValueError(f"Invalid archive path: {name}")
            raw = archive.read(name)
            if hashlib.sha256(raw).hexdigest() != entry["sha256"]:
                raise ValueError(f"Archive entry digest mismatch: {name}")
            contents[name] = raw
        if not required <= contents.keys():
            raise ValueError("Original training inputs are missing")
        expected_low_raw = contents["src/components/autoChessGame/ai/chromeUnitValues.json"]
        expected_adapted = json.loads(
            contents["src/components/autoChessGame/ai/goCombatModelMissingUnits.json"]
        )
        work.mkdir(parents=True, exist_ok=False)
        for name, raw in contents.items():
            if name not in required and not name.startswith(prefixes):
                continue
            target = work.joinpath(*PurePosixPath(name).parts)
            if not target.resolve().is_relative_to(work):
                raise ValueError(f"Archive path escapes scratch directory: {name}")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)

    commands = [
        ("low-values", ["scripts/train-autochess-unit-values.py", "--cache",
                        root + "chrome-labels-train.json", "--output",
                        root + "chromeUnitValues-reproduced.json", "--seed", "20261023"]),
        ("missing-embeddings", [root + "train-missing-unit-embeddings.py"]),
        ("observed-transform", [root + "freeze-observed-unit-adaptation.py"]),
    ]
    for label, command in commands:
        with (work / f"{label}.log").open("w", encoding="utf-8") as log:
            subprocess.run([sys.executable, *command], cwd=work, stdout=log,
                           stderr=subprocess.STDOUT, check=True)

    low_path = work / root / "chromeUnitValues-reproduced.json"
    low = read_json(low_path)
    expected_low = json.loads(expected_low_raw)
    for key in ("schema", "values", "training", "sourceFingerprint", "learnerSha256"):
        if low[key] != expected_low[key]:
            raise ValueError(f"Reproduced static model differs: {key}")
    adapted = read_json(work / root / "goCombatModel-observed-units.json")
    for key, expected in expected_adapted.items():
        if key != "adaptation" and adapted[key] != expected:
            raise ValueError(f"Reproduced combat model differs: {key}")
    for key, expected in expected_adapted["adaptation"].items():
        if key not in ("data", "exportTransform") and adapted["adaptation"][key] != expected:
            raise ValueError(f"Reproduced adaptation metrics differ: {key}")
    if [d["sha256"] for d in adapted["adaptation"]["data"]] != [
        d["sha256"] for d in expected_adapted["adaptation"]["data"]
    ]:
        raise ValueError("Training input digests changed")
    for key in ("scriptSha256", "method"):
        if adapted["adaptation"]["exportTransform"][key] != expected_adapted["adaptation"]["exportTransform"][key]:
            raise ValueError(f"Export transform differs: {key}")

    report = {
        "schema": "autochess-accepted-artifact-reproduction-v1",
        "passed": True,
        "archiveSha256": index["sha256"],
        "allArchivedDigestsVerified": True,
        "workDirectory": str(work),
        "python": sys.version,
        "torch": importlib.metadata.version("torch"),
        "runtimeWeightsFeaturesVocabNormalizationExactlyEqual": True,
        "trainingMetricsExactlyEqual": True,
        "staticArtifactBytesExactlyEqual": low_path.read_bytes() == expected_low_raw,
        "adaptedArtifactByteIdentityClaim": False,
        "scope": "Exact numerical and training-metric reproduction; absolute path metadata and derived parent hashes differ in a scratch checkout. This is not new game-strength evidence.",
    }
    (work / "reproduction-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
