# Changelog

All notable changes to this project are documented here.

> "What we leave behind is not as important as how we've lived."
> -- Captain Picard

---

## [v8.4] - 2026-07-22

### Captain's Log: the harness learns to guard itself (2026-07 repo assimilation + live promotions)

We read eight external agent repositories under a hard boundary: untrusted, read-only, no execution, no installs, every byte treated as data and never as instruction. Two of them are CN-origin (claude-code-router, zvec) and were held to patterns-only. The verdict, after 8 dossiers -> 8 adversarial verifiers -> Codex gpt-5.5 cross-model consensus, was quiet: nothing here warrants replacing a component we already run. Our fleet review is deeper than their 3-agent pipelines, our SKILL.md format is identical, a self-hosted LiteLLM beats a CN router under the EU/private constraint. The value was two net-new capabilities the operator asked for (a codebase knowledge-graph and a hardened EU/private router, both built from patterns not adopted infra) and a handful of small, high-ROI lifts. Two of those lifts have now gone live.

The larger story is what the setup became. It stopped guarding only its secrets and started guarding its own integrity and its rendering surface.

#### Changed -- Control-plane integrity (config-protection, LIVE)

`protect-secrets.js` used to guard DATA: env files, credentials, the attestation trust chain, settings.json. But the harness's own EXECUTABLE surface -- `hooks/`, `rules/`, `CLAUDE.md`, the instinct allowlist -- was writable by any agent tool. A prompt-injection escalation path: untrusted content steers an agent into weakening a hook or editing a rule to pass a gate.

Recon superseded the original plan (install a new config-protection hook subtree, lifted from ECC). The live `protect-secrets.js` already carried a MORE hardened write-block than the candidate. So we EXTENDED it with a harness-config layer instead of adding a parallel hook (reduce, not add): anchored canonical containment (anchored at `~/.claude` so an unrelated project's `hooks/` still writes freely -- zero friction, proven live), plus an nlink>=2 hardlink-identity backstop for the one alias a realpath cannot collapse. `CONFIG_PROTECTION_OFF` relaxes only the new layer; the secret and attestation layers stay override-less. No new hook meant no settings.json edit meant no session restart. The trust boundary moved from confidentiality (keep secrets in) to control-plane integrity (the agent cannot silently disable the guardrails it runs under). Live smoke 11/11. Committed `5f877e6`.

#### Changed -- Injection defense reaches the rendering layer (terminal-sanitize, LIVE)

Four hooks render untrusted metadata into model-visible context and the operator's terminal -- skill descriptions, project instinct text, annotation content, KB entries, file paths -- with no neutralization of terminal escape sequences (CWE-150) or Unicode visual-spoofing controls (CWE-451). The pre-existing filters caught injection prose and zero-width chars, not ANSI/OSC hijacks or BiDi spoofing. We wired the hardened sanitizer (`shared/terminal-sanitize`, ported from vercel skills' sanitize.ts battery) into every untrusted-to-sink point across skills-index-builder, instinct-injector, annotation-injector, and kb-content-scanner. Correct function per sink (single-line metadata vs multi-line content), guarded loading (a missing sanitizer fails safe to `{}` + exit 0, never to unsanitized injection), and a regression net where each wrap is RED-confirmed load-bearing. Committed `a71b226` (hooks) + `e3b18545` (audit trail).

These two controls now compose. The config-protection layer guards the very `hooks/` directory that terminal-sanitize wired into, so the live wiring itself had to travel the out-of-band path. The harness now defends its own promotion pipeline.

#### The method matured, not only the code

- **Reduce-not-add held under pressure.** The stronger mechanism already existed; we extended it. No new hook, no new attack surface, no restart.
- **A probe settled the alias question, not an assumption.** A win32 run proved realpath collapses junction/ADS/case; only a hardlink bypasses. The sharpest review catch was that the original alias test SKIPPED on non-admin Windows (vacuous green), now replaced with admin-free tests that actually run.
- **The cross-model gate earned its keep, again.** Three same-model (opus) reviewers cannot catch same-model blind spots. Codex surfaced the name-field/shared-block coverage gap the opus fleet only gestured at -- the same lesson D2 taught when the all-opus fleet would have shipped a textual bypass.
- **Implementer was never the sole verifier.** Every suite was re-run independently; the live override-leak invariant was pinned on the deployed hook (11/11), because a fixture binding to a different `__dirname` could not reach it.
- **Station-2 discipline stayed reversible.** Exclusive-create backups, `node --check` with auto-rollback, out-of-band writes, no-restart property. And when the auto-mode safety classifier gated the live estate writes, the correct move was to hand them to the operator to run via `!`, not to work around the gate.

Maturity delta in one line: the harness moved from guarding its secrets to guarding its own integrity and its rendering surface, verified by a cross-model gate that measurably caught what a single-model gate would have missed.

