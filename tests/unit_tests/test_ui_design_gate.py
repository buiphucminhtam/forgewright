import os


def test_ui_routing_precedes_generic_feature():
    entry_path = "kernel/ENTRY.md"
    assert os.path.exists(entry_path), "ENTRY.md not found"

    with open(entry_path, "r") as f:
        content = f.read()

    ui_index = content.find("`FEATURE affecting UI`")
    generic_index = content.find("`FEATURE otherwise`")

    assert ui_index != -1, "UI routing not found in ENTRY.md"
    assert generic_index != -1, "Generic feature routing not found in ENTRY.md"
    assert ui_index < generic_index, "UI routing must precede generic feature routing"


def test_design_gate_appears_before_execution():
    solve_path = "kernel/SOLVE.md"
    assert os.path.exists(solve_path), "SOLVE.md not found"

    with open(solve_path, "r") as f:
        content = f.read()

    design_gate_index = content.find("UI DESIGN GATE")
    execution_index = content.find("EXECUTE & VERIFY")

    assert design_gate_index != -1, "UI Design Gate not found in SOLVE.md"
    assert execution_index != -1, "Execution step not found in SOLVE.md"
    assert design_gate_index < execution_index, (
        "UI Design Gate must appear before Execution"
    )


def test_required_design_system_and_responsive_fields_exist():
    solve_path = "kernel/SOLVE.md"
    with open(solve_path, "r") as f:
        content = f.read()

    assert "Existing design-system audit" in content
    assert "Responsive behavior matrix" in content
    assert "Component states:" in content
    assert "Tokens:" in content


def test_ui_verification_requires_multiple_viewport_checks():
    verify_path = "kernel/VERIFY.md"
    assert os.path.exists(verify_path), "VERIFY.md not found"

    with open(verify_path, "r") as f:
        content = f.read()

    assert "Project breakpoints/fallback viewports tested" in content
    assert "Horizontal overflow checked" in content
    assert "A successful build alone must not prove responsiveness" in content
