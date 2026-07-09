import pytest
from src.memory.graphrag import GraphMemory


@pytest.fixture
def memory():
    """Fixture to initialize a fresh GraphMemory instance for each test."""
    return GraphMemory(storage_path=":memory:")


def test_add_nodes_and_retrieve(memory):
    """Test creating conversational nodes and retrieving them."""
    memory.add_node("task_1", type="Task", content="Implement Auth", weight=5.0)
    memory.add_node("intent_1", type="Intent", content="User wants login", weight=2.0)

    node_data = memory.get_node("task_1")
    assert node_data["type"] == "Task"
    assert node_data["content"] == "Implement Auth"


def test_add_edges_and_relations(memory):
    """Test linking conversational nodes with relationships."""
    memory.add_node("task_1", type="Task", content="Implement Auth")
    memory.add_node("error_1", type="Error", content="Token Expired")

    # Edge: Task -> RESOLVES -> Error
    memory.add_edge("task_1", "error_1", relation="RESOLVES")

    # Check if edge exists
    assert memory.has_edge("task_1", "error_1")
    edge_data = memory.get_edge("task_1", "error_1")
    assert edge_data["relation"] == "RESOLVES"


def test_ebbinghaus_decay(memory):
    """Test that cognitive decay correctly reduces weights of nodes."""
    memory.add_node("chat_1", type="Intent", content="Just saying hi", weight=1.0)
    memory.add_node("core_task", type="Decision", content="Use Next.js", weight=10.0)

    # Simulate time passing and decay
    memory.apply_decay(decay_rate=0.5)

    chat_weight = memory.get_node("chat_1")["weight"]
    core_weight = memory.get_node("core_task")["weight"]

    assert chat_weight == 0.5
    assert core_weight == 5.0


def test_auto_pruning(memory):
    """Test that nodes below the forgetting threshold are removed."""
    memory.add_node(
        "irrelevant_chat", type="Intent", content="Hmm let me see", weight=0.4
    )
    memory.add_node(
        "important_bug", type="Error", content="Null pointer in DB", weight=8.0
    )

    # Prune anything strictly below 1.0 weight
    pruned_count = memory.prune(threshold=1.0)

    assert pruned_count == 1
    assert not memory.has_node("irrelevant_chat")
    assert memory.has_node("important_bug")


def test_gitnexus_integration_mock(memory):
    """Test bridging a conversational decision to a GitNexus AST symbol."""
    memory.add_node("decision_1", type="Decision", content="Wrap with try-catch")
    memory.add_node("gitnexus_sym_1", type="CodeSymbol", content="authController.login")

    memory.add_edge("decision_1", "gitnexus_sym_1", relation="MODIFIES")

    neighbors = memory.get_neighbors("decision_1", relation_type="MODIFIES")
    assert "gitnexus_sym_1" in neighbors
