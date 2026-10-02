"""Global Codex Stop defers only to the active, exact project entrypoint."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]
LEGACY = 'bash scripts/lite/stop-gate.sh --platform CODEX'
CANONICAL = "bash -c 'root=\"$(git rev-parse --show-toplevel 2>/dev/null)\" || exit 1; cd \"$root\" || exit 1; exec bash scripts/lite/stop-gate.sh --platform CODEX'"


def configuration(command, *, event='Stop', feature=True, matcher='*', group=True, hook=True):
    return (
        f'[features]\nhooks = {str(feature).lower()}\n'
        f'[[hooks.{event}]]\nmatcher = {json.dumps(matcher)}\nenabled = {str(group).lower()}\n'
        f'[[hooks.{event}.hooks]]\ntype = "command"\nenabled = {str(hook).lower()}\ncommand = {json.dumps(command)}\n'
    )


@pytest.mark.parametrize('case,config,target,platform,local,defer', [
    ('legacy', configuration(LEGACY), 'file', 'CODEX', False, True),
    ('canonical-basic', configuration(CANONICAL), 'file', 'CODEX', False, True),
    ('canonical-literal', '[features]\nhooks = true\n[[hooks.Stop]]\nmatcher = "*"\n[[hooks.Stop.hooks]]\ntype = "command"\ncommand = '+"'''"+CANONICAL+" '''\n", 'file', 'CODEX', False, True),
    ('comment', '# command = '+json.dumps(LEGACY)+'\n', 'file', 'CODEX', False, False),
    ('other-event', configuration(LEGACY, event='SessionStart'), 'file', 'CODEX', False, False),
    ('feature-disabled', configuration(LEGACY, feature=False), 'file', 'CODEX', False, False),
    ('group-disabled', configuration(LEGACY, group=False), 'file', 'CODEX', False, False),
    ('hook-disabled', configuration(LEGACY, hook=False), 'file', 'CODEX', False, False),
    ('unknown-control', configuration(CANONICAL)+'async = true\n', 'file', 'CODEX', False, False),
    ('malformed-later', configuration(CANONICAL)+'[[hooks.Stop]]\nmatcher = "*"\nhooks = 1\n', 'file', 'CODEX', False, False),
    ('unknown-sibling', configuration(CANONICAL)+'[[hooks.Stop.hooks]]\ntype = "unknown"\ncommand = "ignored"\n', 'file', 'CODEX', False, False),
    ('windows-deferral-disabled', configuration(CANONICAL)+'command_windows = "echo unrelated"\n', 'file', 'CODEX', False, False),
    ('unmatched', configuration(LEGACY, matcher='not-this-event'), 'file', 'CODEX', False, False),
    ('extra-command', configuration(LEGACY+' && echo extra'), 'file', 'CODEX', False, False),
    ('lookalike', configuration('printf '+json.dumps(CANONICAL)), 'file', 'CODEX', False, False),
    ('unicode-prefix', configuration('\u00a0'+CANONICAL), 'file', 'CODEX', False, False),
    ('carriage-prefix', configuration('\r'+CANONICAL), 'file', 'CODEX', False, False),
    ('malformed', configuration(LEGACY)+'broken = [\n', 'file', 'CODEX', False, False),
    ('missing-target', configuration(LEGACY), 'missing', 'CODEX', False, False),
    ('symlink-target', configuration(LEGACY), 'symlink', 'CODEX', False, False),
    ('local-validates', configuration(CANONICAL), 'file', 'CODEX', True, False),
    ('local-alias-validates', configuration(LEGACY), 'file', 'CODEX', 'alias', False),
    ('non-codex-validates', configuration(LEGACY), 'file', 'CLAUDE', False, False),
], ids=lambda value: value if isinstance(value,str) and '\n' not in value and len(value)<30 else None)
def test_exact_project_stop_deferral(tmp_path, case, config, target, platform, local, defer):
    project = tmp_path/'project'
    project.mkdir()
    env = {key:value for key,value in os.environ.items() if not key.startswith('GIT_')}
    env.update(HOME=str(tmp_path/'home'), FORGEWRIGHT_PYTHON_BIN=sys.executable, PYTHONDONTWRITEBYTECODE='1')
    if case == 'windows-deferral-disabled':
        commands = tmp_path/'commands'
        commands.mkdir()
        uname = commands/'uname'
        uname.write_text('#!/bin/sh\nprintf "MINGW64_NT\\n"\n')
        uname.chmod(0o755)
        env['PATH'] = str(commands)+os.pathsep+env.get('PATH','')
    subprocess.run(['git','init','-q',str(project)], check=True, env=env)
    (project/'.codex').mkdir()
    (project/'.codex/config.toml').write_text(config)
    project_lite = project/'scripts/lite'
    project_lite.mkdir(parents=True)
    project_gate = project_lite/'stop-gate.sh'
    if target == 'file': shutil.copy2(ROOT/'scripts/lite/stop-gate.sh',project_gate)
    elif target == 'symlink': project_gate.symlink_to(ROOT/'scripts/lite/stop-gate.sh')
    global_lite = tmp_path/'home/.forgewright/scripts/lite'
    global_lite.mkdir(parents=True)
    global_gate = global_lite/'stop-gate.sh'
    shutil.copy2(ROOT/'scripts/lite/stop-gate.sh',global_gate)
    selected = project_lite if local else global_lite
    if local == 'alias':
        selected = tmp_path/'local-alias'
        selected.symlink_to(project_lite, target_is_directory=True)
    sentinel = selected/'stop_gate.py'
    sentinel.write_text('import json,sys\nprint(json.dumps({"validator":True,"stdin":sys.stdin.read(),"argv":sys.argv[1:]}))\nraise SystemExit(37)\n')
    payload = json.dumps({'last_assistant_message':'No strict verification block','turn_id':'fixture-stop-deferral'})
    result = subprocess.run(['bash',str(selected/'stop-gate.sh'),'--platform',platform], cwd=project,
                            env=env, input=payload, text=True, capture_output=True, timeout=10)
    if defer:
        assert result.returncode == 0, result.stderr
        assert json.loads(result.stdout) == {'continue':True}
    else:
        assert result.returncode == 37, (case,result.stdout,result.stderr)
        observed = json.loads(result.stdout)
        assert observed['validator'] is True
        assert observed['stdin'] == payload
        assert observed['argv'] == ['--platform',platform,'--typed-stop-decision']
