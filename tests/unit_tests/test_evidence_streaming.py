"""File fingerprint bytes stay identical while regular-file reads stay bounded."""
import hashlib
from pathlib import Path
import stat
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/lite'))
from evidence_common import _actual_record


@pytest.mark.parametrize('payload', [b'', b'\x00\xff\x80binary\n', b'x' * (2 * 1024 * 1024 + 17)], ids=['empty', 'binary', 'multi-chunk'])
@pytest.mark.parametrize('permissions', [0o600, 0o755])
def test_regular_file_hash_is_compatible_and_reads_are_bounded(tmp_path, monkeypatch, payload, permissions):
    path = tmp_path / 'sample.bin'
    path.write_bytes(payload)
    path.chmod(permissions)
    info = path.lstat()
    mode = stat.S_IFMT(info.st_mode) | stat.S_IMODE(info.st_mode)
    expected = f'worktree|sample.bin|{mode:o}|file|{hashlib.sha256(payload).hexdigest()}'
    original_open = Path.open
    original_read_bytes = Path.read_bytes
    reads = []

    class BoundedReader:
        def __enter__(self):
            self.handle = original_open(path, 'rb')
            return self

        def read(self, size=-1):
            assert 0 < size <= 1024 * 1024, 'fingerprinting must use bounded reads'
            reads.append(size)
            return self.handle.read(size)

        def __exit__(self, *exc):
            self.handle.close()

    def bounded_open(candidate, *args, **kwargs):
        if candidate == path:
            assert args == ('rb',) and not kwargs
            return BoundedReader()
        return original_open(candidate, *args, **kwargs)

    def no_whole_file_read(candidate):
        assert candidate != path, 'fingerprinting must not allocate the whole file'
        return original_read_bytes(candidate)

    monkeypatch.setattr(Path, 'open', bounded_open)
    monkeypatch.setattr(Path, 'read_bytes', no_whole_file_read)
    assert _actual_record(tmp_path, 'sample.bin') == expected
    assert reads


def test_symlink_fingerprint_keeps_link_target_bytes(tmp_path):
    path = tmp_path / 'link'
    try:
        path.symlink_to('missing-target')
    except OSError as error:
        pytest.skip(f'symlink creation unavailable: {error}')
    info = path.lstat()
    mode = stat.S_IFMT(info.st_mode) | stat.S_IMODE(info.st_mode)
    expected = hashlib.sha256(b'missing-target').hexdigest()
    assert _actual_record(tmp_path, 'link') == f'worktree|link|{mode:o}|symlink|{expected}'


def test_missing_and_directory_fingerprints_are_unchanged(tmp_path):
    assert _actual_record(tmp_path, 'absent') == 'worktree|absent|MISSING'
    path = tmp_path / 'directory'
    path.mkdir()
    info = path.lstat()
    mode = stat.S_IFMT(info.st_mode) | stat.S_IMODE(info.st_mode)
    expected = hashlib.sha256(b'').hexdigest()
    assert _actual_record(tmp_path, 'directory') == f'worktree|directory|{mode:o}|other|{expected}'


@pytest.mark.parametrize('failure_at', ['open', 'read'])
def test_file_read_errors_do_not_produce_a_digest(tmp_path, monkeypatch, failure_at):
    path = tmp_path / 'sample.bin'
    path.write_bytes(b'file content')
    original_open = Path.open

    class BrokenReader:
        def __enter__(self):
            return self

        def read(self, size=-1):
            raise OSError('injected read failure')

        def __exit__(self, *exc):
            return None

    def failing_open(candidate, *args, **kwargs):
        if candidate != path:
            return original_open(candidate, *args, **kwargs)
        if failure_at == 'open':
            raise OSError('injected open failure')
        return BrokenReader()

    monkeypatch.setattr(Path, 'open', failing_open)
    with pytest.raises(OSError, match='injected'):
        _actual_record(tmp_path, 'sample.bin')
