**Confidence**: 0.90
**Source**: fleet-command full (3/5 factions: Federation, Klingon, Borg)
**source_entry_ids**: []
**Created**: 2026-03-07
**Last validated**: 2026-03-07
**Origin**: nagisanzenin/claude-code-production-grade-plugin (Receipt Protocol)
**failure_mode**: accountability

When completing work as a subagent, include a structured receipt
at the end of your output confirming what was actually done.
Do not return prose-only summaries — provide explicit accounting.

Receipt fields (include at end of your output):
- **status**: completed | partial | failed
- **artifacts_created**: list of files created or modified
- **issues_found**: count and brief description (0 if none)
- **confidence**: 0.0-1.0 self-assessed quality rating

If your work is incomplete, set status to partial and list what
remains. A missing or incomplete receipt signals unverified work
to the orchestrator. Be explicit about what you did and did not do.
