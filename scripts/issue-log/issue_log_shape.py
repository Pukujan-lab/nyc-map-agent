#!/usr/bin/env python3
"""Keep issue logs in the shape OIO's triage can read.

OIO's triage (`.github/scripts/oio_triage.py`, a managed file we must not edit)
only reads issues written as the intake form renders them: one `### <field
label>` heading per field. An issue written as free prose is skipped with a
green run and no label, so from 2026-10-24 to 2026-10-29 every issue log agents
filed here went untriaged (Pukujan/observational-issue-ops#62).

This script closes that gap from our side. Standard library only.

  lint FILE        print the required headings FILE is missing; exit 1 if any
  render JSON      print a form-shaped body from {"<field label>": "text", ...}
  ci               GitHub Actions, on an issue event: label and comment an issue
                   log that triage would skip; clear both once it is fixed
  sweep            GitHub Actions, by hand: run `ci` over every open issue
"""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FORM = ROOT / ".github/ISSUE_TEMPLATE/observational-issue.yml"
LABEL = "needs-record-shape"
MARK = "<!-- issue-log-shape -->"
# Words an issue log carries even when written as prose (#532 has all of them).
LOG_MARKERS = ("lifecycle status", "filer origin", "ontology", "destination", "evidence confidence", "impact if unresolved")


def form_fields(path: Path = FORM) -> list[tuple[str, bool]]:
    """(label, required) for each input field, in the form's order."""
    fields: list[tuple[str, bool]] = []
    for block in re.split(r"^  - type: ", path.read_text(encoding="utf-8"), flags=re.MULTILINE)[1:]:
        if block.startswith("markdown"):
            continue
        label = re.search(r"^\s+label: (.+)$", block, re.MULTILINE)
        if label:
            fields.append((label.group(1).strip().strip('"'), bool(re.search(r"required: true", block))))
    return fields


def _norm(text: str) -> str:
    # The same normalisation triage applies to headings.
    return "".join(text.lower().split())


def headings(body: str) -> set[str]:
    return {_norm(m) for m in re.findall(r"^###\s+([^\n]+?)\s*$", body, re.MULTILINE)}


def missing_required(body: str, fields: list[tuple[str, bool]] | None = None) -> list[str]:
    have = headings(body)
    return [label for label, required in (fields or form_fields()) if required and _norm(label) not in have]


def triage_reads(body: str, labels: set[str]) -> bool:
    """True when OIO's triage will treat this issue as an issue log."""
    return "observational-issue" in labels or "issuetype" in headings(body)


def looks_like_log(body: str) -> bool:
    low = body.lower()
    return sum(word in low for word in LOG_MARKERS) >= 2


def render(values: dict[str, str], fields: list[tuple[str, bool]] | None = None) -> str:
    fields = fields or form_fields()
    known = {label for label, _ in fields}
    unknown = sorted(set(values) - known)
    if unknown:
        raise ValueError(f"not form fields: {unknown}")
    missing = [label for label, required in fields if required and not str(values.get(label, "")).strip()]
    if missing:
        raise ValueError(f"required fields left empty: {missing}")
    return "\n\n".join(f"### {label}\n\n{str(values[label]).strip()}" for label, _ in fields if str(values.get(label, "")).strip()) + "\n"


def decide(body: str, labels: set[str]) -> str:
    """'flag', 'clear' or 'none' for one issue."""
    if triage_reads(body, labels):
        return "clear" if LABEL in labels else "none"
    return "flag" if looks_like_log(body) else "none"


def _api(method: str, url: str, data: dict | None = None):
    req = urllib.request.Request(
        url if url.startswith("http") else f"https://api.github.com{url}",
        method=method,
        data=json.dumps(data).encode() if data is not None else None,
        headers={"Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}", "Accept": "application/vnd.github+json"},
    )
    with urllib.request.urlopen(req) as res:
        raw = res.read()
        return json.loads(raw) if raw else None


def _comment(missing: list[str]) -> str:
    listed = "\n".join(f"- `### {label}`" for label in missing)
    return (
        f"{MARK}\nThis reads like an issue log, but OIO's triage can't see it: it only reads the intake form's "
        "`### <field label>` headings, and skips anything else without a label.\n\n"
        f"Missing required headings:\n{listed}\n\n"
        "Fix it by editing the body into the form's shape. From the command line, put the fields in a JSON file and run "
        "`python3 scripts/issue-log/issue_log_shape.py render fields.json > body.md`, then "
        "`gh issue edit <number> --body-file body.md`. This label clears itself once triage can read the issue."
    )


def handle(repo: str, issue: dict) -> str:
    if issue.get("pull_request"):
        return "none"
    body = issue.get("body") or ""
    labels = {label["name"] for label in issue.get("labels", [])}
    action = decide(body, labels)
    number = issue["number"]
    if action == "flag":
        if LABEL not in labels:
            _api("POST", f"/repos/{repo}/issues/{number}/labels", {"labels": [LABEL]})
        comments = _api("GET", f"/repos/{repo}/issues/{number}/comments?per_page=100") or []
        if not any(MARK in (c.get("body") or "") for c in comments):
            _api("POST", f"/repos/{repo}/issues/{number}/comments", {"body": _comment(missing_required(body))})
        print(f"::warning::#{number} reads like an issue log but OIO triage will skip it; labelled {LABEL}")
    elif action == "clear":
        _api("DELETE", f"/repos/{repo}/issues/{number}/labels/{LABEL}")
        print(f"#{number}: triage can read it now; removed {LABEL}")
    return action


def main(argv: list[str]) -> int:
    cmd = argv[1] if len(argv) > 1 else ""
    if cmd == "lint" and len(argv) == 3:
        missing = missing_required(Path(argv[2]).read_text(encoding="utf-8"))
        for label in missing:
            print(f"missing heading: ### {label}")
        return 1 if missing else 0
    if cmd == "render" and len(argv) == 3:
        sys.stdout.write(render(json.loads(Path(argv[2]).read_text(encoding="utf-8"))))
        return 0
    if cmd == "ci":
        event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text(encoding="utf-8"))
        handle(os.environ["GITHUB_REPOSITORY"], event["issue"])
        return 0
    if cmd == "sweep":
        repo = os.environ["GITHUB_REPOSITORY"]
        page, counts = 1, {"flag": 0, "clear": 0, "none": 0}
        while True:
            issues = _api("GET", f"/repos/{repo}/issues?state=open&per_page=100&page={page}") or []
            for issue in issues:
                counts[handle(repo, issue)] += 1
            if len(issues) < 100:
                break
            page += 1
        print(json.dumps(counts))
        return 0
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
