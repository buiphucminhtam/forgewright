from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MODEL_TIER = ROOT / "skills" / "_shared" / "protocols" / "model-tier.md"
KERNEL_SOLVE = ROOT / "kernel" / "SOLVE.md"


def test_codex_fallback_guidance_matches_the_owner_approved_roles() -> None:
    protocol = MODEL_TIER.read_text(encoding="utf-8")
    kernel = KERNEL_SOLVE.read_text(encoding="utf-8")
    fallback = protocol.split("## Codex GPT-6 Family\n", 1)[1].split("\n## ", 1)[0]
    rows = {}
    for line in fallback.splitlines():
        if line.startswith("| `"):
            role, model, workload = (
                cell.strip() for cell in line.strip("|").split("|")
            )
            assert workload
            rows[role] = model

    assert rows == {
        "`planner`, `reviewer`": "Astra (6.2)",
        "`expert`, `builder`": "Sol (6.2)",
        "`scout`": "Luna (6)",
        "`explorer`": "Terra (6.1)",
    }

    # Provider-family mapping is intentionally lazy and protocol-local. The generic
    # boot kernel must stay provider-neutral so unrelated/weak models do not receive
    # stale provider-specific routing instructions.
    assert "GPT-5.6" not in kernel
    assert "GPT-6" not in kernel
    assert "gpt-6" not in kernel
    assert "Terra" not in kernel
    assert "Luna" not in kernel
    assert "Sol for" not in kernel

    assert "exact model ID advertised by the current Codex runtime" in protocol
    assert (
        "If the preferred model is not advertised, keep `provider-managed` "
        "selection and omit the override" in " ".join(protocol.split())
    )
