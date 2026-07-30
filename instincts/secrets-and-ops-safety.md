**Confidence**: 0.92
**Source**: 3 production incidents involving credentials in shell commands + 10+ hooks observed
**source_entry_ids**: []
**Created**: 2026-03-03
**Last validated**: 2026-03-23
**failure_mode**: security

When handling secrets (passwords, bcrypt hashes, API keys, strings with $, !, backticks):
1. NEVER store in shell variables; use temp files (mktemp)
2. NEVER interpolate in double-quoted strings or heredocs
3. Build SQL/commands via Python/Node reading from files
4. Bcrypt hashes ($2a$10$...) expand $ as shell variable references

When deploying scripts that modify DB state or credentials:
5. Use flock for concurrency guard
6. VERIFY after every credential swap; FAIL hard (exit 1) on mismatch
7. Preserve recovery files on failure (don't let trap cleanup delete them)
8. Use --env-file for docker secrets, never -e flags (visible in ps aux)
9. Use cut -d= -f2- (not -f2) for env vars; passwords may contain =
10. Run ShellCheck before deploying: shellcheck -e SC2086 script.sh

When writing state/JSON files from hooks or scripts:
11. Atomic writes: writeFileSync(tmpFile, data) then renameSync(tmpFile, dest)
