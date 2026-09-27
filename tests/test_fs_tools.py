import asyncio
import os
import sys
import tempfile

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from core.tools.fs_tools import (
    ReadFileTool, WriteFileTool, ListDirTool, DeleteFileTool,
    ReadFileArgs, WriteFileArgs, ListDirArgs, DeleteFileArgs,
)


def _run(coro):
    return asyncio.run(coro)


def test_write_read_roundtrip():
    d = tempfile.mkdtemp()
    r = _run(WriteFileTool().run(WriteFileArgs(path="sub/hello.py", content="print(1)"), project_root=d))
    assert r.success, r.error
    assert os.path.isfile(os.path.join(d, "sub", "hello.py"))
    rr = _run(ReadFileTool().run(ReadFileArgs(path="sub/hello.py"), project_root=d))
    assert rr.success and rr.output == "sub/hello.py (1 lines):\n    1| print(1)"


def test_write_escape_is_blocked():
    d = tempfile.mkdtemp()
    r = _run(WriteFileTool().run(WriteFileArgs(path="../evil.txt", content="x"), project_root=d))
    assert not r.success
    assert "escape" in (r.error or "").lower()
    assert not os.path.exists(os.path.join(os.path.dirname(d), "evil.txt"))


def test_read_missing_file():
    d = tempfile.mkdtemp()
    r = _run(ReadFileTool().run(ReadFileArgs(path="nope.py"), project_root=d))
    assert not r.success and "not found" in (r.error or "").lower()


def test_list_dir_hides_noise():
    d = tempfile.mkdtemp()
    os.makedirs(os.path.join(d, "node_modules"))
    os.makedirs(os.path.join(d, "src"))
    open(os.path.join(d, "app.py"), "w").close()
    r = _run(ListDirTool().run(ListDirArgs(path="."), project_root=d))
    assert r.success
    assert "src/" in r.output and "app.py" in r.output
    assert "node_modules" not in r.output


def test_delete_file():
    d = tempfile.mkdtemp()
    p = os.path.join(d, "x.py")
    open(p, "w").close()
    r = _run(DeleteFileTool().run(DeleteFileArgs(path="x.py"), project_root=d))
    assert r.success and not os.path.exists(p)


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"PASS {name}")
    print("all fs_tools tests passed")
