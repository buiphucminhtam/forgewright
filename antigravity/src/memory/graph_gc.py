#!/usr/bin/env python3
import argparse
from graphrag import GraphMemory


def main():
    parser = argparse.ArgumentParser(
        description="Run Garbage Collection on GraphRAG memory"
    )
    parser.add_argument(
        "--decay-rate", type=float, default=0.8, help="Decay multiplier for weights"
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=1.0,
        help="Weight threshold below which nodes are pruned",
    )

    args = parser.parse_args()

    mem = GraphMemory()

    # Apply decay
    mem.apply_decay(decay_rate=args.decay_rate)

    # Prune
    pruned_count = mem.prune(threshold=args.threshold)

    print(
        f"Graph GC Complete. Applied decay {args.decay_rate}. Pruned {pruned_count} nodes below threshold {args.threshold}."
    )


if __name__ == "__main__":
    main()