#### Deferred (documented, not shipped)

- **Sanitizer tag-block strip** (Codex F2): stripping U+E0000-E007F would break legitimate subdivision-flag emoji (England/Scotland/Wales). A shared-component follow-up at most (soft-hyphen only, never the tag range).
- **EU/private LiteLLM router build** (deliverable 3c): design done; build is operator-gated on infra + credential decisions.
- **Codebase KG persistence** (deliverable 3b): traversal spike built and numeric-gated (`e282894f`); the AST extractor + storage layer stay operator-gated.

#### Provenance

Full evaluation and per-repo "what we took" master list: `research/2026-07-repo-assimilation/` (PHASE1/2/3-SYNTHESIS, ASSIMILATION-MASTER.md, DEPENDENCY-GRAPHS.md, DOMINO-PROGRESS.md). Security boundary held across all eight repos: no code executed, no installs, injection attempts flagged as data rather than obeyed.

---

## [v8.3] - 2026-07-15

### Captain's Log: HANDOFF pollution fix (portfolio plan W0-4)

The Stop hook's `resolveHandoffTarget()` defaulted to creating `HANDOFF.md` when none existed, seeding auto-dumps as the de-facto handoff in at least 14 project roots portfolio-wide, sometimes describing a different project (global cache files shared across concurrent sessions). Two changes:

- **Mirror reconciled first**: this repo carried an 836-line copy of `hooks/captain-log.js` from April while the installed hook had grown to 922 lines (isSafeProjectRoot, cwd-preference, vault digest). The mirror was reconciled to the installed version BEFORE editing, so the fix could not regress the live hook (the version-drift trap the portfolio review caught).
- **Target inversion**: the hook now always writes `{projectRoot}/HANDOFF-auto.md` and never creates or touches `HANDOFF.md`, which is reserved for curated manual handoffs. `isAutoGeneratedHandoff()` and its two marker constants became dead and were removed; the footer marker stays (external tooling classifies legacy dumps by it). Tested: empty dir gets only HANDOFF-auto.md; an existing curated HANDOFF.md stays byte-untouched.

Companion cleanup: 15 legacy auto-dump `HANDOFF.md` files rename to `HANDOFF-auto-archive.md` via an operator-approved manifest (`C:/LocalAgent/.planning/portfolio-uplift-2026-07/W0-4-RENAME-MANIFEST.md`).

---

## [v8.2] - 2026-06-29

### MCASP Assimilation: Gap Taxonomy, Momentum Ratchet, Equal-Score Principle

Someone built a 3,228-line system prompt for "the most capable agent." Zero code. Pure specification. 741 stars on GitHub (`fainir/most-capable-agent-system-prompt`). We ran it through the full analysis pipeline (3-band research at 0.89 avg, 5-faction fleet review, cross-model verification at 0.78) and cherry-picked what our setup was actually missing.

Three things shipped. Five got deferred with design docs. Three systemic insights changed how we think about the setup.

#### Changed -- Hook Libs (1 updated, 1 new)

- **failure-pattern-aggregator.js** -- `classifyEntry()` extended from 5 to 13 failure types. Eight new Tier 2 (strategic) classifications: context-overload, external-dependency, bad-decomposition, missing-skill, missing-memory, missing-eval, bad-requirements, unsafe-autonomy. Tier ordering: operational (Tier 1) always beats strategic (Tier 2). Codex cross-model review caught missing EACCES/EPERM/429/502/504 codes, added same session. `classifyEntry` now exported for direct testing. 39 tests at `tests/test-gap-classification.js`.
- **momentum-ratchet.js** (NEW) -- Session-end artifact detector. Counts skills, instincts, hooks, tests, and K-LEAN entries created during a session. Observational only: "This session produced 3 reusable artifact(s): 1 hook, 1 test, 1 K-LEAN update." No imperative nudges (fleet review killed the original "Consider creating..." phrasing). Windows and Unix paths supported. Failed writes excluded. 13 tests at `tests/test-momentum-ratchet.js`.

#### Changed -- Hooks (1 updated)

- **done-criteria-check.js** -- Integrated momentum ratchet. After the existing completion reminder, appends the artifact inventory message. Fail-open: if momentum-ratchet.js is missing or throws, the hook works exactly as before.

#### Changed -- CLAUDE.md (1 new principle)

- **Equal-score simplification**: "When a change scores equally on evals or review, prefer the simpler system. Complexity needs justification." Complement to "replace or reduce, never add."

#### Added -- Design Docs (5 deferred patterns)

All at `docs/superpowers/designs/2026-06-29-*.md` in LocalAgent. Each includes problem statement, proposed solution, constraints, interaction analysis, test specs, and time estimate.

