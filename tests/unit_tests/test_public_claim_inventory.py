import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
INVENTORY = ROOT / "docs" / "public-claim-inventory.json"


def test_public_claim_inventory_is_complete_and_scoped() -> None:
    inventory = json.loads(INVENTORY.read_text(encoding="utf-8"))
    assert inventory["version"] == 1
    documents = inventory["documents"]
    expected_classifications = {
        "README.md": "public-product",
        "docs/guides/testing-stack.md": "public-guide",
        "docs/adr/ADR-002-kuzudb-readonly-mcp.md": "architecture-decision",
        "docs/guides/gitnexus.md": "public-guide",
        "docs/facebook-post-token-studio.md": "historical-unverified-marketing",
    }
    assert {item["path"]: item["classification"] for item in documents} == (
        expected_classifications
    )
    assert {item["classification"] for item in documents} == {
        "public-product",
        "public-guide",
        "architecture-decision",
        "historical-unverified-marketing",
    }

    for item in documents:
        assert set(item) == {
            "path",
            "classification",
            "requiredMarker",
            "forbiddenPatterns",
        }
        assert all(
            isinstance(item[key], str) and item[key]
            for key in ("path", "classification", "requiredMarker")
        )
        assert isinstance(item["forbiddenPatterns"], list)
        if item["classification"] != "historical-unverified-marketing":
            assert item["forbiddenPatterns"]
        path = ROOT / item["path"]
        assert path.is_file(), f"inventoried public document is missing: {item['path']}"
        content = path.read_text(encoding="utf-8")
        assert item["requiredMarker"] in content, (
            f"{item['path']} is missing claim boundary: {item['requiredMarker']}"
        )
        if item["classification"] == "historical-unverified-marketing":
            first_content = next(line for line in content.splitlines() if line.strip())
            assert first_content.startswith("# Bài viết Facebook")
            assert item["requiredMarker"] in "\n".join(content.splitlines()[:5])
        for pattern in item["forbiddenPatterns"]:
            assert re.search(pattern, content, flags=re.IGNORECASE) is None, (
                f"{item['path']} restored unsupported claim pattern: {pattern}"
            )
