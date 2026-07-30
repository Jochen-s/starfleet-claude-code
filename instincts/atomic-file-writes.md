**Confidence**: 0.80
**Source**: evolve-yourself (10+ hooks observed across 5 sessions)
**failure_mode**: system-integrity
**Created**: 2026-02-27
**Last validated**: 2026-02-27

When writing JSON or state files from hooks, use atomic writes:
write to a temp file first, then rename to final path.
This prevents corrupt reads if the process is interrupted mid-write.
Pattern: writeFileSync(tmpFile, data) then renameSync(tmpFile, dest).
