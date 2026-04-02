"""
LibreOffice Environment Configuration

Provides a safe environment for running LibreOffice in headless mode,
handling sandboxed environments where Unix sockets may be restricted.
"""

import os
import platform
import tempfile


def get_soffice_env():
    """
    Return an environment dict suitable for running LibreOffice headless.

    Handles:
    - SAL_USE_VCLPLUGIN=gen to avoid display server requirements
    - Custom user profile directory to avoid conflicts with running instances
    - Temp directory for socket-restricted environments
    """
    env = os.environ.copy()

    # Disable GUI plugin — use generic (headless) renderer
    env["SAL_USE_VCLPLUGIN"] = "gen"

    # Use a dedicated user profile to avoid conflicts with any running LO instance
    profile_dir = os.path.join(tempfile.gettempdir(), "lo_recalc_profile")
    os.makedirs(profile_dir, exist_ok=True)

    # On Linux, set UserInstallation to avoid socket permission issues in sandboxes
    if platform.system() == "Linux":
        env["TMPDIR"] = profile_dir

    return env
