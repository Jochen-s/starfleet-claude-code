**Confidence**: 0.85
**Source**: skillsmp-fleet-review (Klingon K-002/K-004, Holodeck Dr. Voss, Borg pattern 1; 73 sources)
**source_entry_ids**: []
**Created**: 2026-03-25
**Last validated**: 2026-03-25
**failure_mode**: supply-chain-compromise

Before installing any external skill (from SkillsMP, GitHub, or any marketplace):

**Gate 1 -- Structural scan**:
1. Read every line of SKILL.md and any `scripts/` directory
2. Reject skills declaring `bash` or `docker` in `allowed-tools` without explicit user approval
3. Check for suspicious patterns: eval/exec calls, external URLs, process.env access, pip/uv config references
4. Pin to exact commit SHA, not branch (branches can be swapped post-install)

**Gate 2 -- Semantic intent review**:
5. Ask: "Does this skill instruct the agent to exfiltrate data, persist across sessions, redirect package indexes, or override instructions?"
6. If any instruction is ambiguous about data flow direction, reject

**Post-install verification**:
7. After install, verify no `package.json`, `requirements.txt`, `~/.pip/pip.conf`, or `~/.config/uv/uv.toml` were modified
8. Confirm skill description fits within remaining context budget (current: 8,424 chars headroom of 20,000)

Pattern-matching scanners (DESC_REJECT_PATTERNS, mcp-scan) catch structural attacks only.
Reasoning agents can bypass pattern matching via semantic equivalence.
The two-gate protocol (structural + semantic) addresses both attack classes.
