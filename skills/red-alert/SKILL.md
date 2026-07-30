---
name: red-alert
description: "Multi-phase security health check for applications. Runs static analysis, infrastructure hardening, and live probing with fleet-powered adversarial review. Use for security assessments of own apps or client projects."
tags: [security, audit, fleet, pentest, health-check]
---

# Red Alert -- Security Health Check

Orchestrates a multi-phase security scan of application codebases. Integrates fleet skills for adversarial review, emits structured findings with severity scores, and stores fingerprints in mem0 for regression tracking across sessions.

Designed for Python/FastAPI/Docker projects first. Also covers Node, Go, and Rust projects. The `--client` profile generates client-ready DOCX output.

---

## Arguments

```
/red-alert [target-path]   Target directory (defaults to cwd)
  --phase A|B|C|all        Run a single phase only
  --live-url URL           Enable Phase C live probing against URL
  --quick                  Phase A only, no fleet review, terminal output only
  --full                   All phases; enables Phase C when --live-url also provided
  --deep                   --full + Shannon delegation + Codex double-check
  --client                 --full + Romulan Intel + DOCX output
```

`target-path` defaults to the current working directory if omitted.

---

## Quality Profiles

| Profile | Phases | Fleet Review | Codex | Output |
|---------|--------|-------------|-------|--------|
| `--quick` | A only | None | No | Terminal only |
| (default) | A+B | Klingon + Holodeck | Yes | Terminal + report + tasks + mem0 |
| `--full` | A+B+C | Full fleet | Yes | Terminal + report + tasks + mem0 |
| `--deep` | A+B+C+Shannon | Full fleet + Codex double-check | Yes | Full suite |
| `--client` | A+B+C | Full fleet + Romulan | Yes | Full suite + DOCX |

---

## Full Workflow

### Conditional Execution Summary

```
--quick:       Step 0 -> 1 -> 4 -> 6A
(default):     Step 0 -> 1 -> 2 -> 4 -> 5(A-D) -> 6(A-D) -> 7 -> 8
--full:        Step 0 -> 1 -> 2 -> 3 -> 4 -> 5(A-D) -> 6(A-D) -> 7 -> 8
--deep:        --full + Shannon delegation after Step 3 + double Codex
--client:      --full + 5E + 6E
--phase X:     Step 0 -> {phase X only} -> 4 -> 6A (single-phase diagnostic)
```

---

### Step 0: Initialization

Parse arguments and detect project type by checking for these marker files:

```
package.json          -> Node/JS
pyproject.toml        -> Python (modern)
requirements.txt      -> Python (legacy)
Cargo.toml            -> Rust
go.mod                -> Go
Dockerfile            -> Docker
docker-compose*.yml   -> Docker Compose
.env*                 -> Env config present
```

Multiple markers are expected. Record all that apply.

**Tool availability check**: Verify required tools exist before proceeding:
```bash
command -v git >/dev/null  # required for A3, A6
command -v npm >/dev/null  # if Node project detected
command -v uv >/dev/null   # if Python-uv project detected
command -v curl >/dev/null # required for Phase C
command -v openssl >/dev/null  # required for C2
```
For each missing tool, emit `TOOL_MISSING: {tool} -- {check} skipped` and continue.
On Windows/MINGW64, `openssl s_client` may behave differently; fall back to
`curl --tlsv1.2` for TLS version probing if openssl is unavailable.

Read the current effort profile from `~/.claude/cache/current-effort-profile.json`
(fallback: `{"level":"standard"}`).
If effort level is `quick` and no explicit `--quick` flag was passed, warn the user
and automatically run in `--quick` mode. If effort level is `thorough`, escalate to
`--full` behavior unless `--quick` was explicitly passed.

**Derive project UUID** from git remote URL (if available) or the canonical absolute
target-path. Use this UUID in all mem0 queries and fingerprint storage to prevent
cross-project contamination.

Search mem0 for previous scan fingerprints:
  `mcp__mem0__search_memories("red-alert scan {project-uuid}")`
  Filter results by exact `target` metadata match. If no exact match, check for
  `{target-path}/.red-alert/fingerprints.json` as local fallback. If neither exists,
  skip regression analysis entirely rather than risk cross-project contamination.

