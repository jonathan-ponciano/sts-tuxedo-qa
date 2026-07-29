---
name: tuxedo-qa
description: Use this skill whenever a tuxedo-qa MCP server is connected (tools like inspect_page, create_test, run_tests, run_until_pass, request_credential, start_pair_debug are available) and the user wants to create, run, fix, or monitor E2E tests. Covers the right tool order, when to reuse vs re-fetch state, and the credential/pair-debug rules that keep secrets out of the conversation.
---

# tuxedo-qa MCP

tuxedo-qa exposes 18 MCP tools for the full lifecycle of a Playwright-based
synthetic test: discovery, creation, execution, auto-fix, credentials and
notifications. This skill encodes the orchestration rules that aren't visible
from any single tool's schema — the order that avoids wasted round-trips, and
the rules that keep credential values out of the chat transcript.

## Session start

Call `list_tests` once at the start of a session that will touch existing
tests, and hold the result in context instead of re-listing after every
mutation. `update_test` returns the full updated test record — use that
instead of a follow-up `read_test`/`list_tests` call. `create_test` only
returns `{testId, validated, dryRun}` (no script/tags echoed back) and
`delete_test` only confirms `{deleted: true}` — neither gives you enough to
update your mental model from, so don't expect to skip a re-fetch after
those two.

## Creating a new test

1. `inspect_page` first, always — even if the user described the flow in
   detail. It returns real selectors and a screenshot; guessing selectors
   from a prose description produces specs that fail on the first run and
   costs an extra fix cycle.
2. If the flow needs a login or any secret value, resolve credentials
   *before* writing the script (see Credentials below) so the generated
   script references a credential name that already exists.
3. `create_test` dry-runs the script automatically — the response's
   `dryRun.ok` tells you if it's syntactically/structurally sound.
   `validated` is `false` until a real scheduled or manual run passes; don't
   tell the user the test is "working" until you've also seen a passing
   `run_tests` or `run_until_pass` result.
4. `run_until_pass` (with `maxAttempts`, default 3) retries the *same*
   script up to that many times and stops at the first pass — it does not
   diagnose or modify anything between attempts. Reach for it on flaky/
   transient failures (slow page load, a race in the app under test), not as
   a substitute for the `get_status` → `update_test` diagnose-and-patch loop
   below, which is still what fixes a genuinely broken test.

## Fixing a failing test

Call `get_status` with the `testId` first — it returns `diagnosis` and
`suggestion` directly, which is normally enough to write the `update_test`
patch without re-reading the full script via `read_test`. Only call
`read_test` if the suggestion references parts of the script the diagnosis
didn't quote. After patching, re-run with `run_tests` (single test, via
`testId`) rather than the whole suite, unless the change could plausibly
affect shared fixtures/setup.

## Credentials — never paste values yourself

- If the human hasn't already put a secret in the conversation, use
  `request_credential`. It creates a `pending` entry the human fills in the
  dashboard; the value is never returned to the MCP client. Do not ask the
  user to paste the secret into chat as a workaround.
- Only use `create_credential` when the user has *already* pasted a value
  into the conversation of their own accord — it exists to persist what's
  already there, not to invite more secrets into the transcript.
- Check `list_credentials` before requesting a new one; credential names are
  reused across tests in the same project.

## Pair-debug flow

`start_pair_debug` → human drives the browser via the returned
`vncWsPath` → `stop_pair_debug` returns a ready-to-use `draftTestSource`.
Feed that string straight into `create_test`'s `script` field instead of
rewriting it from scratch; it's already derived from real recorded actions.
Only call `get_pair_debug_context` mid-session if you need to narrate
progress back to the user or the session is running long — it's not a
required step between start and stop.

## Suite-wide operations

- Use `pause_tests` before a deploy the user has flagged, not `delete_test`
  or `update_test` with `schedule: null` — pausing is time-bounded (max 60
  minutes) and self-reverting, so there's nothing to remember to undo.
- Set `set_webhook` once per project, early — after that, run results notify
  without the human needing to ask `get_status` each time.
- `delete_test` is irreversible and drops run history; if the goal is "stop
  running this for now," use `update_test` with `schedule: null` instead.

## Using this outside Claude Code (e.g. Gemini CLI)

This file is a Claude Code Skill — Gemini CLI has no equivalent loader, so
the `---` frontmatter above won't do anything there. The rules themselves
aren't Claude-specific, though: they hold for any MCP client talking to
tuxedo-qa. To get the same effect in Gemini CLI, drop everything from
`# tuxedo-qa MCP` down (skip the frontmatter block) into a `GEMINI.md`
context file, which Gemini CLI loads automatically every session:

```
// project-scoped — only applies inside this repo
cat skills/tuxedo-qa/SKILL.md | tail -n +5 >> GEMINI.md

// or global — applies to every project connected to a tuxedo-qa server
cat skills/tuxedo-qa/SKILL.md | tail -n +5 >> ~/.gemini/GEMINI.md
```

Verify it loaded with `/memory show` inside the Gemini CLI session before
relying on it.
