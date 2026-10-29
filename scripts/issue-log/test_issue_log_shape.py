"""Run: python3 -m unittest discover scripts/issue-log"""
import io
import json
import shlex
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gh_issue_guard as guard  # noqa: E402
import issue_log_shape as shape  # noqa: E402

PROSE_LOG = "Lifecycle status: open\nFiler origin: agent\nOntology: issue-log 1.3.0\n\nThe map jumps."


def full_values():
    return {label: "x" for label, required in shape.form_fields() if required}


class Shape(unittest.TestCase):
    def test_form_has_issue_type_first(self):
        fields = shape.form_fields()
        self.assertIn(("Issue Type", True), fields)
        self.assertGreater(sum(r for _, r in fields), 20)

    def test_render_roundtrip_passes_lint_and_triage(self):
        body = shape.render(full_values())
        self.assertEqual(shape.missing_required(body), [])
        self.assertTrue(shape.triage_reads(body, set()))

    def test_render_rejects_unknown_and_empty(self):
        with self.assertRaises(ValueError):
            shape.render({**full_values(), "Not A Field": "x"})
        values = full_values()
        values["Issue Type"] = " "
        with self.assertRaises(ValueError):
            shape.render(values)

    def test_decide(self):
        self.assertEqual(shape.decide(PROSE_LOG, set()), "flag")
        self.assertEqual(shape.decide(PROSE_LOG, {shape.LABEL}), "flag")
        self.assertEqual(shape.decide("Button is blue, should be red.", set()), "none")
        self.assertEqual(shape.decide(PROSE_LOG, {"observational-issue", shape.LABEL}), "clear")
        self.assertEqual(shape.decide(shape.render(full_values()), {shape.LABEL}), "clear")
        self.assertEqual(shape.decide(shape.render(full_values()), set()), "none")


class Guard(unittest.TestCase):
    def test_blocks_prose_log(self):
        cmd = f"gh issue create --title t --body {shlex.quote(PROSE_LOG)}"
        self.assertIsNotNone(guard.check(cmd))

    def test_passes_form_body_other_repo_and_plain_issue(self):
        body = shape.render(full_values())
        self.assertIsNone(guard.check(f"gh issue create --title t --body {shlex.quote(body)}"))
        self.assertIsNone(guard.check(f"gh issue create -R Pukujan/other --body {shlex.quote(PROSE_LOG)}"))
        self.assertIsNone(guard.check("gh issue create --title t --body 'typo on home page'"))
        self.assertIsNone(guard.check("git status && gh pr create --body x"))

    def test_body_file(self):
        tmp = Path(self.id().replace(".", "_") + ".md")
        tmp.write_text(PROSE_LOG)
        try:
            self.assertIsNotNone(guard.check(f"cd . && gh issue create --repo Pukujan/nyc-map-agent --body-file {tmp}"))
        finally:
            tmp.unlink()

    def test_hook_exit_codes(self):
        event = {"tool_name": "Bash", "tool_input": {"command": f"gh issue create --body {shlex.quote(PROSE_LOG)}"}}
        with mock.patch("sys.stdin", io.StringIO(json.dumps(event))), mock.patch("sys.stderr", io.StringIO()):
            self.assertEqual(guard.main(), 2)
        with mock.patch("sys.stdin", io.StringIO(json.dumps({"tool_name": "Read"}))):
            self.assertEqual(guard.main(), 0)


if __name__ == "__main__":
    unittest.main()
