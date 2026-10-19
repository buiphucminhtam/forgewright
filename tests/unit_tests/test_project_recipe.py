import hashlib
import json
import os
from pathlib import Path
import sys
from types import SimpleNamespace

import pytest

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scripts/runtime'))


def fixture(tmp_path):
    (tmp_path/'src').mkdir(); (tmp_path/'src/a.ts').write_text('const x = 1;')
    (tmp_path/'tsconfig.json').write_text('{"include":["src"]}')
    compiler=tmp_path/'compiler.js';compiler.write_text('// pinned compiler')
    binary=Path(sys.executable).resolve()
    sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
    value={'schema':'forgewright-typecheck-recipe/v1','workspace':str(tmp_path),'cwd':'.','config':'tsconfig.json',
           'roots':['src'],'files':{'src/a.ts':sha(tmp_path/'src/a.ts'),'tsconfig.json':sha(tmp_path/'tsconfig.json')},
           'node':{'path':str(binary),'sha256':sha(binary)},
           'compiler':{'path':str(compiler),'sha256':sha(compiler)}}
    return value


def test_recipe_pins_inputs_toolchain_and_launches_no_process(tmp_path):
    from project_recipe import verify_recipe
    value=fixture(tmp_path)
    result=verify_recipe(tmp_path,value)
    assert result['inputs']==2 and result['workspace']==str(tmp_path)


@pytest.mark.parametrize('damage',['changed','untracked','symlink','toolchain','outside'])
def test_recipe_rejects_changed_inputs_before_compiler(tmp_path,damage):
    from project_recipe import verify_recipe,RecipeError
    value=fixture(tmp_path)
    if damage=='changed':(tmp_path/'src/a.ts').write_text('changed')
    elif damage=='untracked':(tmp_path/'src/new.ts').write_text('new')
    elif damage=='symlink':
        (tmp_path/'src/a.ts').unlink();(tmp_path/'src/a.ts').symlink_to(tmp_path/'tsconfig.json')
    elif damage=='toolchain':value['node']['sha256']='0'*64
    else:value['cwd']='../outside'
    with pytest.raises(RecipeError):verify_recipe(tmp_path,value)


def test_raw_entry_rejects_before_any_compiler_launch(tmp_path, monkeypatch):
    import project_recipe
    value=fixture(tmp_path)
    path=tmp_path/'recipe.json';path.write_text(json.dumps(value))
    calls=[]
    monkeypatch.delenv('FORGEWRIGHT_OUTPUT_DIR',raising=False)
    monkeypatch.setattr(project_recipe.subprocess,'run',lambda *a,**k: calls.append(a) or SimpleNamespace(returncode=0))
    assert project_recipe.main(['--project',str(tmp_path),'--recipe','recipe.json']) == 125
    assert calls == []


def test_typecheck_allows_declared_plugin_inside_workspace(tmp_path, monkeypatch):
    import project_recipe
    value = fixture(tmp_path)
    plugin = tmp_path / 'plugins/native/definitions.ts'
    plugin.parent.mkdir(parents=True)
    plugin.write_text('export interface Definition { id: string }')
    source = tmp_path / 'src/a.ts'
    source.write_text("import type { Definition } from '../plugins/native/definitions';\nconst x: Definition = { id: 'x' };")
    value['files']['src/a.ts'] = hashlib.sha256(source.read_bytes()).hexdigest()
    value['files'][str(plugin.relative_to(tmp_path))] = hashlib.sha256(plugin.read_bytes()).hexdigest()
    recipe = tmp_path / 'recipe.json'
    recipe.write_text(json.dumps(value))
    monkeypatch.setattr(project_recipe, 'require_managed', lambda project: None)
    calls = []

    def compiler(argv, **kwargs):
        calls.append(argv)
        root = Path(argv[argv.index('--rootDir') + 1])
        # TS6059 rejects a declared import outside the compiler's rootDir.
        return SimpleNamespace(returncode=0 if plugin.is_relative_to(root) else 1)

    monkeypatch.setattr(project_recipe.subprocess, 'run', compiler)
    assert project_recipe.main(['--project', str(tmp_path), '--recipe', 'recipe.json']) == 0
    assert len(calls) == 1
    assert calls[0][calls[0].index('--rootDir') + 1] == str(tmp_path)
    assert '--noEmit' in calls[0]


@pytest.mark.parametrize('damage',['omitted-config','extends','outside-include'])
def test_compiler_config_is_explicit_pinned_and_scoped(tmp_path,damage):
    from project_recipe import verify_recipe,RecipeError
    value=fixture(tmp_path)
    if damage=='omitted-config':value['files'].pop('tsconfig.json')
    else:
        path=tmp_path/'tsconfig.json'
        path.write_text(json.dumps({'extends':'../foreign.json'} if damage=='extends' else {'include':['../outside']}))
        value['files']['tsconfig.json']=hashlib.sha256(path.read_bytes()).hexdigest()
    with pytest.raises(RecipeError):verify_recipe(tmp_path,value)


@pytest.mark.parametrize('damage',['valid','delayed','inactive','stale-child','foreign-owner'])
def test_managed_entry_binds_actual_supervisor_authority(tmp_path,monkeypatch,damage):
    import project_recipe
    home=tmp_path/'authority';(home/'jobs').mkdir(parents=True)
    job='job-'+'1'*32;base=tmp_path/'.forgewright/runtime/build-jobs'/job
    (base/'output').mkdir(parents=True,mode=0o700);(base/'scratch').mkdir(mode=0o700)
    monkeypatch.setenv('FORGEWRIGHT_OUTPUT_DIR',str(base/'output'))
    monkeypatch.setenv('TMPDIR',str(base/'scratch'))
    monkeypatch.setenv('FORGEWRIGHT_JOB_ADMISSION_HOME',str(home))
    record={'physical_workspace':str(tmp_path),'state':'running','owner_pid':os.getppid(),
        'owner_identity':'parent','child':{'pid':os.getpid(),'identity':'child'},'storage':{'path':str(base)},
        'leases':[{'kind':'worker','state':'active'},{'kind':'heavy','state':'active'}]}
    monkeypatch.setattr(project_recipe,'inspect_process',lambda pid:'child' if pid==os.getpid() else 'parent')
    if damage=='inactive':record['leases'][1]['state']='released'
    elif damage=='stale-child':record['child']['identity']='old'
    elif damage=='foreign-owner':record['owner_pid']=1
    reads=[]
    def read(path,limit):
        assert path==home/'jobs'/(job+'.json')
        reads.append(path)
        value=dict(record)
        if damage=='delayed' and len(reads)==1:value['state']='queued'
        return json.dumps(value).encode()
    monkeypatch.setattr(project_recipe,'private_read',read)
    if damage in {'valid','delayed'}:project_recipe.require_managed(tmp_path)
    else:
        with pytest.raises(project_recipe.RecipeError):project_recipe.require_managed(tmp_path)


def test_prevention_command_keeps_actual_launcher_spelling(monkeypatch):
    import importlib.util
    spec=importlib.util.spec_from_file_location('prevention_probe',ROOT/'tests/runtime/resource_prevention.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    original=['/framework/Resources/Python.app/Contents/MacOS/Python',str(ROOT/'tests/runtime/resource_prevention.py'),'--tier','contract']
    monkeypatch.setattr(sys,'orig_argv',original)
    monkeypatch.setattr(sys,'executable','/opt/alias/bin/python3')
    assert module.observed_command()==original
    assert module.observed_command() is not original
