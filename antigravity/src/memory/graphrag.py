import networkx as nx
import json
import os


class GraphMemory:
    """
    A biologically-inspired GraphRAG Memory system.
    Uses NetworkX as the in-memory graph engine, persisted to JSON.
    """

    def __init__(self, storage_path=".forgewright/memory-bank/graph_memory.json"):
        self.storage_path = storage_path
        self.graph = nx.DiGraph()
        self.load()

    def load(self):
        """Load graph from disk."""
        if self.storage_path != ":memory:" and os.path.exists(self.storage_path):
            try:
                with open(self.storage_path, "r") as f:
                    data = json.load(f)
                    self.graph = nx.node_link_graph(data)
            except Exception:
                self.graph = nx.DiGraph()

    def save(self):
        """Save graph to disk."""
        if self.storage_path != ":memory:":
            os.makedirs(os.path.dirname(self.storage_path), exist_ok=True)
            data = nx.node_link_data(self.graph)
            with open(self.storage_path, "w") as f:
                json.dump(data, f, indent=2)

    def add_node(self, node_id, type="Entity", content="", weight=1.0):
        """Add a conversational or code node to the graph."""
        self.graph.add_node(node_id, type=type, content=content, weight=weight)
        self.save()

    def get_node(self, node_id):
        """Retrieve a node's data."""
        if self.graph.has_node(node_id):
            return self.graph.nodes[node_id]
        return None

    def has_node(self, node_id):
        """Check if a node exists."""
        return self.graph.has_node(node_id)

    def add_edge(self, source_id, target_id, relation="RELATES_TO"):
        """Add a directional relationship between two nodes."""
        self.graph.add_edge(source_id, target_id, relation=relation)
        self.save()

    def has_edge(self, source_id, target_id):
        """Check if an edge exists between two nodes."""
        return self.graph.has_edge(source_id, target_id)

    def get_edge(self, source_id, target_id):
        """Retrieve an edge's data."""
        if self.graph.has_edge(source_id, target_id):
            return self.graph.edges[source_id, target_id]
        return None

    def get_neighbors(self, node_id, relation_type=None):
        """Get neighboring nodes, optionally filtered by relationship type."""
        if not self.graph.has_node(node_id):
            return []

        neighbors = []
        for target in self.graph.successors(node_id):
            edge_data = self.graph.edges[node_id, target]
            if relation_type is None or edge_data.get("relation") == relation_type:
                neighbors.append(target)
        return neighbors

    def apply_decay(self, decay_rate=0.5):
        """
        Simulate Ebbinghaus Forgetting Curve.
        Multiplies the weight of all nodes by the decay_rate.
        """
        for node in self.graph.nodes:
            current_weight = self.graph.nodes[node].get("weight", 1.0)
            self.graph.nodes[node]["weight"] = current_weight * decay_rate
        self.save()

    def prune(self, threshold=1.0):
        """
        Remove nodes that fall below the forgetting threshold.
        Returns the number of nodes pruned.
        """
        nodes_to_remove = [
            n
            for n, attr in self.graph.nodes(data=True)
            if attr.get("weight", 1.0) < threshold
        ]

        for n in nodes_to_remove:
            self.graph.remove_node(n)

        if nodes_to_remove:
            self.save()

        return len(nodes_to_remove)
