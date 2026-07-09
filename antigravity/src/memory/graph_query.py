#!/usr/bin/env python3
import argparse
import json
from graphrag import GraphMemory


def main():
    parser = argparse.ArgumentParser(description="Query the GraphRAG memory")
    parser.add_argument("--query", required=True, help="Search term or node ID")
    parser.add_argument(
        "--hops", type=int, default=2, help="Number of hops to traverse"
    )

    args = parser.parse_args()
    mem = GraphMemory()

    # In a full implementation, we would query the GitNexus SQLite index here
    # and map it to our conversational Graph nodes using RELATES_TO / MODIFIES edges.

    # For now, we do a basic keyword search on our local graph
    results = []
    for node, attr in mem.graph.nodes(data=True):
        content = attr.get("content", "").lower()
        if args.query.lower() in content:
            results.append({"id": node, "attr": attr})

            # Find 1-hop neighbors (simulating GraphRAG contextual extraction)
            neighbors = list(mem.graph.successors(node)) + list(
                mem.graph.predecessors(node)
            )
            for n in neighbors:
                if n != node:
                    results.append(
                        {"id": n, "attr": mem.graph.nodes[n], "relation": "neighbor"}
                    )

    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
