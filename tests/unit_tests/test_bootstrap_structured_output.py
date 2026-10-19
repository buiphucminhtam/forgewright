"""Regression oracle for the reviewed shared-runtime stdout transport repair."""
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[2] / 'scripts/runtime/bootstrap_manager.py'
spec = importlib.util.spec_from_file_location('bootstrap_output_regression', SOURCE)
bm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bm)


class StructuredOutputTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='bootstrap-output-test-')
        self.root = Path(self.directory.name)
        self.payload = self.root / 'payload.txt'
        self.cli = self.root / 'fixture.py'
        self.cli.write_text('import os,sys\nfrom pathlib import Path\n'
                            'sys.stdout.write(Path(os.environ["FORGE_TEST_PAYLOAD_FILE"]).read_text())\n'
                            'sys.exit(int(os.environ.get("FORGE_TEST_EXIT", "0")))\n')
        self.environment = patch.dict(os.environ, {'FORGE_TEST_PAYLOAD_FILE': str(self.payload), 'FORGE_TEST_EXIT': '0'})
        self.environment.start()
        self.entry = patch.object(bm, 'cli_entry', return_value=[sys.executable, str(self.cli)])
        self.entry.start()

    def tearDown(self):
        self.entry.stop()
        self.environment.stop()
        self.directory.cleanup()

    def call(self, value, args=None, required=False):
        self.payload.write_text(value if isinstance(value, str) else json.dumps(value))
        return bm.call_forge(args or ['docs', 'doctor', str(self.root)], project=self.root,
                             required=required, stage='output-regression')

    def test_large_successful_envelope_is_complete(self):
        value = {'ok': True, 'data': {'payload': 'x' * 6000}}
        result = self.call(value)
        self.assertEqual(result['status'], 'ready')
        self.assertEqual(json.loads(result['stdout']), value)

    def test_large_pi_result_remains_complete(self):
        value = {'worker': 'pi', 'ready': True, 'enabled': True, 'model': 'fixture', 'padding': 'x' * 6000}
        result = self.call(value, ['delegate', 'status', '--worker', 'pi'])
        self.assertEqual(result['status'], 'ready')
        self.assertEqual(json.loads(result['stdout']), value)

    def test_failed_or_malformed_envelope_stays_rejected(self):
        for value in [{'ok': False, 'padding': 'x' * 6000}, 'not-json' + 'x' * 6000]:
            with self.subTest(kind=str(value)[:20]):
                self.assertEqual(self.call(value)['status'], 'degraded')

    def test_nonzero_exit_stays_rejected(self):
        with patch.dict(os.environ, {'FORGE_TEST_EXIT': '1'}):
            self.assertEqual(self.call({'ok': True, 'padding': 'x' * 6000})['status'], 'degraded')

    def test_oversized_output_is_rejected(self):
        value = {'ok': True, 'padding': 'x' * (4 * 1024 * 1024)}
        self.assertEqual(self.call(value)['status'], 'degraded')
        with self.assertRaises(bm.BootstrapError):
            self.call(value, required=True)

    def test_ordinary_diagnostics_keep_the_original_tail(self):
        text = 'a' * 6000 + 'tail'
        self.payload.write_text(text)
        result = bm.run([sys.executable, str(self.cli)], cwd=self.root, stage='diagnostic')
        self.assertEqual(result['stdout'], text[-4000:])


if __name__ == '__main__':
    unittest.main(verbosity=2)