**Gitignore protection** (before creating any files): If `{target-path}/.gitignore` exists
and does not already contain `.red-alert/`, append it. This prevents accidental commits of
scan reports and fingerprints. If no `.gitignore` exists, skip (do not create one).

Create report directory: `{target-path}/.red-alert/reports/`

---

### Step 1: Phase A -- Static Analysis

Run all 7 checks. Each confirmed issue is recorded as a finding with this structure:

```
FINDING_ID:    RA-A{N}  (e.g. RA-A1, RA-A2)
PHASE:         A
CHECK:         {check name}
SEVERITY:      Critical | High | Medium | Low | Info
FINDING:       One-line description of the issue
LOCATION:      file:line  OR  git-commit  OR  dependency@version
REMEDIATION:   Concrete fix instruction
FINGERPRINT:   SHA256 of "{CHECK}:{FILE_PATH}:{content_hash}"
               content_hash = SHA256(lines[max(0,N-1):N+2].strip().join("\n"))
               where N is the finding line (0-indexed). Window: 1 line before,
               finding line, 1 line after. Strip leading/trailing whitespace per line
               before hashing. This makes fingerprints resilient to line-number shifts
               while remaining stable across whitespace-only reformats.
```

**A1: Dependency CVE Scan** (Main Agent -- Bash)

Run the appropriate audit tool based on project type:
- Python with uv:   `uvx pip-audit` (runs pip-audit via uv tool runner)
- Python legacy:    `pip-audit -r requirements.txt`
- Node:             `npm audit --json`

Each CVE with CVSS >= 7.0 = High. CVSS >= 9.0 = Critical. Below 7.0 = Medium or Low per CVSS.

**A2: Secrets in Code** (Main Agent -- Grep)

