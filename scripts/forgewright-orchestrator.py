import os
import sys
import json
import asyncio
import requests
from typing import List, Dict
from contextlib import AsyncExitStack

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

# Repo-relative paths — derived from this script's own location.
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.abspath(os.path.join(_SCRIPT_DIR, ".."))

# Provider / model are read exclusively from env vars so that the harness
# controls them without needing to hard-code any model name in this file.
_PROVIDER = os.environ.get("FORGEWRIGHT_PROVIDER", "OpenClaw")
_MODEL = os.environ.get("NINEROUTER_MODEL", "OpenClaw")

# MiniMax-specific config is optional and only used when provider == "minimax".
_API_KEY = os.environ.get("NINEROUTER_API_KEY", os.environ.get("MINIMAX_API_KEY", ""))
_BASE_URL = os.environ.get("NINEROUTER_BASE_URL")
if not _BASE_URL:
    _BASE_URL = "https://api.minimax.io/v1/text/chatcompletion_v2"
if not _BASE_URL.endswith("/chat/completions"):
    if not _BASE_URL.endswith("/"):
        _BASE_URL += "/"
    _BASE_URL += "chat/completions"


class ForgewrightAgent:
    def __init__(self, project_id: str, code_dir: str):
        self.project_id = project_id
        self.code_dir = code_dir
        self.messages = []

    def _call_api(self, tools: List[Dict]) -> Dict:
        """Call the Chat Completions API."""
        if not _API_KEY:
            print("[!] NINEROUTER_API_KEY or MINIMAX_API_KEY env var is not set.")
            sys.exit(1)
        if not _MODEL:
            print("[!] NINEROUTER_MODEL env var is not set.")
            sys.exit(1)
        headers = {
            "Authorization": f"Bearer {_API_KEY}",
            "Content-Type": "application/json",
        }

        data = {"model": _MODEL, "messages": self.messages, "temperature": 0.1}
        if tools:
            data["tools"] = tools

        print(f"[*] Calling {_PROVIDER}/{_MODEL} (Messages: {len(self.messages)})...")
        resp = requests.post(_BASE_URL, headers=headers, json=data, timeout=120)
        resp.encoding = "utf-8"
        
        import json
        if resp.text.startswith("data: "):
            lines = resp.text.split("\n")
            content = ""
            tool_calls = {}
            for line in lines:
                line = line.strip()
                if line.startswith("data: ") and line != "data: [DONE]":
                    try:
                        chunk = json.loads(line[6:])
                        if not chunk.get("choices"):
                            continue
                        delta = chunk["choices"][0].get("delta", {})
                        if "content" in delta and delta["content"]:
                            content += delta["content"]
                        if "tool_calls" in delta:
                            for tc in delta["tool_calls"]:
                                tc_index = tc.get("index")
                                if tc_index not in tool_calls:
                                    tool_calls[tc_index] = {"id": tc.get("id"), "type": tc.get("type", "function"), "function": {"name": "", "arguments": ""}}
                                if tc.get("function"):
                                    if "name" in tc["function"] and tc["function"]["name"]:
                                        tool_calls[tc_index]["function"]["name"] += tc["function"]["name"]
                                    if "arguments" in tc["function"] and tc["function"]["arguments"]:
                                        tool_calls[tc_index]["function"]["arguments"] += tc["function"]["arguments"]
                    except:
                        pass
            
            message = {"role": "assistant"}
            if content:
                message["content"] = content
            if tool_calls:
                message["tool_calls"] = [tool_calls[idx] for idx in sorted(tool_calls.keys())]
            return message
        else:
            try:
                text = resp.text.replace("data: [DONE]", "").strip()
                resp_json = json.loads(text)
            except Exception:
                print(f"[!] API Error, non-JSON response: {repr(resp.text)}")
                sys.exit(1)

            if "choices" not in resp_json:
                print(f"[!] API Error: {resp_json}")
                sys.exit(1)

            return resp_json["choices"][0]["message"]

    async def run(self, task: str):
        import subprocess

        # 1. Auto-Setup MCP for the project if manifest does not exist
        manifest_path = os.path.join(self.code_dir, ".antigravity", "mcp-manifest.json")
        forgewright_manifest_path = os.path.join(
            self.code_dir, "..", ".forgewright", "mcp-manifest.json"
        )
        if not os.path.exists(manifest_path) and not os.path.exists(
            forgewright_manifest_path
        ):
            print(
                f"[*] Missing MCP Manifest in '{self.code_dir}'. Running auto-setup..."
            )
            # Use the repo-relative mcp-setup script.
            mcp_setup_script = os.path.join(
                _REPO_ROOT, "scripts", "forgewright-mcp-setup.sh"
            )
            try:
                subprocess.run(
                    ["bash", mcp_setup_script],
                    cwd=self.code_dir,
                    check=True,
                )
            except Exception as e:
                print(f"[!] Warning: Auto-setup failed: {e}")

        # Define isolated path for DB
        gitnexus_db_path = os.path.normpath(
            os.path.join(self.code_dir, "..", "gitnexus_db")
        )

        gitnexus_env = {**os.environ}
        gitnexus_env["FORGEWRIGHT_WORKSPACE"] = self.code_dir
        gitnexus_env["FORGEWRIGHT_TOOL_SANDBOX"] = "false"
        gitnexus_env["GITNEXUS_DB"] = gitnexus_db_path

        mcp_servers = [
            {
                "name": "filesystem",
                "params": StdioServerParameters(
                    command="npx",
                    args=["-y", "@modelcontextprotocol/server-filesystem", "/workspace"],
                    env=gitnexus_env,
                ),
            },

            {
                "name": "gitnexus",
                "params": StdioServerParameters(
                    command="gitnexus",
                    args=["mcp"],
                    cwd=self.code_dir,
                    env=gitnexus_env,
                ),
            },
            {
                "name": "nlm",
                "params": StdioServerParameters(
                    command="nlm", args=["mcp"], env={**os.environ}
                ),
            },
        ]

        if os.path.exists(
            os.path.join(self.code_dir, ".antigravity", "mcp-manifest.json")
        ) or os.path.exists(
            os.path.join(self.code_dir, "..", ".forgewright", "mcp-manifest.json")
        ):
            # Use the repo-relative launcher script.
            mcp_launcher = os.path.join(
                _REPO_ROOT, "scripts", "forgewright-mcp-launcher.sh"
            )
            mcp_servers.append(
                {
                    "name": "forgewright",
                    "params": StdioServerParameters(
                        command="bash",
                        args=[mcp_launcher],
                        env={**os.environ, "FORGEWRIGHT_WORKSPACE": self.code_dir},
                    ),
                }
            )

        # Extract Project Context to give Tieu Mo better background
        project_context = ""
        readme_path = os.path.join(self.code_dir, "README.md")
        profile_path = os.path.join(
            self.code_dir, "..", ".forgewright", "project-profile.json"
        )
        pkg_path = os.path.join(self.code_dir, "package.json")

        try:
            if os.path.exists(readme_path):
                with open(readme_path, "r", encoding="utf-8") as f:
                    project_context = f.read()[:2000]
            elif os.path.exists(profile_path):
                with open(profile_path, "r", encoding="utf-8") as f:
                    project_context = f.read()[:2000]
            elif os.path.exists(pkg_path):
                with open(pkg_path, "r", encoding="utf-8") as f:
                    project_context = f.read()[:2000]
            else:
                project_context = "Chưa có thông tin README.md hoặc project-profile.json. Đây có thể là dự án mới khởi tạo."
        except Exception:
            project_context = "Không thể đọc thông tin ngữ cảnh dự án do lỗi cấp quyền hoặc định dạng file."

        # Determine if running in Lite mode vs Legacy Mode
        use_lite = os.environ.get("FORGEWRIGHT_LITE", "false").lower() == "true"

        if use_lite:
            script_dir = os.path.dirname(os.path.abspath(__file__))
            repo_root = os.path.abspath(os.path.join(script_dir, ".."))
            kernel_dir = os.path.join(repo_root, "kernel")

            entry_content = ""
            solve_content = ""
            verify_content = ""
            escalate_content = ""

            entry_path = os.path.join(kernel_dir, "ENTRY.md")
            if os.path.exists(entry_path):
                with open(entry_path, "r", encoding="utf-8") as f:
                    entry_content = f.read()

            solve_path = os.path.join(kernel_dir, "SOLVE.md")
            if os.path.exists(solve_path):
                with open(solve_path, "r", encoding="utf-8") as f:
                    solve_content = f.read()

            verify_path = os.path.join(kernel_dir, "VERIFY.md")
            if os.path.exists(verify_path):
                with open(verify_path, "r", encoding="utf-8") as f:
                    verify_content = f.read()

            escalate_path = os.path.join(kernel_dir, "ESCALATE.md")
            if os.path.exists(escalate_path):
                with open(escalate_path, "r", encoding="utf-8") as f:
                    escalate_content = f.read()

            # Simple keyword matching against prompt to select skill overlay
            skill_overlay_content = ""
            matched_skill = None
            prompt_lower = task.lower()

            triggers_map = {
                "debugger": [
                    "bug",
                    "crash",
                    "error",
                    "exception",
                    "broken",
                    "failing",
                    "not working",
                    "typeerror",
                    "fail",
                ],
                "software-engineer": [
                    "service",
                    "logic",
                    "refactor",
                    "api",
                    "feature",
                    "build",
                ],
                "qa-engineer": ["test", "qa", "verify", "validation", "coverage"],
                "frontend-engineer": [
                    "ui",
                    "component",
                    "react",
                    "next.js",
                    "tailwind",
                    "css",
                    "html",
                    "style",
                    "frontend",
                    "form",
                ],
                "frontend": [
                    "ui",
                    "component",
                    "react",
                    "next.js",
                    "tailwind",
                    "css",
                    "html",
                    "style",
                    "frontend",
                    "form",
                ],
                "backend": [
                    "server",
                    "route",
                    "middleware",
                    "auth",
                    "cors",
                    "express",
                    "backend",
                ],
                "api-designer": ["openapi", "swagger", "endpoint", "spec", "rest api"],
                "database-engineer": [
                    "db",
                    "schema",
                    "migration",
                    "prisma",
                    "sql",
                    "query",
                    "index",
                    "database",
                ],
                "security-engineer": [
                    "security",
                    "audit",
                    "owasp",
                    "sanitize",
                    "threat",
                    "injection",
                    "parameterize",
                ],
                "code-reviewer": ["review", "lint", "style", "pr ", "pull request"],
                "product-manager": [
                    "brd",
                    "prd",
                    "gherkin",
                    "user story",
                    "acceptance criteria",
                ],
            }

            for skill_name, triggers in triggers_map.items():
                for trigger in triggers:
                    if trigger in prompt_lower:
                        matched_skill = skill_name
                        break
                if matched_skill:
                    break

            if matched_skill:
                overlay_path = os.path.join(
                    repo_root, "skills", matched_skill, "LITE.md"
                )
                if os.path.exists(overlay_path):
                    with open(overlay_path, "r", encoding="utf-8") as f:
                        skill_overlay_content = f.read()
                        print(f"[*] Loaded skill LITE overlay: {matched_skill}")

            system_prompt = f"""
{entry_content}

{solve_content}

{verify_content}

{escalate_content}
"""
            if skill_overlay_content:
                system_prompt += (
                    f"\n## Skill-Specific Instructions\n{skill_overlay_content}\n"
                )

            system_prompt += f"""
## Current Task Context
- Project: '{self.project_id}'
- Workspace: '{self.code_dir}'

Nhiệm vụ từ Sếp: {task}
Bắt đầu bằng việc viết scratchpad UNDERSTAND theo SOLVE.md.
"""
        else:
            system_prompt = f"""
Bạn là Tiểu Mơ - Siêu Trí Tuệ Forgewright (Level 4 Agent Executor).
Dự án bạn đang làm việc: '{self.project_id}'
Thư mục mã nguồn cục bộ: '{self.code_dir}'
Thư mục Database GitNexus của dự án (Isolate Data): '{gitnexus_db_path}'

[NGỮ CẢNH DỰ ÁN TÓM TẮT]:
{project_context}

[YÊU CẦU BẮT BUỘC]:
1. Bạn phải TỰ CHỦ sử dụng các Function Tools (do hệ thống MCP cung cấp) để dọc mã nguồn, tạo thư mục, viết/sửa code theo yêu cầu của Sếp.
2. Cấm "đoán" cấu trúc thư mục, hãy dùng lệnh thích hợp để list file trước khi sửa hoặc viết đè.
3. Luôn đảm bảo bạn tự kiểm tra code sau khi viết. 
4. Nếu có tool hỗ trợ chạy Terminal, bạn được phép gọi các lệnh như `npm run build` hoặc `test` để tự Debug kết quả.

Nhiệm vụ từ Sếp: {task}
Khi bạn nghĩ rằng mình ĐÃ THỰC THI XONG VÀ HOÀN CHỈNH CODE, hãy trả về kết quả bằng văn bản bình thường (không gọi tool nữa) để hệ thống kết thúc và deploy.
"""
        self.messages.append({"role": "system", "content": system_prompt.strip()})
        self.messages.append(
            {"role": "user", "content": f"Bắt đầu xử lý tính năng: {task}"}
        )

        try:
            async with AsyncExitStack() as stack:
                active_sessions = {}
                for srv in mcp_servers:
                    try:
                        read, write = await stack.enter_async_context(
                            stdio_client(srv["params"])
                        )
                        session = await stack.enter_async_context(
                            ClientSession(read, write)
                        )
                        await session.initialize()
                        active_sessions[srv["name"]] = session
                        print(f"[✓] MCP Server connected: {srv['name']}")
                    except Exception as e:
                        print(
                            f"[!] Warning: Failed to connect to MCP Server: {srv['name']} - {e}"
                        )

                if not active_sessions:
                    raise RuntimeError(
                        "No MCP Servers could be connected. Check dependencies."
                    )

                while True:
                    # 1. Fetch available MCP Tools dynamically
                    tools_payload = []
                    tool_to_session_map = {}

                    for srv_name, session in active_sessions.items():
                        try:
                            mcp_tools = await session.list_tools()
                            for t in mcp_tools.tools:
                                tool_to_session_map[t.name] = session
                                tools_payload.append(
                                    {
                                        "type": "function",
                                        "function": {
                                            "name": t.name,
                                            "description": t.description,
                                            "parameters": t.inputSchema,
                                        },
                                    }
                                )
                        except Exception as e:
                            print(f"[!] Error querying tools from {srv_name}: {e}")

                    # 2. ReAct reasoning with MiniMax
                    reply = self._call_api(tools_payload)
                    self.messages.append(reply)

                    # 3. Tool Execution Phase
                    if "tool_calls" in reply and reply["tool_calls"]:
                        for tcall in reply["tool_calls"]:
                            tname = tcall["function"]["name"]
                            targs = json.loads(tcall["function"]["arguments"])
                            print(f" ⚙️  Thực thi Tool: {tname} | Args: {targs}")

                            target_session = tool_to_session_map.get(tname)
                            if not target_session:
                                res_text = f"Execution Error: Unknown tool {tname} - It was not supplied by any connected MCP server."
                            else:
                                try:
                                    result = await target_session.call_tool(
                                        tname, arguments=targs
                                    )
                                    res_text = "\n".join(
                                        [
                                            c.text
                                            for c in result.content
                                            if hasattr(c, "text")
                                        ]
                                    )
                                except Exception as e:
                                    res_text = f"Execution Error: {str(e)}"

                            self.messages.append(
                                {
                                    "role": "tool",
                                    "tool_call_id": tcall["id"],
                                    "name": tname,
                                    "content": res_text,
                                }
                            )
                    else:
                        # Final output reached
                        final_str = reply.get("content", "")
                        print(f"\n[🏁 KẾT THÚC TASK]\n{final_str}")
                        break
        except Exception as err:
            print(f"[!] Orchestrator Error: {str(err)}")
            sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(
            "Usage: python3 forgewright-orchestrator.py <PROJECT_ID> <TASK_PROMPT> [CODE_DIR]"
        )
        sys.exit(1)

    pid = sys.argv[1]
    task_desc = sys.argv[2]
    # Default to a subdirectory inside the repo root rather than /root/projects.
    cdir = (
        sys.argv[3]
        if len(sys.argv) > 3
        else os.path.join(_REPO_ROOT, "projects", pid, "code")
    )

    agent = ForgewrightAgent(pid, cdir)
    asyncio.run(agent.run(task_desc))
