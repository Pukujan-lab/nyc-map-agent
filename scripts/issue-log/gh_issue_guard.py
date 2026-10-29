#!/usr/bin/env python3
"""Claude Code PreToolUse hook: stop `gh issue create` with a prose issue log.

Reads the hook's JSON on stdin. Blocks (exit 2) a Bash `gh issue create` aimed at
this repository whose body reads like an issue log but lacks the form's
`### Issue Type` heading, because OIO's triage would skip it silently.
Everything else passes (exit 0).
"""
from __future__ import annotations

import json
import shlex
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import issue_log_shape as shape  # noqa: E402

REPO = "pukujan/nyc-map-agent"


def body_of(args: list[str]) -> str | None:
    for i, arg in enumerate(args):
        for flag in ("--body", "-b", "--body-file", "-F"):
            value = None
            if arg == flag and i + 1 < len(args):
                value = args[i + 1]
            elif arg.startswith(flag + "="):
                value = arg.split("=", 1)[1]
            if value is None:
                continue
            if flag in ("--body-file", "-F"):
                try:
                    return None if value == "-" else Path(value).expanduser().read_text(encoding="utf-8")
                except OSError:
                    return None
            return value
    return None


def check(command: str) -> str | None:
    """A reason to block, or None."""
    try:
        lexer = shlex.shlex(command, posix=True, punctuation_chars=True)
        lexer.whitespace_split = True
        tokens = list(lexer)
    except ValueError:
        return None
    parts, current = [], []
    for token in tokens:
        if token and set(token) <= set(";&|()\n"):
            parts.append(current)
            current = []
        else:
            current.append(token)
    parts.append(current)
    for args in parts:
        if args[:3] != ["gh", "issue", "create"]:
            continue
        repo = next((args[i + 1] for i, a in enumerate(args[:-1]) if a in ("--repo", "-R")), REPO)
        if repo.lower() != REPO:
            continue
        body = body_of(args)
        if body is None or not shape.looks_like_log(body) or "issuetype" in shape.headings(body):
            continue
        missing = shape.missing_required(body)
        return (
            "This issue log isn't in the intake form's shape, so OIO's triage would skip it without a label. "
            f"Missing {len(missing)} required headings, starting with: {', '.join(missing[:4])}. "
            "Put the fields in JSON and run `python3 scripts/issue-log/issue_log_shape.py render fields.json > body.md`, "
            "then file with `--body-file body.md`."
        )
    return None


def main() -> int:
    try:
        event = json.load(sys.stdin)
    except ValueError:
        return 0
    if event.get("tool_name") != "Bash":
        return 0
    reason = check((event.get("tool_input") or {}).get("command", ""))
    if reason:
        print(reason, file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
