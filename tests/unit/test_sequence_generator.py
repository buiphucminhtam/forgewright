import os
import subprocess
import pytest

def test_sequence_diagram_generation():
    # 1. Run the sequence diagram generator script
    cmd = ["npx", "tsx", "scripts/generate-sequence.ts"]
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    # Assert execution completed successfully
    assert result.returncode == 0, f"Script failed with output:\n{result.stderr}\n{result.stdout}"
    assert "Hoàn thành xuất sắc!" in result.stdout

    # 2. Check output directory exists
    output_dir = os.path.join(os.getcwd(), "docs", "architecture", "flows")
    assert os.path.exists(output_dir), "Output directory docs/architecture/flows/ does not exist"

    # 3. Check README index file
    readme_path = os.path.join(output_dir, "README.md")
    assert os.path.exists(readme_path), "README.md index file was not created"
    
    with open(readme_path, "r", encoding="utf-8") as f:
        readme_content = f.read()
        assert "# Sequence Flow Charts" in readme_content
        assert "| HTTP Method | API Path | Client Component | Server Handler | Diagram |" in readme_content
        assert "GET" in readme_content
        assert "POST" in readme_content

    # 4. Check specific flow files
    get_flow_path = os.path.join(output_dir, "GET-_api_projects.md")
    assert os.path.exists(get_flow_path), "GET-_api_projects.md flow diagram was not created"
    
    with open(get_flow_path, "r", encoding="utf-8") as f:
        flow_content = f.read()
        assert "# API Flow: GET /api/projects" in flow_content
        assert "sequenceDiagram" in flow_content
        assert "mermaid" in flow_content
        assert "EnvironmentStatus.tsx" in flow_content
        
        # Verify noise filtering is working: system calls should NOT be in the connection list
        assert "NextResponse" not in flow_content
        assert "console.log" not in flow_content
        assert "readdirSync" not in flow_content
        assert "statSync" not in flow_content

    post_flow_path = os.path.join(output_dir, "POST-_api_projects_setup.md")
    assert os.path.exists(post_flow_path), "POST-_api_projects_setup.md flow diagram was not created"
    
    with open(post_flow_path, "r", encoding="utf-8") as f:
        flow_content = f.read()
        assert "# API Flow: POST /api/projects/setup" in flow_content
        assert "sequenceDiagram" in flow_content
        assert "mermaid" in flow_content
        assert "EnvironmentStatus.tsx" in flow_content
        
        # Verify noise filtering is working: system calls should NOT be in the connection list
        assert "NextResponse" not in flow_content
        assert "execSync" not in flow_content
        assert "existsSync" not in flow_content
        assert "readFileSync" not in flow_content
