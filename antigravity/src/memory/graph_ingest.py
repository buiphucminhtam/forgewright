#!/usr/bin/env python3
import argparse
from graphrag import GraphMemory


def main():
    parser = argparse.ArgumentParser(description="Ingest data into GraphRAG memory")
    parser.add_argument("--node-id", required=True, help="Unique ID for the node")
    parser.add_argument(
        "--type",
        default="Task",
        help="Type of the node (Task, Intent, Decision, Error, etc.)",
    )
    parser.add_argument("--content", required=True, help="Content of the node")
    parser.add_argument(
        "--weight", type=float, default=5.0, help="Initial weight for the node"
    )
    parser.add_argument("--link-to", help="ID of another node to link to")
    parser.add_argument(
        "--relation", default="RELATES_TO", help="Type of relation to the linked node"
    )

    args = parser.parse_args()

    mem = GraphMemory()
    mem.add_node(args.node_id, type=args.type, content=args.content, weight=args.weight)

    if args.link_to:
        mem.add_edge(args.node_id, args.link_to, relation=args.relation)

    print(f"Successfully ingested node '{args.node_id}' of type '{args.type}'")


if __name__ == "__main__":
    main()
