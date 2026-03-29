import subprocess

nb_id = "ce5f75d7-9977-4785-a12c-7428e4d42ad4"
skill_file = "skills/frontend-engineer/SKILL.md"

prompt = """You are a Master Prompt Engineer upgrading the current 'frontend-engineer' AI Agent skill.
Examine the 'current_SKILL.md' source I uploaded. Then, based on the findings from the deep research on 2026 state-of-the-art workflows for frontend development, write a COMPLETELY UPGRADED version of this SKILL.md.

CRITICAL INSTRUCTIONS:
1. Retain the exact YAML frontmatter at the top (name, description, etc.). Do not change it.
2. Upgrade the internal instructions, giving the agent clearer frameworks (e.g. 2026 best practices).
3. Do not lose the core commands/tools the original skill uses. Enhance them.
4. ONLY return raw Markdown text. Do NOT wrap it in ```markdown...``` codeblocks. I am pipelining this output directly to a file. Do not say "Here is the upgraded version".

Output the full upgraded SKILL.md content now:"""

print("Running query...")
res = subprocess.run(["nlm", "notebook", "query", nb_id, prompt], capture_output=True, text=True)

if res.returncode != 0:
    print(f"Error: {res.stderr}")
else:
    content = res.stdout.strip()
    if content.startswith("```markdown\n"):
        content = content[12:]
    elif content.startswith("```\n"):
        content = content[4:]
    if content.endswith("```"):
        content = content[:-3]
    
    with open(skill_file, 'w') as f:
        f.write(content.strip() + "\n")
    print("Done writing to " + skill_file)
