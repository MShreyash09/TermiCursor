"""The local API runs shell commands, so only the TermiCursor UI may call it."""
import importlib
import os
import sys

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

EVIL = {"origin": "https://evil.example"}
# A route that doesn't exist: getting 404 (not 401) proves the request passed auth
# without touching the DB or Ollama.
PROBE = "/__probe__"


def _load_server(token: str):
    if token:
        os.environ["TERMICURSOR_TOKEN"] = token
    else:
        os.environ.pop("TERMICURSOR_TOKEN", None)
    import server
    return importlib.reload(server)


@pytest.fixture
def packaged():
    server = _load_server("s3cret")
    yield TestClient(server.app)
    os.environ.pop("TERMICURSOR_TOKEN", None)


@pytest.fixture
def dev():
    return TestClient(_load_server("").app)


def test_packaged_requires_token(packaged):
    assert packaged.get(PROBE).status_code == 401
    assert packaged.get(PROBE + "?token=wrong").status_code == 401
    assert packaged.get(PROBE + "?token=s3cret").status_code == 404
    assert packaged.get(PROBE, headers={"x-termicursor-token": "s3cret"}).status_code == 404


def test_packaged_rejects_foreign_origin_even_with_token(packaged):
    assert packaged.get(PROBE + "?token=s3cret", headers=EVIL).status_code == 401


def test_packaged_app_origin_null_and_preflight_work(packaged):
    null = {"origin": "null"}
    assert packaged.get(PROBE + "?token=s3cret", headers=null).status_code == 404
    pre = packaged.options("/sessions", headers={**null, "access-control-request-method": "POST"})
    assert pre.status_code == 200 and pre.headers["access-control-allow-origin"] == "null"


def test_packaged_websocket_requires_token(packaged):
    with pytest.raises(WebSocketDisconnect):
        with packaged.websocket_connect("/ws/agent/nope"):
            pass
    with packaged.websocket_connect("/ws/agent/nope?token=s3cret") as ws:
        assert ws.receive_json()["message"] == "Session not found"


def test_dev_mode_blocks_other_sites(dev):
    assert dev.get(PROBE).status_code == 404  # no Origin: same-machine tools, curl
    assert dev.get(PROBE, headers={"origin": "http://localhost:5180"}).status_code == 404
    assert dev.get(PROBE, headers=EVIL).status_code == 401
    # Sandboxed iframes send Origin: null; without a token that must not be trusted.
    assert dev.get(PROBE, headers={"origin": "null"}).status_code == 401
    with pytest.raises(WebSocketDisconnect):
        with dev.websocket_connect("/ws/agent/nope", headers=EVIL):
            pass