- Anti-stall intermediate artifacts (extend execution-ratio-monitor, 1-2h)
- Shadow-mode ramp-up (per-target trust progression mapped to Station 0-3, 3-4h)
- Per-task inline learning (factual observations only, hull-integrity gated, 2-3h)
- Production-derived eval pipeline (the #1 gap, 8-12h across 2-3 sessions)
- Sensor-actuator gap closure (systemic root cause behind 4 of the 5 deferred items)

#### Systemic Insights (3)

1. **Eval infrastructure is the #1 gap.** All 8 reviewers flagged it independently. 133+ tests, zero capability evals. Promoted to standalone roadmap item.
2. **Observation-to-action gap** is one root cause wearing four masks. Anti-stall, momentum ratchet, episodic promotion, per-task learning all share the same shape: sensor detects, then nothing happens.
3. **Fleet F1-F3 all confirmed implemented.** Provenance tags, Unsourced Claims Register, Tenth Man clause: all in SKILL.md and 6 faction TOMLs. 35 tests pass. The concern was overcautious; the audit discipline was worth it.

#### Review Pipeline

Proportionality-gated per the new equal-score principle. Code review fork: PASS (1 MEDIUM advisory). Codex gpt-5.5 cross-model: 5 findings, 1 actioned. 87 total tests green (39 + 13 + 35 regression).

#### K-LEAN (5 entries)

Reliability math (multiplicative step decay), capability acquisition ladder (10-step), proportionality gate (2+3 for single-doc), adversarial source verification (verify against GitHub not stale registries), aspiration-vs-implementation honesty (audit planned vs built).

#### Hook Budget

Unchanged at 65/70. No new hooks. Extensions only.

---

## [v8.1] - 2026-05-12

### K-LEAN V3.4: Decision Provenance

Cherry-picked from Semantica 0.5.0 research (4-band sensor sweep, ~35 sources, Codex adversarial at 78% confidence). Instead of adopting the full framework, we extracted two design patterns and built them ourselves. Zero new dependencies.

The core idea: agent decisions should have lineage. "Why did we deprecate the KG MCP?" shouldn't require searching session transcripts. It should be one query.

#### Changed -- Scripts (3 updated)

- **klean-schema.json** -- V3.4 schema. Four new optional fields:
  - `decision_type`: enum (`architectural`, `tactical`, `policy`, `quality-gate`). Only set when `type='decision'`.
  - `causal_chain`: array of entry IDs that led to this decision. The "why did we decide X?" traversal path.
  - `supersedes`: ID of the entry this decision replaces. The old entry stays in the DB (immutable history) but is marked as evolved.
  - `valid_until`: ISO date for automatic re-evaluation. Consolidation flags expired decisions.
  All fields optional. 135 existing entries pass backward compatibility without modification.
- **klean-consolidate.py** -- Pass 2 (staleness detection) now includes Criterion E: `valid_until` expiry check. Entries past their expiry date are flagged with severity `high` (>30 days expired) or `medium`. Same `reasons.append()` pattern as Criteria A through D.
- **klean-utility-update.py** -- New `apply_causal_boost(entries)` function. Entries referenced in another entry's `causal_chain` get a gentle utility pull toward 0.8 (alpha=0.1). If someone cited your work in a decision, you proved useful. Runs before every `save_entries()` call across all 4 update modes. Imports `defaultdict` from collections.

#### Research (Investigated, Not Adopted)

- **Semantica 0.5.0** (Hawksight-AI, MIT) -- KG + decision intelligence + ontology framework. 12-tool MCP server, OWL/SHACL/SKOS ontology hub, W3C PROV-O provenance, 6 reasoning engines. Verdict: WATCH. Too young (4-5 months, 3 contributors), too heavy (1.5GB deps: torch + spacy core). Two design patterns cherry-picked (decision dataclass, checkpoint/diff). MCP spike deferred until a concrete use case triggers it. Full research artifacts available on request.

---

## [v8] - 2026-04-08

### Auto-Recall Memory System, Hook Taxonomy, and Failure Intelligence

Assimilation sprint: 14-source research consolidating the 3-layer auto-recall engine (K-LEAN TF-IDF + mem0/Qdrant entity recall + blind spot matching), hook taxonomy with effort-based gating, and failure intelligence with named types and recovery routing. Followed by behavioral quality sensors from the Laurenzo study (Read:Edit ratio monitoring, fatigue signals).

#### Added: Hooks (4 new, total now 32)

- **auto-recall.js** (`UserPromptSubmit`) -- 3-layer knowledge injection. Scores K-LEAN entries via TF-IDF with IDF corpus weights, mem0 entities via conditional activation (only when entity signals detected), and blind spots via keyword trigger matching. Session dedup (15-min TTL), SKILL0 internalization (80% reduction at 10+ retrievals), injection budget coordination (1000 tokens/turn shared). ~200ms warm.
- **done-criteria-check.js** (`Stop`) -- compound task completion nudge. Detects when tasks have unfinished items and prompts the agent before session end.
- **success-trace-logger.js** (`Stop`) -- archives winning traces (tool sequences, files modified, tasks completed) for sessions that complete without corrections.
- **permission-logger.js** (`PermissionRequest`) -- security audit trail for all permission prompts.

#### Added: Hook Libs (6 new, total now 12)

- **hook-gate.js** -- effort-based gating with 5-class taxonomy (NEVER_GATE/QUALITY/OBSERVABILITY/INFRASTRUCTURE/KLEAN), 3 profiles (quick/standard/thorough), injection budget coordination with 30s TTL. Fail-open semantics.
- **hook-taxonomy.json** -- classification manifest for 62+ hooks across the full installation (32 shipped in this repo).
- **blind-spots.json** -- 8 curated domain-specific warnings with trigger keywords, confidence scores, decay classes, and 180-day auto-expiry.
- **blind-spot-matcher.js** -- keyword matching with time-based confidence decay (3 rates: slow/medium/fast).
- **mem0-recall.js** -- entity recall from Qdrant via HTTP. Conditional activation on entity signal detection. Under 200ms.
- **failure-pattern-aggregator.js** -- cross-session failure classification. Groups by error signature, surfaces systemic issues at 3+ occurrences.

#### Added: Skills (4 new, total now 32)

- **doc-garden** -- knowledge hygiene scanner for memory, instincts, and K-LEAN entries
- **curator-gate** -- quality gate for instinct persistence, 4-stage validation pipeline before writing new instinct files
- **research-protocol** -- two-loop research orchestrator chaining deep-research (hypothesis generation) with experiment-loop (empirical testing)
- **scientific-research** -- citation-backed scientific research with evidence grading and systematic review methodology

#### Added: Docs (3 new, total now 23)

- **memory-system.md** -- 3-layer auto-recall architecture, K-LEAN, mem0, blind spots, SKILL0 internalization
- **failure-system.md** -- named failure taxonomy, Reflexion pattern, recovery routing, success traces
- **hook-infrastructure.md** -- hook taxonomy, effort-based gating, injection budget coordination

#### Changed

- **22 existing hooks** updated with effort-based gating via `hook-gate.js` integration
- **context-threshold-monitor.js** -- added fatigue signals: re-read ratio (30% threshold) and scope scatter (8 dir threshold). Laurenzo study behavioral quality sensors.
- **execution-ratio-monitor.js** -- added Read:Edit ratio monitoring from Laurenzo study (tracks planning-vs-execution balance with triple-gate activation).
- **K-LEAN schema** -- V3.4 with two-layer scoring (raw 0.8x vs consolidated 1.5x), SKILL0 retrieval tracking, utility score EMA integration.
- **README** -- updated to reflect full v8 architecture (32 skills, 32 hooks, 12 libs, memory system, hook taxonomy, failure system).

#### Research (Assimilated)

14 open-source repositories studied via fleet-reviewed research sprint:
- **skydeckai/hindsight** (MIT) -- per-turn auto-recall concept. Clean-room reimplemented with TF-IDF instead of vector embeddings.
- **fpytloun/mnemory** (MIT) -- two-layer memory scoring. Clean-room reimplemented with raw/consolidated numeric multipliers.
- **DigitalCreationsCo/claude-octopus** -- blind spot patterns. Clean-room reimplemented with instinct-grade discipline.
- **nicholasgriffintn/engram-memory** -- conditional entity recall. Clean-room reimplemented with regex signal detection.
- **nicholasgriffintn/claude-bootstrap** -- hook classification. Clean-room reimplemented with full taxonomy and gating.
- **A-EVO-Lab/a-evolve** -- graduated evolution scope. Saturation detection assimilated.
- See [ATTRIBUTION.md](ATTRIBUTION.md) for full lineage.

---

## [v7] - 2026-03-29

### K-LEAN Compounding: Utility Scoring, Sleep-Time Consolidation, and Reflexion

Assimilation of three research patterns into the K-LEAN knowledge management pipeline: MemRL Q-value weighted retrieval (arXiv:2603.15381), SNARC dream-cycle PostCompact enrichment, and the Reflexion failure reflection pattern (88% vs 67% on HumanEval).

#### Added -- Hooks (2 new, total now 26)

- **failure-reflection.js** (`PostToolUseFailure`) -- Reflexion-pattern hook. Reads loop-detector state and generates structured failure reflections when 3+ repeated failures of the same pattern are detected. Heuristic reflection per tool type (Edit/Write/Bash/Read/Grep/Glob/Agent) -- no LLM call, completes in <5ms. Appends to `~/.claude/cache/failure-reflections.jsonl`. Rate-limited (1 per 5 min, max 5 per session). File rotation at 256KB.
- **post-compact-enrichment.js** (`PostCompact`) -- SNARC dream-cycle hook. After compaction, re-injects the top-5 most relevant K-LEAN entries scored by utility_score, priority, file keyword match, recency, and entry type. Also injects session checkpoint hull/usedPct if checkpoint is <30 minutes old. Bridges the gap between pre-compact capture and post-compact context recovery.

#### Added -- Instincts (1 new, total now 15)

- **failure-reflection.md** -- Reflexion pattern instinct (confidence 0.80). Before retrying a failed operation, check `failure-reflections.jsonl` for matching error signatures and apply the avoidance strategy. Prevents blind retries of the same failing approach. Includes lookup pattern and failure_mode metadata.

#### Added -- Scripts (2 new)

- **klean-utility-update.py** -- K-LEAN Q-value updater implementing the MemRL EMA pattern. Updates `utility_score` via `Q_new = Q_old + alpha * (reward - Q_old)` (alpha=0.2). Supports single entry update, batch updates from JSON, utility decay for unretrieved entries (floor 0.3), and SNARC-inspired confidence decay for stale entries by `decay_class` (volatile/stable/permanent, floor 0.4). Atomic write with timestamped backup.
- **klean-consolidate.py** -- K-LEAN sleep-time consolidation (4-pass pipeline). Pass 1: duplicate detection via Union-Find clustering (80% keyword overlap + 60% title overlap, overlap coefficient). Pass 2: staleness detection (4 OR-criteria: 90+ days, confidence below 0.4, superseded flag, orphaned). Pass 3: abstraction candidates (keyword cluster groups of 3+). Pass 4: relationship enrichment (auto-fills `related_to` for entries with none, min 2 shared terms). Only Pass 4 auto-applies; Pass 1 requires `--apply-all`.

#### Changed

- **klean-schema.json** -- V3.3 schema now documents `utility_score` (Q-value, EMA-updated), `retrieval_count` (usage frequency tracking), `salience_score` (5-signal pre-storage filter), and `last_retrieved` (time-based decay support) fields. These fields were added in v6 but the schema file now reflects their full documentation including EMA formula and SNARC attribution.

---

## [v6] - 2026-03-28

### Assimilation: Confidence Scoring, Agent Supervision, and K-LEAN Compounding

Reconnaissance of 3 external projects (claude-devtools, ai-orchestrator, Octopoda). Fleet-reviewed at 85/100 unified confidence. Patterns assimilated from Community-Tech-UK/ai-orchestrator (MIT) and matt1398/claude-devtools.

#### Added -- Lib Modules (2 new)

- **confidence-analyzer.js** -- 4-signal confidence scoring: explicit markers (35%), linguistic hedging (25%), cross-agent consistency (25%), evidence density (15%). Returns score + verdict (HIGH/MEDIUM/LOW/VERY_LOW). Supports cross-agent peer text comparison.
- **supervisor.js** -- Erlang OTP-inspired subagent supervisor with one-for-one restart, circuit breaker (3 failures), exponential backoff, escalation for diverse errors (suggests agent type switch), session-scoped state.

#### Enhanced -- Hooks (3 updated)

- **loop-detector.js** -- Signal 4: consecutive identical tool calls (doom loop detection). Catches agents reading same file repeatedly or spawning same subagent. State truncated to 120 chars to prevent content leakage (fleet X-001 fix).
- **subagent-stop-tracker.js** -- Strategy learner: logs task keywords from agent name/description for future routing optimization. Builds agent-task-outcome dataset over time.
- **pre-compact-retention.js** -- K-LEAN schema validation runs on every compaction. Reports clean/issue count in PreCompact output. Soft validation (warns, never blocks).

#### Enhanced -- Skills (2 updated)

- **codex** -- 5-dimension scoring rubric for reviews: correctness, completeness, security, consistency, feasibility. Structured APPROVE/CONCERNS/REJECT verdicts.
- **fleet-command** -- 4-signal confidence scoring integrated into faction output processing. Cross-agent consistency scoring uses peer texts from other factions.

#### Enhanced -- K-LEAN (3 improvements)

- **knowledge-capture.py** -- Relationship auto-suggester: new entries automatically linked to related existing entries via keyword + title overlap (min 2 shared terms). Also: `--validate --json` output mode for hook consumption.
- **entries.jsonl** -- 45 entries backfilled with auto-suggested related_to (3.8% -> 46.2% population). Kill condition (>10% by 2026-05-01) met.
- **Schema cleanup** -- 49 entries with issues fixed (academy batch migration: body->insight, tags->keywords, missing fields populated). 53.8% clean -> 84.9% clean.

#### Added -- Documentation

- **claude-devtools-setup.md** -- Install guide for the session inspector (Electron/Docker/npm) with security hardening (localhost binding, read-only mount, network isolation).

---

## [v5] - 2026-03-26

### Supply Chain Defense, Skill Routing, and 13 New Skills

Fleet-reviewed across two full fleet deployments (6 factions each, 78/100 and 80/100 unified confidence). Informed by grounded deep research on the SkillsMP marketplace ecosystem (73 sources, 4 parallel research bands).

#### Added -- Skills (13 new, total now 28)

- **adversarial-debate** -- structured multi-reviewer cross-challenge with convergence detection and circuit breaker
- **away-team** -- coordinated multi-agent execution for complex implementation tasks
- **away-mission-qa** -- structured browser QA with health scoring (0-100), fix cycles, and regression tests
- **codex** -- cross-model collaboration with OpenAI Codex and Google Gemini CLI (review, debug, challenge, trio modes)
- **confidence** -- epistemic state assessment (KNOWN/ASSUMED/UNKNOWN classification with risk scoring)
- **containment-field** -- restrict edits to specific files/directories with advisory warnings
- **evolve-yourself** -- promote patterns into instincts, detect skill graduation candidates, export/import across projects
- **long-range-sensors** -- post-deploy canary with baseline capture and regression detection
- **make-it-so** -- release pipeline: test, review, version, changelog, commit, PR, CI verify
- **red-alert** -- multi-phase security health check with fleet-powered adversarial review and mem0 fingerprint tracking
- **relief-on-station** -- context exhaustion recovery: creates turnover brief and spawns replacement agent
- **retro** -- structured session retrospective measuring skill accuracy, governance friction, and instinct proposals
- **test-hooks** -- hook health check and test runner for verifying hook installation and performance

#### Added -- Hooks (8 new, total now 24)

- **protect-secrets** (`PreToolUse`) -- blocks reading/writing SSH keys, .env files, AWS creds, pip/uv config (supply chain hijack defense), exfiltration via curl/scp/netcat, and inline secret patterns (AWS keys, GitHub tokens, connection strings)
- **skills-index-builder** (`SessionStart`) -- pre-filters skill routing surface by extracting keywords from SKILL.md descriptions, scoring against project context, and injecting top-10 recommendations. 130ms cold / 108ms warm. DESC_REJECT_PATTERNS sanitization
- **pre-compact-retention** (`PreCompact`) -- captures critical state before context compaction: active tasks, recent decisions, session learnings, and instinct proposals
- **correction-capture** (`Stop`) -- detects corrections, observations, and positive feedback in transcripts for the learning pipeline
- **failure-recovery** (`PostToolUseFailure`) -- suggests escalating debugging strategies after consecutive failures (3+ suggests /kln:rethink, 5+ suggests /relief-on-station)
- **containment-field** (`PreToolUse`) -- advisory scope warnings when editing files outside the declared focus area
- **bash-output-limiter** (`PostToolUse`) -- caps Bash output to prevent context flooding from verbose commands
- **skill-usage-tracker** (`PreToolUse`) -- logs skill invocations for usage analytics and audit decisions

#### Added -- Instincts (5 new, total now 14)

- **skill-install-quarantine** -- two-gate protocol for external skill installation: structural scan (patterns, permissions, URLs) + semantic intent review (exfiltration, persistence, redirection). Includes SSRF blocklist and commit-SHA pinning requirement
- **secrets-and-ops-safety** -- never hardcode secrets, never expose credentials in logs, always use environment variables
- **agent-receipt-protocol** -- subagents must return structured receipts with status, artifacts, issues found, and confidence
- **explain-impact** -- when proposing changes, always explain what will break and what will improve
- **freshness-check** -- verify external data (API responses, web content, documentation) is current before acting on it

#### Added -- Scripts (2 new)

- **verify-citations.py** -- citation verification for grounded research outputs. Checks DOI resolution, URL accessibility, hallucination patterns, and title similarity. SSRF-safe (HTTPS-only, RFC-1918 blocklist). Adapted from 199-biotechnologies/claude-deep-research-skill (commit `314d085b`, SHA-256 verified)
- **klean-schema.json** -- JSON Schema for K-LEAN knowledge entries (V3.3). Soft validation with entry ID regex constraint (`^[a-zA-Z0-9_-]{1,64}$`) preventing shell metacharacter injection

#### Changed

- `lib/circuit-breaker.js` -- updated with latest fixes
- `lib/redact-secrets.js` -- updated with latest patterns
- `deep-research/SKILL.md` -- added mandatory citation verification post-step for grounded mode
- README -- updated counts (28 skills, 24 hooks, 14 instincts), added supply chain defense description
- Added `CONTRIBUTING.md` with git identity guidelines and AI co-authoring convention
- Added `scripts/` directory for standalone tools

#### Security

- **Supply chain defense**: protect-secrets hook now blocks pip/uv package index config modification (`~/.pip/pip.conf`, `~/.config/uv/uv.toml`), preventing the SentinelOne-documented dependency hijacking attack vector
- **Skill quarantine instinct**: all external skill installations require two-gate review (structural + semantic) per SkillsMP fleet review findings (26.1% of marketplace skills contain dangerous patterns per academic study)
- **Citation SSRF protection**: verify-citations script blocks outbound requests to RFC-1918 ranges, loopback, and non-HTTPS URLs

#### Research (Investigated, Not Adopted)

- **SkillsMP marketplace** (skillsmp.com) -- 4-band grounded deep research (73 sources). Verdict: use as discovery catalog only, not a trust source. Three patterns assimilated: verify_citations script, meta-skill router concept (deferred), skill-install-quarantine instinct
- **Meta-skill router pattern** -- deferred pending prototype validation. Description budget audit shows 42% headroom (8,424 of 20,000 chars), so not urgent
- **Understand-Anything** (codebase knowledge graph) -- deferred per fleet consensus. Overlaps with existing dependency tracking; produces per-repo islands rather than cross-project linkage

---

## [v4] - 2026-03-16

### Quality Ceiling Architecture and Temporal Intelligence

Fleet-reviewed (6 factions + Holodeck Architecture Council). Semantica assimilation review (6 factions + Codex adversarial, 0.84 unified confidence). Phase 1 assimilation fleet review (5 factions + Codex, 0.91 unified confidence).

#### Added

- **Post-compact context re-injector** (`post-compact-reinjector.js`) -- SessionStart hook with `compact` matcher that re-injects hull integrity state, metabolic state, threshold crossings, active tasks, and instruction shedding status after compaction. Targets <500 tokens of critical context recovery
- **Decision scope tagging** in Captain's Log -- `decisionScope()` classifies decisions as `[project]` or `[global]` based on content heuristics. Prevents cross-project decision anchoring in HANDOFF.md
- **Instinct `failure_mode` metadata** -- all 9 instinct files now carry a `**failure_mode**` field categorizing what class of failure the instinct prevents (context-drift, scope-creep, security, system-integrity, waste, premature-action, vague-delegation)
- **Quality Ceiling Architecture** -- 1M context window with 400K quality ceiling (40%). Autocompact at 40% via `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=40`. Tighter hull integrity thresholds: Green <25%, Amber 25-32%, Red 33-37%, Critical 38-40%. Includes threshold guidance table for 200K windows (Pro/default plan) where the default 80% autocompact is already correct

#### Changed

- `captain-log.js` -- added `decisionScope()` function and Recent Decisions section with `[project]`/`[global]` scope prefix in HANDOFF.md output
- `context-threshold-monitor.js` -- updated hull integrity thresholds to Quality Ceiling Architecture (was: Green 0-39%, Amber 40-54%, Red 55-69%, Critical 70-79%)
- All 9 instinct files -- added `**failure_mode**` metadata field
- README -- updated hook count (16), hull integrity thresholds, added post-compact-reinjector to hook inventory

#### Research (Investigated, Not Adopted)

Comprehensive research sweep covering 7 external projects. Findings captured in dependency registry and Knowledge DB:
- **Semantica** (semantic memory framework) -- verdict: LEARN-FROM. Temporal validity pattern extracted natively. Decision intelligence rejected (Station 3 prompt injection risk). Conflict detection deferred (no evidence)
- **Anthropic Academy** -- 27 knowledge base entries extracted covering context engineering, tool design, multi-turn architecture
- **Deep Agents** -- multi-level planning with temporal memory. Not adopted (Python/different paradigm)
- **Learnship** -- continuous learning framework. Not adopted (overlaps with existing instinct system)
- **Jules** -- async background agent. Not adopted (different execution model)
- **Dex** -- terminal-native IDE patterns. 4 patterns extracted to Knowledge DB
- **DeerFlow** -- multi-agent research orchestrator. Not adopted (Python, overlaps deep-research skill)

---

## [v3] - 2026-03-12

### GAAI Assimilation -- Structured Severity and Hook Hardening

Fleet-reviewed (6 factions, 0.91 unified confidence) + adversarial cross-model review (33 findings, 27 fixed).

#### Added

- **Structured severity scale (A-007)** across all 6 review skills -- unified S0/S1/S2/S3 severity levels:
  - S0 (Critical): Must fix before merge/deploy
  - S1 (High): Should fix, significant risk
  - S2 (Medium): Recommend fixing
  - S3 (Low): Suggestion
- **Finding IDs** -- faction-prefixed sequential identifiers (K-001, R-001, F-001, B-001, O-001, X-001 for cross-faction)
- **Must-Fix Checklists** -- S0/S1 items that block approval, in every review skill output
- **Formal Verdicts** -- each faction now outputs a named verdict:
  - Klingon: Honor Rating (Qapla! / Acceptable / Dishonorable)
  - Romulan: Classification (CLASSIFIED / MONITOR / ALERT)
  - Ferengi: Latinum Rating (Gold-Pressed / Silver / Bronze)
  - Bridge: Verdict (ENGAGE / ENGAGE WITH CAUTION / ALL STOP / CAPTAIN'S CALL)
  - Opponents: Assessment (DEFENSIBLE / MIXED / VULNERABLE)
- **`auto-fix-diagnostics.js`** -- PostToolUse hook for automatic code quality checks (JSON validation, Python syntax, formatting)
- **`lib/redact-secrets.js`** -- shared secret redaction library (12 patterns covering API keys, tokens, passwords, private keys, AWS keys, connection strings)
- **`scope-gate.md`** instinct -- pre-implementation scope verification at phase boundaries
- **`input-classification.md`** instinct -- context guardrail for input routing
- **Fleet Command normalization** updated to map S_LEVEL directly from faction outputs instead of computing from confidence/ROI
- **Output contracts** extended with FINDING_ID and S_LEVEL required fields for all factions

#### Changed

- `klingon-review/SKILL.md` -- findings table with ID and S columns, output contract with FINDING_ID/S_LEVEL
- `romulan-intel/SKILL.md` -- findings table with ID and S columns, S_LEVEL mapping rules, output contract updated
- `ferengi-audit/SKILL.md` -- findings table with ID and S columns, ROI-to-severity mapping, output contract updated
- `bridge-briefing/SKILL.md` -- Key Concerns now carry B-NNN IDs and S0-S3, Findings table in output
- `opponents-view/SKILL.md` -- findings table with O-NNN IDs, formal Verdict section added
- `fleet-command/SKILL.md` -- Cross-Faction Findings table has ID and S columns, Must-Fix Checklist, normalization tables updated
- `capability-readiness.md` instinct -- updated with GAAI verification patterns
- `dead-element-rule.md` instinct -- merged C-003 no-delete rule

#### Security

- Shared `lib/redact-secrets.js` eliminates SECRET_PATTERNS duplication (drift risk flagged by all 6 factions)
- All hooks use atomic writes (temp + rename) for persistent state
- Path traversal validation on stdin-derived file paths
- Prototype pollution prevention in user-controlled key maps
- Circuit breaker integration in all hooks
- `--untracked-files=no` for git status calls (performance + privacy)

---

## [v2] - 2026-03-12

### Fleet-Reviewed README and New Components

Adversarial dual-critic review (Codex + Sonnet) on README. Full fleet review on new content.

#### Added

- **Holodeck Division** -- 8 expert personas (Socrates, Holmes, Sun Tzu, Da Vinci, Curie, Lovelace, Feynman, Hopper)
- **Experiment Loop** skill -- autonomous single-file optimization with worktree isolation
- **Deep Research** skill -- parallel multi-band research orchestrator
- **Self-Correct** skill -- 5-phase pre-execution adversarial gate
- **Agent Annotation System** -- per-library gotcha injection with Context7 integration
- **Friction Detection** -- automatic pattern detection (consecutive failures, edit churn, tool oscillation)
- **Captain's Log** -- session handoff generator (Stop event hook)
- **Execution Ratio Monitor** -- planning vs execution tracking
- Architecture documentation (`docs/architecture.md`)
- Hook lifecycle documentation (`docs/hook-lifecycle.md`)
- Instinct system documentation (`docs/instinct-system.md`)
- Skill authoring guide (`docs/writing-skills.md`)
- SAGE Patterns Guide (`docs/SAGE-Patterns-Guide.md`)
- LinkedIn briefing document

#### Changed

- README rewritten with engineering rationale (WHY, not just WHAT)
- ATTRIBUTION expanded with GAAI-framework, autoresearch, context-hub lineage
- INSTALL updated with Holodeck, annotation hooks, and optional integrations

---

## [v1] - 2026-03-11

### Initial Release

#### Added

- 11 Star Trek-themed skills (bridge-briefing, klingon-review, romulan-intel, ferengi-audit, fleet-command, borg-assimilate, opponents-view, counselors-log, reflect, evaluate, effort-profile)
- 14 persona files (5 officers, 3 warriors, 3 operatives, 3 merchants)
- 13 lifecycle hooks with shared libraries (circuit-breaker, intent-classifier, fragility-scoring)
- 4 instincts (read-before-edit, hooks-always-exit-zero, atomic-file-writes, verify-background-results)
- 2 rules (risk-classification, voice-output)
- 2 agent definitions (commit-analyzer, devils-advocate)
- Example configurations (CLAUDE.md, IDENTITY.md, settings.json)
- INSTALL guide, ATTRIBUTION, MIT LICENSE
- 5 SAGE pattern reimplementations (identity manifest, circular buffer, metabolic states, multi-axis salience, trust tensor decay)
