---
name: test-hooks
description: "Hook health check and test runner — verify hooks work, hook performance, diagnose hook failures. Trigger: hook health check, verify hooks, test hooks, hook performance."
---

# /test-hooks — Hook Health Check and Test Runner

Run all registered hooks with synthetic payloads to verify they work correctly.

## Arguments

- `/test-hooks` — Run all hooks
- `/test-hooks --event <EventName>` — Test only hooks for a specific event (e.g., Stop, SessionStart)
- `/test-hooks --hook <filename>` — Test a specific hook by filename
- `/test-hooks --verbose` — Show stdout/stderr from each hook

## Workflow

1. Run the test runner:
```bash
node ~/.claude/scripts/test-hooks.js [args]
```

2. Review the output. For each hook, the runner reports:
   - `[OK]` PASS with timing in ms
   - `[!!]` FAIL with error message

3. For any failures:
   - Read the failing hook file
   - Check if the command path exists: `ls -la <path>`
   - Check if dependencies are available (e.g., `which python3`, `which node`)
   - Common fixes: missing file, wrong path separator, missing module

4. Report summary to user:
   - Total: N passed, N failed
   - By event: breakdown per event type
   - Slow hooks: any taking >1s

## Notes

- Hooks receive synthetic payloads, not real session data
- Exit code 2 with stderr is valid (hook intentionally blocking) — counted as PASS
- Timeout: 5s per hook (hooks should complete in <200ms normally)
- K-LEAN hooks (`kln-hook-*`) require K-LEAN to be installed
- The test runner is at `~/.claude/scripts/test-hooks.js`
