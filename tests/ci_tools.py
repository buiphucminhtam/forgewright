"""Test-only access to the maintained local-CI dependency discovery contract."""

from pathlib import Path
import runpy


def node_module_file(root: Path, component: str, relative: str) -> str:
    namespace = runpy.run_path(str(root / "scripts/ci/local-ci.py"))
    runner = namespace["LocalCI"](
        dry_run=False, keep_going=False, timeout=600, base_ref=None
    )
    entry = runner._node_module_file(component, relative)
    assert entry is not None, (
        f"Missing {component}:{relative}; run `npm run ci:bootstrap` first"
    )
    return str(entry)
