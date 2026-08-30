import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from core.agent.json_protocol import parse_agent_output, ProtocolError


def test_parses_tool_call():
    t = parse_agent_output(
        '{"thought":"read it","action":{"tool":"read_file","args":{"path":"a.py"}},"final_answer":null}'
    )
    assert t.action is not None
    assert t.action.tool == "read_file"
    assert t.action.args["path"] == "a.py"
    assert t.final_answer is None


def test_parses_final_answer_with_surrounding_prose():
    t = parse_agent_output('Sure: {"thought":"done","action":null,"final_answer":"created file"}')
    assert t.action is None
    assert t.final_answer == "created file"


def test_strips_markdown_fences():
    t = parse_agent_output(
        '```json\n{"thought":"x","action":{"tool":"list_dir","args":{}},"final_answer":null}\n```'
    )
    assert t.action.tool == "list_dir"
    assert t.action.args == {}


def test_missing_json_raises():
    try:
        parse_agent_output("there is no json here")
    except ProtocolError:
        return
    raise AssertionError("expected ProtocolError")


def test_neither_action_nor_final_raises():
    try:
        parse_agent_output('{"thought":"stuck","action":null,"final_answer":null}')
    except ProtocolError:
        return
    raise AssertionError("expected ProtocolError")


def test_action_without_tool_raises():
    try:
        parse_agent_output('{"thought":"x","action":{"args":{}},"final_answer":null}')
    except ProtocolError:
        return
    raise AssertionError("expected ProtocolError")


def test_nested_braces_in_args_parse():
    t = parse_agent_output(
        '{"thought":"write","action":{"tool":"write_file","args":{"path":"a.json","content":"{\\"k\\": 1}"}},"final_answer":null}'
    )
    assert t.action.tool == "write_file"
    assert t.action.args["content"] == '{"k": 1}'


def test_triple_quoted_final_answer_is_repaired():
    # The exact malformation qwen2.5-coder:3b emits for "write code" requests:
    # a Python triple-quoted string as the final_answer value (invalid JSON).
    raw = '''```json
{
  "thought": "writing control statements",
  "action": null,
  "final_answer": """
if x > 10:
    print("big")
else:
    print("small")
"""
}
```'''
    t = parse_agent_output(raw)
    assert t.action is None
    assert "if x > 10:" in t.final_answer
    assert 'print("big")' in t.final_answer


def test_literal_newlines_in_string_are_tolerated():
    # Unescaped newline inside a normal double-quoted value (strict=False path).
    raw = '{"thought":"x","action":{"tool":"write_file","args":{"path":"a.py","content":"line1\nline2"}},"final_answer":null}'
    t = parse_agent_output(raw)
    assert t.action.tool == "write_file"
    assert "line1" in t.action.args["content"] and "line2" in t.action.args["content"]


def test_triple_quoted_write_content_is_repaired():
    raw = '{"thought":"w","action":{"tool":"write_file","args":{"path":"a.py","content":"""print(1)\nprint(2)"""}},"final_answer":null}'
    t = parse_agent_output(raw)
    assert t.action.tool == "write_file"
    assert "print(1)" in t.action.args["content"]


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"PASS {name}")
    print("all json_protocol tests passed")