Use regex patterns from `patterns/secrets.txt`. Exclude directories:
`node_modules`, `.git`, `__pycache__`, `venv`, `.venv`, `dist`, `build`
Also exclude lock files (`uv.lock`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`)
which contain base64 hashes that trigger JWT and hex secret patterns.

Verify each match is not in a test file, mock, or example before confirming.
Path fragments containing `test`, `mock`, `example`, `fixture`, `spec`, or `sample` -> Low (review), not Critical.
Confirmed secret in non-test code = Critical.

**A3: Secrets in Git History** (Main Agent -- Bash)

Two-pass approach:
1. **File-type scan**: `git log --diff-filter=AM -n 50 --name-only -- '*.env' '*.key' '*.pem' '*.p12' '*.pfx' '*.jks'`
   Covers both Added and Modified events. Any match = High (credential file was committed).
2. **Content scan**: `git log -p -n 50 | head -5000`
   Apply patterns from `patterns/secrets.txt` to diff output.

Confirmed committed credential = High.
Secret already rotated (noted in commit message) = Medium.

**A4: OWASP Code Patterns** (Subagent -- sonnet-worker)

Assign all non-test source files. Check for:
- SQL/command injection: string concatenation into queries or shell commands
- XSS: unescaped output in templates
- Unsafe deserialization: yaml.load() without Loader, unsafe object loading,
  dynamic code evaluation on user-controlled input
- Broken access control: direct object references without ownership checks
- Security misconfig: debug mode enabled, default credentials, verbose errors
- Crypto failures: MD5/SHA1 for passwords, ECB mode, hardcoded IV/salt

FINDING_ID prefix: RA-A4.

**A5: Hardcoded URLs/IPs** (Main Agent -- Grep)

Grep source files for private/internal network references using word-bounded patterns:
- `localhost` or `127\.0\.0\.1`
- `\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b` (Class A private)
- `\b192\.168\.\d{1,3}\.\d{1,3}\b` (Class C private)
- `\b172\.(1[6-9]|2[0-9]|3[01])\.\d{1,3}\.\d{1,3}\b` (Class B private)
- Staging/dev domain fragments (e.g. `staging.`, `dev.`, `-dev.`)
- `.local` TLD references

Exclude test files, config files, and documentation.
Private IPs in source = Medium. Staging URLs in source = Low.

**A6: Lock File Integrity** (Main Agent -- Bash)

Check for manifest without corresponding lock file:
- Python:        `pyproject.toml` present but neither `uv.lock` nor `poetry.lock` = Medium
- Python legacy: `requirements.txt` present but no lock equivalent = Medium
- Node:          `package.json` present but no `package-lock.json` / `yarn.lock` / `pnpm-lock.yaml` = Medium

**A7: Permission/Auth Patterns** (Subagent -- sonnet-worker)

DISJOINT file set from A4: route files and middleware only.
Match files named: `route`, `router`, `middleware`, `auth`, `permission`.
Check for:
- Route handlers without authentication decorators or middleware
- Missing authorization checks (authn without authz)
- Admin endpoints accessible without role check
- CSRF protection absent on state-changing endpoints
- JWT validation: algorithm confusion, missing expiry check, alg:none acceptance

FINDING_ID prefix: RA-A7.

---

### Step 2: Phase B -- Infrastructure Hardening

Skip entirely if `--quick`. Applies to projects with Dockerfile or docker-compose files.

**B1: Docker Security** (Main Agent -- Read + analysis)

Parse all Dockerfiles and docker-compose files.

| Check                               | Severity if absent or misconfigured |
|-------------------------------------|-------------------------------------|
| Non-root USER directive             | High                                |
| Resource limits (mem_limit, cpus)   | Medium                              |
| Read-only root filesystem           | Low                                 |
| No `privileged: true` or `cap_add: SYS_ADMIN` | Critical                   |
| No `security_opt: seccomp:unconfined` | High                              |
| `no-new-privileges: true`           | Medium                              |
| Pinned image tags (not `latest`)    | Medium                              |
| COPY not ADD with URL               | Medium                              |
| HEALTHCHECK defined                 | Low                                 |
| `cap_drop: ALL` present             | Medium                              |

**B2: Env File Exposure** (Main Agent -- Bash + Read)

- Check `.env` is listed in `.gitignore` -- absent = High
- Check `.env.example` for real secret values (not placeholders like `<your-key>`) -- real value = High
- Check if `.env` is tracked by git history -- tracked = Critical

**B3: Port Exposure** (Main Agent -- Read)

Scan docker-compose files for all-interface bindings on:
- DB ports (5432, 3306, 27017, 6379, 9200) = High
- Admin UIs (8080, 9000, 15672) exposed to all interfaces = Medium

**B4: Volume Mount Security** (Main Agent -- Grep)

Scan docker-compose files for:
- `/var/run/docker.sock` mount = Critical
- `/root` or user home directory mounts = High

**B5: TLS/SSL Configuration** (Main Agent -- Read)

Read nginx, caddy, traefik config files. Check:
- HTTPS redirect configured for HTTP traffic -- absent = High
- `ssl_protocols` excludes TLS 1.0 and TLS 1.1 -- included = High
- HSTS header configured in reverse proxy -- absent = Medium
- No self-signed cert referenced in non-dev config -- present = Medium

**B6: Network Isolation** (Main Agent -- Read)

Scan docker-compose for services sharing default bridge network with DB containers.
DB container on same network as public-facing service without explicit segmentation = High.

**B7: Backup/Secrets Management** (Main Agent -- Grep)

Search deploy scripts and CI configs for plaintext credential assignments.
Plaintext credential in deploy script = High.
No secrets manager when cloud provider is available = Medium (Info if greenfield).

---

### Step 3: Phase C -- Live Probing

Skip if no `--live-url` provided or if `--quick`. All checks use the `--live-url` value.

**Authorization gate** (mandatory before any Phase C probing):
Display to the user: "Phase C will send active HTTP probes to {live-url}, including
20 rapid requests for rate-limit testing. Confirm you own or have written authorization
to test this target."
Wait for explicit user confirmation before proceeding. If denied, skip Phase C entirely
and note `PHASE_C_SKIPPED: authorization not confirmed` in the report.

**C1: Security Headers** (Main Agent -- Bash)

Fetch headers with `curl -sI {live-url}`. Check:

| Header                                             | Missing severity |
|----------------------------------------------------|-----------------|
| `X-Frame-Options` or CSP `frame-ancestors`         | Medium          |
| `Content-Security-Policy`                          | Medium          |
| `X-Content-Type-Options: nosniff`                  | Low             |
| `Strict-Transport-Security`                        | High            |
| `Referrer-Policy`                                  | Low             |
| `Permissions-Policy`                               | Low             |
| `X-Powered-By` or `Server` leaking version (present = bad) | Low    |

**C2: SSL/TLS Quality** (Main Agent -- Bash)

Use `openssl s_client` to test protocol support.
Expired cert = Critical. TLS 1.0 accepted = High. TLS 1.1 accepted = High. No SNI = Medium.

**C3: CORS** (Main Agent -- Bash)

Send request with `Origin: https://evil.example.com` header.
`Access-Control-Allow-Origin: *` on credentialed endpoint = High.
Origin reflection (response echoes request Origin) = Critical.

**C4: Auth Flow** (Main Agent -- Bash)

Send unauthenticated requests to known protected endpoints (inferred from A7 findings).
200 response without auth on protected endpoint = Critical.

**C5: Rate Limiting** (Main Agent -- Bash)

Send 20 rapid identical requests to login or API endpoint. No 429 response = Medium.

**C6: Error Disclosure** (Main Agent -- Bash)

Send requests to non-existent endpoints and with malformed input.
Response body containing stack trace, absolute file path, internal hostname, or library version = Medium.

**C7: Cookie Security** (Main Agent -- Bash)

Inspect `Set-Cookie` headers.
Missing `HttpOnly` on session cookie = High. Missing `Secure` flag on HTTPS site = High. Missing `SameSite` = Medium.

**C8: Open Redirects** (Main Agent -- Bash)

Test common redirect parameters (`next`, `url`, `redirect`, `return`) with an external URL value.
3xx redirect to external domain = High.

---

### Step 4: Posture Scoring

**Timing**: In non-quick modes, scoring runs TWICE:
1. **Preliminary** (here, Step 4): raw Phase A/B/C findings only. Used for escalation triggers in Step 7.
2. **Final** (after Step 5F): fleet-adjusted findings. This is the score that appears in the report.

In `--quick` mode, scoring runs once (no fleet review).

Aggregate all confirmed findings:

```
Per-tier logarithmic deductions:
  C = critical_count, H = high_count, M = medium_count, L = low_count
  base = 10 - (log2(1+C) * 2.5) - (log2(1+H) * 1.2) - (log2(1+M) * 0.4) - (log2(1+L) * 0.1)
  score = max(0, base)

Severity caps (applied after formula):
  If C > 0: score = min(score, 4.9)   -- any Critical caps at Poor
  If H > 0: score = min(score, 6.9)   -- any High caps at Needs Improvement
```

Reference distributions:
- 2C 5H 8M 4L -> 1.4 (Critical) | fix criticals -> 5.4 (Needs improvement)
- 1C 0H 0M 0L -> 4.9 (Poor, capped) | 0C 1H 0M 0L -> 6.9 (capped)
- 0C 0H 2M 1L -> 9.3 (Excellent)  | clean project -> 10.0

Score scale:
- 9.0 - 10.0: Excellent
- 7.0 - 8.9:  Good
- 5.0 - 6.9:  Needs improvement
- 3.0 - 4.9:  Poor
- 0.0 - 2.9:  Critical

---

### Step 5: Fleet QA Review

Skip entirely if `--quick`.

**5A: Holodeck Security Expert**

Invoke `/holodeck` with persona: senior application security engineer.
Provide all findings from Steps 1-3.
For each finding, request: exploitability assessment, false positive identification, severity accuracy.
Expected output per finding: `CONFIRM` / `DOWNGRADE {new-severity}` / `FALSE_POSITIVE {reason}`

**5B: Klingon Review**

Invoke `/klingon-review` on the full finding set plus codebase context.
Request: attack vectors not covered, chained exploit scenarios
(e.g. SSRF chained with IMDS for credentials), supply chain vectors.
Klingon additions tagged as ADDED findings with source KLINGON.
Validate response per fleet validation rules (see 5F) before proceeding.

**5C: Opponents View**

Invoke `/opponents-view` on the proposed remediation steps.
Request: fix correctness verification, regression risks, blast radius,
simpler alternatives where the proposed fix is over-engineered.

**5D: Codex Cross-Model Verification**

Invoke `/codex` with the codebase context but NOT the existing findings list (independent review).
Compare results:
- Finding confirmed by both models: confidence = HIGH
- Finding from Claude only:         confidence = MEDIUM (retain)
- Finding from Codex only:          confidence = ADDED (zero-negative -- never drop Codex-only findings)

**5E: Romulan Intel** (--client only)

Invoke `/romulan-intel` with the final finding set.
Request: business impact framing, compliance mapping
(SOC 2 CC6/CC7, HIPAA Security Rule, GDPR Art. 32),
prioritization rationale for executive audience.

**5F: Fleet Synthesis**

Compute per-finding consensus confidence (0-100%). Mark disputed findings explicitly.

Conflict resolution matrix:
- Holodeck `FALSE_POSITIVE` + Klingon `CONFIRM`: retain at MEDIUM confidence,
  move to Appendix. If Klingon provides exploit chain justification, retain at HIGH.
- Holodeck `DOWNGRADE` + Codex `CONFIRM` at original severity: retain original severity
  at MEDIUM confidence, note disagreement.
- Unanimous `FALSE_POSITIVE` from both Holodeck and Codex: drop finding.
  Single-faction `FALSE_POSITIVE` only: retain at MEDIUM confidence.
- Codex-only finding (not in Claude scan): add as ADDED at MEDIUM confidence (zero-negative).

Routing:
- HIGH confidence findings -> Executive Summary
- MEDIUM confidence findings -> Appendix with full details
- Disputed findings -> Appendix with each faction's position noted

**Fleet response validation**: After each fleet skill call (5A-5E), validate the response:
- Every finding reference must map to an existing FINDING_ID (RA-A{N}, RA-B{N}, etc.)
- ADDED findings from Klingon must use the next available ID in the RA-K{N} series
- Reject severity changes that skip more than one level (e.g. LOW->CRITICAL without justification)
- If a fleet response contains no actionable output, log `FLEET_SKIP: {faction} returned no findings` and continue

---

### Step 6: Output Pipeline

**6A: Terminal Output** (always)

```
============================================================
  RED ALERT -- Security Health Check
  Target: {project-name} | {YYYY-MM-DD}
  {if --quick: "[QUICK SCAN -- Phase A only. Infra/live checks skipped. Score is indicative.]"}
============================================================

  POSTURE SCORE: {score} / 10  (previous: {prev} -- {trend})

  Phase A (Static):     {n} CRITICAL  {n} HIGH  {n} MEDIUM  {n} LOW
  Phase B (Infra):      {n} CRITICAL  {n} HIGH  {n} MEDIUM  {n} LOW
  Phase C (Live):       {n} CRITICAL  {n} HIGH  {n} MEDIUM  {n} LOW
  Fleet Review:         +{n} added by Codex, {n} downgraded by Holodeck

  TOP FINDINGS:
  #1 [{SEVERITY}] {RA-Xx}: {finding summary}
  #2 [{SEVERITY}] {RA-Xx}: {finding summary}
  #3 [{SEVERITY}] {RA-Xx}: {finding summary}

  Confidence: {avg}% (cross-model verified)
  Full report: {report-path}
  Tasks created: {task-count} actionable items
============================================================
```

**6B: Markdown Report**

Write to: `{target}/.red-alert/reports/{YYYY-MM-DD-HHmm}-security-audit.md`

Sections in order:
1. Executive Summary (score, trend, critical/high counts, top 3 risks)
2. Phase A Findings (table: ID, severity, check, finding, location)
3. Phase B Findings (same table format)
4. Phase C Findings (same table format, only if `--live-url` was provided)
5. Fleet Review Notes (holodeck confirmations, klingon additions, disputed items)
6. Regression Analysis (persistent vs fixed vs new vs detection-regression)
7. Priority Matrix (2x2: effort vs impact, populated with finding IDs)
8. Appendix (low-confidence findings, full remediation details, false positives list)

**6C: Task Creation**

For each Critical and High finding, create an individual task via TaskCreate:
```
Title: [RED-ALERT] Fix: {one-line finding summary}
Body:  FINDING_ID, LOCATION, REMEDIATION from the finding record
```

Group all Medium findings into one task:
```
Title: [RED-ALERT] Medium findings batch ({n} items)
Body:  List of FINDING_IDs with one-line summary each
```

**6D: mem0 Storage**

```
mcp__mem0__add_memory(
  content: "red-alert scan {project-uuid} {date}: score={score}, critical={n}, high={n}, medium={n}, low={n}, fingerprints=[{list}]",
  metadata: {
    type: "security-scan",
    project_uuid: "{project-uuid}",
    target: "{target-path}",
    date: "{YYYY-MM-DD}",
    score: {float},
    fingerprints: [{fingerprint-list}]
  }
)
```

**mem0 failure fallback**: If mem0 is unreachable (Ollama offline, connection error),
write fingerprints to `{target}/.red-alert/fingerprints.json` as secondary persistence:
```json
{
  "project_uuid": "{project-uuid}",
  "date": "{YYYY-MM-DD}",
  "score": {float},
  "fingerprints": ["{fp1}", "{fp2}", ...],
  "findings_summary": { "critical": N, "high": N, "medium": N, "low": N }
}
```
On subsequent scans, Step 0 checks for this file when mem0 returns no results.
Emit `MEM0_FALLBACK: using local fingerprints.json (mem0 unavailable)` in terminal output.

**6E: DOCX Output** (--client only)

Invoke `/docx` with the markdown report. Specify:
- Professional layout, no internal fleet terminology
- Replace fleet references with "independent peer review" or "adversarial validation"
- Executive summary on page 1, priority matrix on page 2
- Findings tables with corporate styling
- Output path: `{target}/.red-alert/reports/{YYYY-MM-DD-HHmm}-security-audit.docx`

---

### Step 7: Escalation Logic

Apply these rules to non-quick profiles:

- Any CRITICAL finding present: force full fleet review (Steps 5A-5D minimum)
- 3 or more HIGH findings: force Klingon Review (Step 5B minimum)
- Own project detected (git remote URL matches a known project in mem0): force Klingon + Opponents minimum
- `--client` flag: force Romulan Intel (Step 5E)

**`--quick` mode exception**: Escalation does NOT override `--quick`. Instead, if escalation
conditions are met during a `--quick` run, emit a warning in terminal output:
`ESCALATION_RECOMMENDED: {reason} -- re-run without --quick for fleet review`
This preserves CI/pipeline time budgets while surfacing the recommendation.

Document any escalation or escalation recommendation in terminal output.

---

### Step 8: Zero-Negative Regression

Load previous fingerprints from mem0:
  `mcp__mem0__search_memories("red-alert scan {project-uuid}")`
  Filter by exact `project_uuid` metadata match. If no exact match, check for
  `{target-path}/.red-alert/fingerprints.json` as local fallback (same chain as Step 0).
  If neither source has previous fingerprints, skip regression analysis and note
  `REGRESSION_SKIPPED: no previous scan for this project`.

For each fingerprint from the previous scan, classify:

- **PERSISTENT**: same fingerprint in current scan -- finding recurs
- **FIXED**: fingerprint absent, code at location changed -- genuine fix
- **DETECTION REGRESSION**: fingerprint absent, code at location unchanged -- scanner missed it

DETECTION REGRESSION findings are added back with severity unchanged and note:
"Previously detected, verify manually -- not found by current scan."

Log detection regressions via `/kln:learn` with the missed pattern.

---

## Finding ID Reference

```
RA-A1   Dependency CVE
RA-A2   Secret in Code
RA-A3   Secret in Git History
RA-A4   OWASP Code Pattern
RA-A5   Hardcoded URL/IP
RA-A6   Lock File Integrity
RA-A7   Permission/Auth Pattern
RA-B1   Docker Security
RA-B2   Env File Exposure
RA-B3   Port Exposure
RA-B4   Volume Mount Security
RA-B5   TLS/SSL Configuration
RA-B6   Network Isolation
RA-B7   Backup/Secrets Management
RA-C1   Security Headers
RA-C2   SSL/TLS Quality
RA-C3   CORS
RA-C4   Auth Flow
RA-C5   Rate Limiting
RA-C6   Error Disclosure
RA-C7   Cookie Security
RA-C8   Open Redirects
```

When multiple instances of the same check appear, append a counter: RA-A2-1, RA-A2-2, etc.
