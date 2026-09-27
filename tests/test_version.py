import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

from core import __version__


def test_frontend_version_matches_backend():
    # electron-updater compares package.json's version, the CLI shows core's: keep them equal.
    with open(os.path.join(ROOT, "frontend", "package.json"), encoding="utf-8") as f:
        assert json.load(f)["version"] == __version__
