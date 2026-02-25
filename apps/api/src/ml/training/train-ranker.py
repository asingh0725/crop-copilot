#!/usr/bin/env python3
"""
Train a LightGBM LambdaRank model on retrieval feedback data.

Input CSV (from export-training-data.ts):
  qid, label, f0_similarity, f1_rank_score, f2_authority

Labels:
  0 = not cited (irrelevant)
  1 = cited, neutral feedback (relevant)
  2 = cited, positive feedback (highly relevant)

Usage:
  # Export training data first:
  DATABASE_URL=postgres://... tsx export-training-data.ts > training.csv

  # Train (local):
  python train-ranker.py --input training.csv --output model.txt

  # Train and upload to S3:
  python train-ranker.py --input training.csv --output model.txt \
      --s3-bucket my-cropcopilot-bucket --s3-key models/ranker/model.txt

Requirements:
  pip install lightgbm numpy boto3
"""

import argparse
import csv
import sys
from collections import defaultdict
from pathlib import Path

try:
    import lightgbm as lgb
    import numpy as np
except ImportError:
    print(
        "ERROR: lightgbm and numpy are required.\n"
        "Install with: pip install lightgbm numpy",
        file=sys.stderr,
    )
    sys.exit(1)

# Feature columns — must match FEATURE_COLS order in reranker.ts and export-training-data.ts
FEATURE_COLS = [
    "f0_similarity",
    "f1_rank_score",
    "f2_authority",
    "f3_source_boost",
    "f4_crop_match",
    "f5_term_density",
    "f6_chunk_pos",
]

# LightGBM label gain: gain[label] maps ordinal label → NDCG gain
LABEL_GAIN = [0, 1, 3]  # labels 0, 1, 2


def load_csv(path: str):
    """
    Load training CSV into (X, y, groups) suitable for LightGBM ranking.

    Queries where all candidates share the same label are dropped because
    they carry no ranking signal.
    """
    by_query: dict[str, list[tuple[list[float], int]]] = defaultdict(list)

    with open(path, newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            qid = row["qid"]
            label = int(row["label"])
            features = [float(row[col]) for col in FEATURE_COLS]
            by_query[qid].append((features, label))

    X_rows: list[list[float]] = []
    y_rows: list[int] = []
    groups: list[int] = []
    skipped = 0

    for qid, items in by_query.items():
        labels = [item[1] for item in items]
        if len(set(labels)) < 2:
            # All-same-label query: no ranking signal, skip it
            skipped += 1
            continue

        for features, label in items:
            X_rows.append(features)
            y_rows.append(label)
        groups.append(len(items))

    if skipped:
        print(
            f"Skipped {skipped} queries with uniform labels (no ranking signal).",
            file=sys.stderr,
        )

    if not X_rows:
        print(
            "ERROR: No usable training data after filtering.\n"
            "Collect more feedback events before retraining.",
            file=sys.stderr,
        )
        sys.exit(1)

    X = np.array(X_rows, dtype=np.float32)
    y = np.array(y_rows, dtype=np.int32)
    return X, y, groups


def train(X: "np.ndarray", y: "np.ndarray", groups: list[int]) -> "lgb.Booster":
    """Train a LambdaRank model and return the booster."""
    train_data = lgb.Dataset(
        X,
        label=y,
        group=groups,
        feature_name=FEATURE_COLS,
        free_raw_data=False,
    )

    params = {
        "objective": "lambdarank",
        "metric": "ndcg",
        "ndcg_eval_at": [3, 5],
        "label_gain": LABEL_GAIN,
        "learning_rate": 0.05,
        "num_leaves": 31,
        "min_data_in_leaf": 5,
        "verbose": -1,
    }

    num_boost_round = 300

    print(
        f"Training LambdaRank: {len(y)} samples, "
        f"{len(groups)} queries, "
        f"{X.shape[1]} features, "
        f"{num_boost_round} rounds.",
        file=sys.stderr,
    )

    booster = lgb.train(
        params,
        train_data,
        num_boost_round=num_boost_round,
        valid_sets=[train_data],
        valid_names=["train"],
        callbacks=[lgb.log_evaluation(period=50)],
    )

    return booster


def upload_to_s3(local_path: str, bucket: str, key: str) -> None:
    """Upload model artifact to S3 for SageMaker deployment."""
    try:
        import boto3
    except ImportError:
        print(
            "WARNING: boto3 not installed; skipping S3 upload.\n"
            "Install with: pip install boto3",
            file=sys.stderr,
        )
        return

    s3 = boto3.client("s3")
    print(f"Uploading model to s3://{bucket}/{key} ...", file=sys.stderr)
    s3.upload_file(local_path, bucket, key)
    print(f"Model uploaded successfully.", file=sys.stderr)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Train a LightGBM LambdaRank model on CropCopilot retrieval data."
    )
    parser.add_argument("--input", required=True, help="Path to training CSV file")
    parser.add_argument("--output", required=True, help="Path to write model.txt")
    parser.add_argument("--s3-bucket", default="", help="S3 bucket for model upload")
    parser.add_argument("--s3-key", default="", help="S3 key for model upload")
    args = parser.parse_args()

    print(f"Loading training data from {args.input} ...", file=sys.stderr)
    X, y, groups = load_csv(args.input)
    print(
        f"Loaded: {len(y)} samples across {len(groups)} queries, {X.shape[1]} features.",
        file=sys.stderr,
    )

    booster = train(X, y, groups)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    booster.save_model(str(output_path))
    print(f"Model saved to {output_path}", file=sys.stderr)

    if args.s3_bucket and args.s3_key:
        upload_to_s3(str(output_path), args.s3_bucket, args.s3_key)
    else:
        print(
            "Tip: pass --s3-bucket and --s3-key to upload the model for SageMaker deployment.",
            file=sys.stderr,
        )


if __name__ == "__main__":
    main()
