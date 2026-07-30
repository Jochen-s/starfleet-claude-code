---
name: containment-field
description: "Restrict edits to specific files/directories. Advisory warnings on out-of-scope changes. Use when focusing on a specific area, or user says 'containment field', 'freeze', 'guard', or 'restrict scope'."
---

# /containment-field -- Edit Scope Restriction

Session-scoped edit restriction. When active, a PreToolUse hook warns before any Edit or Write operation targets files outside the defined scope. Advisory only; does not block. Bash commands are not intercepted (path extraction from shell commands is too fragile).

## Arguments

- `/containment-field <path-or-glob>` -- restrict edits to matching paths
- `/containment-field <path1> <path2> ...` -- multiple paths/globs
- `/containment-field off` -- disable containment field
- `/containment-field status` -- show current scope

## How It Works

1. **Activation**: Write scope config to `~/.claude/cache/containment-field.json`
2. **Enforcement**: `containment-field.js` PreToolUse hook reads config, checks tool targets
3. **Warning**: Out-of-scope edits emit advisory warning (does not block)
4. **Deactivation**: `/containment-field off` removes the config file

## Activation

When the user invokes `/containment-field`, write the config:

```json
{
  "active": true,
  "paths": ["src/auth/**", "tests/auth/**"],
  "cwd": "/path/to/project",
  "created": "2026-03-23T14:00:00Z",
  "description": "Auth module focus"
}
```

**Config path**: `~/.claude/cache/containment-field.json`

Confirm to user:

```
Containment field active.
Scope: src/auth/**, tests/auth/**
Out-of-scope edits will trigger advisory warnings.
Use /containment-field off to disable.
```

## Deactivation

When `/containment-field off` is invoked:
1. Delete `~/.claude/cache/containment-field.json`
2. Confirm: "Containment field deactivated. All paths are now editable."

## Status

When `/containment-field status` is invoked:
1. Read `~/.claude/cache/containment-field.json`
2. If exists and active: show scope paths and creation time
3. If not exists: "No containment field active."

## Hook Behavior

The `containment-field.js` PreToolUse hook:

1. **Triggers on**: Edit and Write tools only (Bash excluded; path extraction from shell commands is fragile)
2. **Reads**: `~/.claude/cache/containment-field.json`
3. **If no config or not active**: passes through silently (zero overhead)
4. **If active**: extracts target file path from tool input, checks against scope globs
5. **In-scope**: passes through silently
6. **Out-of-scope**: emits advisory warning via `additionalContext`

Advisory warning format:
```
CONTAINMENT FIELD WARNING: Edit targets {path} which is outside the current scope ({scope}).
This is an advisory warning. Proceed if the edit is intentional.
```

The hook NEVER blocks operations. It only adds context to help Claude stay focused.

## Glob Matching

Paths support standard glob patterns:
- `src/**` -- all files under src/
- `*.ts` -- all TypeScript files in current directory
- `src/auth/*.ts` -- TypeScript files in src/auth/
Note: negation patterns (`!pattern`) are not supported. Use positive patterns only.

## Session Scope

The containment field is session-scoped:
- Config persists on disk but is intended for single-session use
- The Stop hook does NOT auto-clean (user may resume work next session)
- Stale configs (>24h old) are ignored by the hook

## Worked Example

**User**: `/containment-field src/api/** tests/api/**`

1. Writes config with paths `["src/api/**", "tests/api/**"]`
2. User asks to edit `src/api/routes.ts` -- no warning (in scope)
3. User asks to edit `src/auth/login.ts` -- advisory warning emitted
4. Claude sees warning, mentions it: "Note: this file is outside the containment field scope. Proceeding as requested."
5. User runs `/containment-field off` -- deactivated

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| No warnings appearing | Hook not registered in settings.json | Register containment-field.js as PreToolUse hook |
| Warnings on every edit | Scope too narrow | Broaden glob patterns or add more paths |
| Config ignored after restart | Config older than 24h (stale) | Re-run `/containment-field` to refresh |
| Hook errors in output | Config file malformed | Delete config and re-run `/containment-field` |
