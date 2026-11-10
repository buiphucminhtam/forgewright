"""RF04 tests for Pi capability reporting, Google API opt-in boundary, and Windows worker portability."""

from __future__ import annotations

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_pi_capabilities_and_google_api_opt_in_boundary(tmp_path: Path):
    provider_url = (ROOT / "integrations/pi/provider.mjs").as_uri()
    probe_script = tmp_path / "probe_pi.mjs"
    probe_script.write_text(
        f"import assert from 'node:assert/strict';\n"
        f"import {{ probePiProviderCapabilities, resolveProvider }} from '{provider_url}';\n"
        f"const defCaps = probePiProviderCapabilities({{}});\n"
        f"assert.equal(defCaps.schema, 'forgewright-pi-capabilities/v1');\n"
        f"assert.equal(defCaps.routes['google-api'], 'unsupported');\n"
        f"assert.equal(defCaps.googleApiReason, 'pinned_pi_ai_adapter_rejects_guarded_custom_fetch');\n"
        f"assert.equal(defCaps.agySubscriptionGrantsGoogleApi, false);\n"
        f"const optCaps = probePiProviderCapabilities({{ FORGEWRIGHT_ENABLE_PI_GOOGLE_API: '1', GOOGLE_GENERATIVE_AI_API_KEY: 'test-key' }});\n"
        f"assert.equal(optCaps.routes['google-api'], 'unsupported');\n"
        f"delete process.env.FORGEWRIGHT_ENABLE_PI_GOOGLE_API;\n"
        f"await assert.rejects(resolveProvider({{ provider: 'google-api', model: 'gemini-4-argon' }}), /pi_google_api_opt_in_required/);\n"
        f"process.env.FORGEWRIGHT_ENABLE_PI_GOOGLE_API = '1';\n"
        f"delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;\n"
        f"await assert.rejects(resolveProvider({{ provider: 'google-api', model: 'gemini-4-argon' }}), /pi_auth_required/);\n"
        f"process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'fake-key-no-network';\n"
        f"await assert.rejects(resolveProvider({{ provider: 'google-api', model: 'gemini-4-argon' }}), /pi_google_api_unsupported_by_guarded_transport/);\n"
        f"console.log('RF04_PI_BOUNDARY_OK');\n",
        encoding="utf-8",
    )
    res = subprocess.run(
        ["node", str(probe_script)],
        cwd=str(ROOT),
        text=True,
        capture_output=True,
        timeout=20,
        check=False,
    )
    assert res.returncode == 0, (res.stdout, res.stderr)
    assert "RF04_PI_BOUNDARY_OK" in res.stdout
