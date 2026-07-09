#!/usr/bin/env python3
import json
from graphrag import GraphMemory


def main():
    """
    Cluster Extractor for Self-Evolution (Skill Upgrades).
    Finds repeated Problem-Solution patterns in the graph.
    """
    mem = GraphMemory()

    # Simple clustering simulation:
    # Look for nodes of type 'Decision' that relate to 'Error'
    clusters = []

    for u, v, data in mem.graph.edges(data=True):
        if data.get("relation") == "RESOLVES":
            node_u = mem.graph.nodes[u]
            node_v = mem.graph.nodes[v]

            cluster_data = {
                "decision": node_u.get("content"),
                "error": node_v.get("content"),
                "weight": node_u.get("weight", 1.0),
            }
            clusters.append(cluster_data)

    # Output the clusters. An LLM agent would read this JSON and
    # generate a Markdown rule for `.claude/skills/SKILL.md`
    print(
        json.dumps(
            {
                "status": "success",
                "clusters_found": len(clusters),
                "data": clusters,
                "action": "Submit to LLM for Skill Generation if clusters_found > 3",
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
