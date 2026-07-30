# Memory & Knowledge System: Deep Dive

> "The acquisition of knowledge is a sacred duty."
> -- Captain Jean-Luc Picard

---

## TL;DR

Three knowledge layers feed an auto-recall engine that injects relevant knowledge before every significant prompt:

- **Synaptic Pathways (K-LEAN)**: Factual learnings stored in `.knowledge-db/entries.jsonl`. Scored at retrieval time using TF-IDF across the full corpus. Manual entries weighted 1.5x; auto-captured entries 0.8x.
- **Mnemonic Core (mem0/Qdrant)**: ~235 entity relationships held in a Qdrant vector store. Queried conditionally only when entity signals appear in the user message.
- **Blind Spot Library**: 8 curated domain warnings in `hooks/lib/blind-spots.json`. Matched by keyword trigger sets, time-decay filtered. Represents patterns where the agent has repeatedly failed.

The `auto-recall.js` hook fires on every `UserPromptSubmit` event, scores all three layers, applies a SKILL0 internalization penalty to over-retrieved entries, checks the shared injection budget, and injects the top 3 results as `additionalContext`. Retrieval hits feed back into utility scoring, consolidation, and internalization tracking.

---

## 1. Architecture

The diagram below traces a single user message through the full system:

```
USER MESSAGE (UserPromptSubmit)
        |
        v
  auto-recall.js
        |
        +--[tokenize + stop-word filter]
        |   (skip if <3 meaningful words)
        |
        +--[find .knowledge-db/entries.jsonl]
        |   (walk up from cwd, max 8 levels)
        |
        +--[load entries]  <-- mtime cache
        |
        +--[build IDF weights across corpus]
        |
        +--[score each entry]
        |   keyword match  x2.0 IDF
        |   title match    x1.5 IDF
        |   insight match  x0.5 IDF
        |
        +--[layer bonus]
        |   consolidated  x1.5
        |   raw           x0.8
        |
        +--[SKILL0 penalty]
        |   retrieval_count >= 10  -> x0.2
        |
        +--[filter: score >= 0.15]
        |
        +--[session dedup]
        |   15-min TTL, 50-entry cap
        |   stored in ~/.claude/cache/auto-recall-dedup.json
        |
        +--[mem0 query] (conditional: entity signals detected)
        |   regex gate: VPS, MCP, Qdrant, Docker, etc.
        |   5-min query cache, max 3 results
        |
        +--[blind spot match]
        |   min 2 keyword triggers
        |   min 0.5 effective confidence after decay
        |
        +--[injection budget check]
        |   shared 1000-token budget via hooks/lib/hook-gate.js
        |   token estimate: ceil(text.length / 4)
        |
        +--[inject top 3 as additionalContext]
        |
        v
  auto-recall-hits.jsonl  <-- retrieval feedback log
        |
        +---> utility_score updates (klean-utility-update.py)
        +---> SKILL0 hit counter
        +---> consolidation orphan detection (klean-consolidate.py)
        +---> salience analysis
```

---

## 2. Layer 1: Synaptic Pathways (K-LEAN)

### Storage

K-LEAN entries live in `.knowledge-db/entries.jsonl` relative to each project root. The format is JSONL (one JSON object per line). The file is located by walking up from the current working directory up to 8 parent levels.

### Schema V3.4

Each entry is a JSON object. Required fields are marked with `*`:

```jsonc
{
  "id": "fix-20260312-tts-overlap-v2",    // unique, [a-zA-Z0-9_-], max 64 chars
  "title": "TTS overlap fix: use serial queue",  // * max 80 chars
  "insight": "When TTS and STT share the same audio device, overlapping playback causes garbled output. Solution: wrap all audio ops in a named serial dispatch queue. Observed in voice-service.ts:214.",  // * 50-500 chars, 2-4 sentences
  "type": "solution",                      // * warning|solution|pattern|finding|decision|discovery
  "priority": "high",                      // * critical|high|medium|low
  "keywords": ["tts", "audio", "overlap", "serial-queue"],  // * 1-10 items
  "source": "file:voice-service.ts:214",   // * file:path:line, git:hash, conv:date, or url
  "memory_type": "procedural",             // semantic|procedural|episodic|preference
  "memory_layer": "consolidated",          // consolidated (1.5x) or raw (0.8x)
  "decay_class": "stable",                 // volatile|stable|permanent
  "confidence": 0.90,                      // 0.0-1.0
  "utility_score": 0.75,                   // Q-value, EMA-updated
  "salience_score": 0.82,                  // capture-time filter score
  "retrieval_count": 4,                    // hit counter for SKILL0
  "last_retrieved": "2026-03-28T10:00:00", // drives time-based decay
  "related_to": ["fix-20260310-whisper-latency"],  // IDs of related entries
  "depends_on": [],                        // prerequisite entry IDs
  "decision_type": null,                   // architectural|tactical|policy|quality-gate (decisions only)
  "causal_chain": [],                      // IDs of entries that led to this decision
  "supersedes": null,                      // ID of entry this replaces (old entry stays, marked evolved)
  "valid_from": "2026-03-12",
  "valid_until": null,                     // null = no expiry; consolidation flags expired entries
  "last_validated": "2026-03-28",
  "timestamp": "2026-03-12T08:30:00.000Z",
  "session_id": "session-abc123"
}
```

`additionalProperties: true`: the schema is soft (warns on violations, does not block writes).

### Two Capture Paths

**Auto-capture (PreCompact hook)**

The `PreCompact` hook extracts learnings from the conversation before compaction. Entries written this way receive `memory_layer: "raw"` and carry a 0.8x retrieval scoring weight. They represent raw session output: potentially redundant, unvalidated, or too specific.

**Manual capture (`/kln:learn`)**

When the agent or user explicitly captures a finding via `/kln:learn` or `/kln:learn "topic"`, the entry receives `memory_layer: "consolidated"` and a 1.5x weight. Manual entries are expected to be deliberate, precise, and generalized from experience.

The weight difference is intentional: manually curated knowledge should surface more readily than automatic captures. Auto-captured knowledge is retained to avoid loss, but deprioritized until consolidated.

### Consolidation Pipeline (`klean-consolidate.py`)

Run periodically (or as part of `/borg-assimilate`) to restructure the knowledge base. Four passes:

**Pass 1: Duplicate Detection**

Union-Find algorithm across entry pairs. An entry pair is considered duplicate when:
- Keyword overlap exceeds 80%: `|A ∩ B| / |A ∪ B| > 0.80`
- Title word overlap (stop-word stripped) exceeds 60%

Duplicate resolution is report-only by default. Use `--apply-all` to automatically mark the older entry as superseded.

**Pass 2: Staleness Removal**

Entries become stale candidates when any of these conditions hold:
- No validation in 90+ days
- Confidence below 0.30
- Zero retrievals in 30+ days (suggests the corpus has evolved past this entry)
- Marked `valid_until` is in the past
- Superseded by a newer entry

Stale entries are flagged in the report; removal requires explicit confirmation.

**Pass 3: Abstraction Candidates**

When 3+ entries share a keyword cluster (Jaccard similarity > 0.60), the consolidation script flags them as candidates for generalization into a single higher-level principle. This prevents the knowledge base from becoming a log of individual incidents instead of reusable patterns.

**Pass 4: Relationship Enrichment (auto-applied)**

Pass 4 is the only pass that writes to `entries.jsonl` automatically. It fills missing `related_to` fields by computing keyword+title term overlap across all entry pairs. Entries sharing 2+ terms that are not already related get linked. Maximum 3 suggestions per entry.

### Utility Scoring (`klean-utility-update.py`)

Utility score is a Q-value tracking how often an entry contributed to successful outcomes. Updated via exponential moving average:

```
Q_new = Q_old + alpha * (reward - Q_old)
```

Parameters:
- `alpha = 0.2` (learning rate, moderate adaptation)
- `reward = 1.0` (success) or `0.0` (failure)
- Default for new entries: `0.5`
- Floor after decay: `0.3`

Entries not retrieved across decay cycles slowly drift toward 0.3, preventing zombie entries (high utility scores from long-ago use) from displacing current knowledge.

**Causal chain boost.** Entries referenced in another entry's `causal_chain` get a gentle utility pull toward 0.8 (alpha=0.1). The logic: if a decision cited you as a causal input, you proved useful in context. This runs automatically before every save in `klean-utility-update.py`.

### Retrieval Scoring Formula

At query time, each entry receives a score based on TF-IDF matching against the user message:

```
score = sum over matched terms of:
  IDF(term) * field_weight * term_frequency_in_field

field_weights:
  keywords: 2.0
  title:    1.5
  insight:  0.5

IDF(term) = log((1 + N) / (1 + df)) + 1
  N  = total entry count
  df = entries containing term

Final score normalized by query length.
```

After TF-IDF scoring, layer bonuses and penalties are applied in sequence:
1. Memory layer: `consolidated` entries x1.5, `raw` entries x0.8
2. SKILL0 internalization: entries with `retrieval_count >= 10` x0.2
3. Minimum threshold: entries below 0.15 are dropped

---

## 3. Layer 2: Mnemonic Core (mem0/Qdrant)

### Storage

Entity relationships are held in Qdrant collection `mem0_mcp_selfhosted` on `localhost:6333`. The collection contains approximately 235 entries auto-extracted by the mem0 MCP server. Each document's text content lives in the `data` payload field (not `memory`; this is a common gotcha; see Section 11).

A text index on the `data` field enables keyword search alongside vector similarity:

```json
{
  "type": "text",
  "tokenizer": "word",
  "min_token_len": 3,
  "lowercase": true
}
```

### Conditional Activation

Querying mem0 on every user message would add latency and consume injection budget unnecessarily. Auto-recall gates the mem0 query behind entity signal detection: a regex pass over the user message checks for known entity categories.

Current entity signal patterns (illustrative subset):

```
VPS, server, deployment, container
MCP, Qdrant, Weaviate, Docker
WordPress, Elementor, Rank Math
coaching, engagement, client
```

If no entity signals appear in the message, the mem0 query is skipped entirely. This keeps the fast path (pure K-LEAN scoring) at ~200ms warm without network overhead.

### Caching and Performance

Mem0 query results are cached for 5 minutes per query string. Cache entries store the serialized results; a cache hit skips the Qdrant HTTP call entirely. Maximum 3 results are returned per query.

The implementation spawns mem0 queries as child processes using a temp file to pass query arguments, avoiding shell escaping issues with special characters in entity names.

---

## 4. Layer 3: Blind Spot Library

### Purpose

The blind spot library encodes domains where the agent has **repeatedly failed** despite knowing the general principles. It is not a general knowledge store. It is a curated list of patterns that are easy to get wrong, hard to notice when you are getting them wrong, and expensive when they occur in production.

### Storage

`hooks/lib/blind-spots.json`: 8 entries as of v1.0. The file is hand-curated; entries are not auto-generated.

### Entry Format

```jsonc
{
  "id": "secrets-shell-expansion",
  "domain": "secrets-in-context",
  "confidence": 0.92,
  "last_validated": "2026-03-23",
  "failure_mode": "security",
  "decay_class": "slow",
  "trigger_keywords": ["password", "secret", "token", "hash", "bcrypt", "API key"],
  "blind_spot": "Bcrypt hashes contain $ characters that bash expands as variable references. Never interpolate credentials into double-quoted strings, heredocs, or -e docker flags. Use temp files + --env-file instead.",
  "source": "3 production incidents involving credentials in shell commands"
}
```

### Matching Logic

An entry fires when:
1. At least 2 of its `trigger_keywords` appear in the user message (case-insensitive)
2. Its effective confidence (after time decay) is at least 0.5

### Time-Based Confidence Decay

Blind spots are not immune to staleness. Each entry has a `decay_class` controlling how quickly confidence erodes if the entry is not re-validated:

| Decay class | Rate | Description |
|-------------|------|-------------|
| `slow`      | 0.5 percentage points per 30 days | Long-lived patterns (security, encoding) |
| `medium`    | 1.0 percentage points per 30 days | Standard operational patterns |
| `fast`      | 2.0 percentage points per 30 days | Environment-specific or version-bound |

Entries auto-expire at 180 days since `last_validated`, regardless of decay class. To re-activate an expired entry, validate it (update the date) and optionally restore confidence.

### Current Domains

| ID | Domain | Failure mode |
|----|--------|--------------|
| `supply-chain` | npm/pip dependency risks | security |
| `injection` | prompt injection vectors | security |
| `secrets-in-context` | credential handling in shell | security |
| `hook-interaction` | hook pipeline exit codes | reliability |
| `cache-prefix` | cache key collisions | correctness |
| `rate-limiting` | API rate limit handling | reliability |
| `encoding` | character encoding edge cases | correctness |
| `mcp-stall` | MCP server hang conditions | reliability |

---

## 5. The Auto-Recall Engine

### Hook Registration

`auto-recall.js` is registered under the `UserPromptSubmit` event in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"~/.claude/hooks/auto-recall.js\"",
            "timeout": 5000
          }
        ]
      }
    ]
  }
}
```

The 5-second timeout is generous: warm execution is ~200ms. Cold start (no mtime cache) adds ~50ms for file load. The timeout exists as a circuit-breaker backstop.

### Gating

The hook respects two skip conditions before doing any work:

1. **Effort profile**: If the current effort profile is `quick`, the hook is gated out via `hook-gate.js` gating class `QUALITY`. Quick effort skips quality-oriented enrichment to minimize overhead.
2. **Message length**: If the tokenized message produces fewer than 3 meaningful words (after stop-word removal and 3-char minimum), the hook exits immediately. Short messages ("yes", "ok", "continue") carry no meaningful signal for knowledge retrieval.

### Execution Flow

```
1.  Parse user message
    - Lowercase, remove punctuation
    - Remove stop words (the, and, is, a, ...)
    - Keep tokens >= 3 chars
    - If < 3 tokens remain: exit (no injection)

2.  Locate .knowledge-db/entries.jsonl
    - Walk up from process.cwd(), max 8 levels
    - If not found: exit (no KB available)

3.  Load entries
    - Check mtime cache (in-process, per hook invocation)
    - If file changed since last load: reload
    - Filter: exclude entries with valid_until in the past

4.  Build IDF weights
    - Tokenize all entry keywords, titles, insights
    - Count document frequency (df) per term
    - IDF = log((1 + N) / (1 + df)) + 1

5.  Score entries (TF-IDF with field weights)
    - keywords: x2.0, title: x1.5, insight: x0.5
    - Accumulate score per matched term * IDF * field_weight
    - Normalize by query token count

6.  Apply memory layer bonus
    - memory_layer == "consolidated": score *= 1.5
    - memory_layer == "raw":          score *= 0.8
    - missing field: no adjustment

7.  Apply SKILL0 internalization penalty
    - retrieval_count >= 10: score *= 0.2
    - See Section 7 for rationale

8.  Filter and sort
    - Drop entries scoring below 0.15
    - Sort descending by score

9.  Session dedup
    - Load ~/.claude/cache/auto-recall-dedup.json
    - Skip entries seen within 15-min TTL
    - Cap: 50 entries in dedup window
    - Write updated dedup state (atomic: tmp + rename)

10. Query mem0 (conditional)
    - Test user message against entity signal patterns
    - If match: run child process query against Qdrant
    - Apply 5-min result cache
    - Prepend up to 3 mem0 results to candidate list

11. Match blind spots
    - For each blind-spots.json entry:
      - Compute effective confidence (confidence - decay)
      - Count trigger keyword matches in user message
      - Include if matches >= 2 AND effective_confidence >= 0.5
    - Prepend matched blind spots to candidate list (they take priority)

12. Check injection budget
    - Load budget state from hooks/lib/hook-gate.js
    - Budget: 1000 tokens per turn (shared across all hooks)
    - Estimate tokens: ceil(text.length / 4)
    - If budget exhausted: exit silently (fail-open)

13. Inject top 3 results as additionalContext
    - Format each result with source, confidence, type
    - Blind spots labeled [BLIND SPOT]
    - mem0 results labeled [ENTITY MEMORY]
    - K-LEAN results labeled [KNOWLEDGE: {type}]

14. Log hits to auto-recall-hits.jsonl
    - One line per injected entry: id, score, timestamp, session_id
    - Drives feedback loop (Section 9)
```

### Performance Profile

| Condition | Typical latency |
|-----------|----------------|
| <3 tokens (skipped) | <1ms |
| Warm (mtime cache hit, no mem0) | ~200ms |
| Cold (file reload, no mem0) | ~250ms |
| With mem0 query (cache miss) | ~400ms |
| With mem0 query (cache hit) | ~210ms |

These are wall-clock times on a local development machine. The 5-second hook timeout provides 10-25x headroom.

---

## 6. SKILL0 Internalization

### The Concept

An entry retrieved frequently without producing corrections is assumed to have been internalized. The agent has learned the lesson; restating it wastes injection budget and adds noise. SKILL0 internalization fades these entries to a whisper.

This pattern is adapted from the SKILL0 paper (arXiv:2604.02268), which demonstrates that skill internalization reduces prompt length while maintaining task performance. Here it is applied at the harness level rather than the model level.

### Mechanics

- **Threshold**: `retrieval_count >= 10`
- **Penalty**: score multiplied by 0.2 (80% reduction)
- **Effect**: The entry can still surface; if it is highly relevant, a 0.2x score may still beat the 0.15 minimum threshold. But it will not crowd out fresher knowledge.

The entry is never deleted. If the agent makes the same mistake again, a correction from a new `/kln:learn` entry will score higher than the faded internalized entry, and the fresh entry will surface.

### Hit Tracking

Every injection is logged to `~/.claude/cache/auto-recall-hits.jsonl`:

```json
{"id": "fix-20260312-tts-overlap-v2", "score": 0.61, "timestamp": "2026-03-28T14:22:00.000Z", "session_id": "session-abc123"}
```

The consolidation script (`klean-consolidate.py`) reads this file when analyzing orphaned entries (entries in the KB that have never appeared in hits.jsonl). Orphaned entries with no retrievals over 30+ days are stale candidates.

---

## 7. Injection Budget Coordination

### Why a Shared Budget

Multiple hooks can inject `additionalContext`. Without coordination, they could collectively consume thousands of tokens before the agent responds. The shared injection budget prevents context flooding.

### Budget Parameters

| Parameter | Value |
|-----------|-------|
| Budget per turn | 1000 tokens |
| TTL between turns | 30 seconds |
| Token estimate | `ceil(text.length / 4)` |
| On exhaustion | Fail-open (exit silently) |

### Priority

Hooks are registered in `settings.json`. The `UserPromptSubmit` event fires registered hooks in order. `auto-recall.js` is registered first, giving it first claim on the budget.

If auto-recall consumes most of the budget, a later hook (e.g., a hypothetical second context enricher) will find the budget exhausted and exit silently. This is intentional: knowledge recall is considered higher priority than supplementary injection.

The budget state is managed by `hooks/lib/hook-gate.js` via a shared cache file. The 30-second TTL resets the budget per user prompt, not per hook invocation.

---

## 8. The Feedback Loop

Retrieval tracking closes four loops simultaneously:

**Loop 1: Utility Scoring**

After a session where K-LEAN entries contributed to successful outcomes, `klean-utility-update.py --batch session-outcomes.json` updates `utility_score` via Q-value EMA. Higher utility entries are more likely to surface (future scoring uses utility as a tiebreaker in curation).

**Loop 2: Consolidation Orphan Detection**

`klean-consolidate.py` Pass 2 cross-references entries against `auto-recall-hits.jsonl`. An entry with `retrieval_count == 0` and no hits in 30+ days is a consolidation candidate. Either the entry is no longer relevant, or its keywords do not match queries that should find it (keyword repair candidate).

**Loop 3: SKILL0 Internalization**

Each hit increments `retrieval_count`. When `retrieval_count` reaches 10, the entry's effective score is reduced 80% on future retrievals. The lesson has been repeated often enough to be considered learned.

**Loop 4: Salience Analysis**

The salience score is set at capture time using 5 signals: specificity, novelty, actionability, groundedness, and priority. Over time, the relationship between salience score and actual retrieval frequency reveals whether capture-time salience predictions were accurate. Entries with high salience but zero retrievals indicate the salience scoring model needs calibration.

---

## 9. Configuration & Setup

### K-LEAN

No server required. K-LEAN runs entirely on the local filesystem.

1. Create `.knowledge-db/entries.jsonl` in your project root (can be empty to start)
2. Register the `PreCompact` hook for auto-capture (see `hooks/pre-compact.js`)
3. Use `/kln:learn` to capture findings manually
4. Run `python scripts/klean-consolidate.py` periodically (weekly or after major work)
5. Run `python scripts/klean-utility-update.py --decay` to apply unused-entry decay

### mem0 / Qdrant

Requires a running Qdrant instance and the mem0 MCP server.

```bash
# Start Qdrant (Docker)
docker run -d --name qdrant -p 6333:6333 qdrant/qdrant

# Verify text index on data field (run once after collection creation)
curl -X PUT http://localhost:6333/collections/mem0_mcp_selfhosted/index \
  -H 'Content-Type: application/json' \
  -d '{"field_name":"data","field_schema":{"type":"text","tokenizer":"word","min_token_len":3,"lowercase":true}}'
```

Entity signal patterns are configured in `auto-recall.js`. Edit the `ENTITY_SIGNALS` array to match the domains relevant to your projects.

### Blind Spots

Edit `hooks/lib/blind-spots.json` directly. Follow the entry format in Section 4. Recommended practice:

- Add a new entry after the third occurrence of a distinct failure type
- Set confidence relative to how consistently the pattern manifests (0.7-0.9 for well-established patterns)
- Choose decay class based on whether the pattern is environmental (`fast`) or foundational (`slow`)
- Update `last_validated` whenever you confirm the pattern still applies

### Auto-Recall Hook Registration

Add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"/path/to/hooks/auto-recall.js\"",
            "timeout": 5000
          }
        ]
      }
    ]
  }
}
```

Hook configuration is read once at session start. After editing `settings.json`, close any stale sessions before the changes take effect.

### Effort Profiles

The auto-recall hook respects the active effort profile:

```
/effort quick      -- auto-recall skipped (QUALITY gate)
/effort standard   -- auto-recall runs (default)
/effort thorough   -- auto-recall runs + additional enrichment hooks active
```

---

## 10. Troubleshooting

**"Auto-recall never fires"**

Check in order:
1. Message has fewer than 3 meaningful words after stop-word removal. "Yes, proceed" will not trigger retrieval.
2. Hook not registered in `settings.json` under `UserPromptSubmit`.
3. `.knowledge-db/entries.jsonl` not found: the walk-up search checks 8 parent levels. Confirm the file exists at or above `cwd`.
4. Effort profile is `quick`: `hook-gate.js` skips `QUALITY`-class hooks.
5. Circuit breaker open: check `~/.claude/cache/hook-circuit-breaker.json` for `auto-recall` key.

**"mem0 returns empty results"**

1. Verify Qdrant is running: `curl http://localhost:6333/healthz`
2. Check text index exists on the `data` field (not `memory`; see below).
3. Verify the collection name matches: `mem0_mcp_selfhosted`.
4. Entity signals not detected: add a pattern matching your query domain to `ENTITY_SIGNALS`.
5. Query cache may hold a stale empty result; wait 5 minutes or restart the hook process.

**"payload field is `data` not `memory`"**

This is the single most common mem0/Qdrant integration mistake. The mem0 MCP server stores text content in the `data` field of Qdrant payloads. Many examples and older integrations use `memory`. Querying the wrong field returns empty results. Verify with:

```bash
curl -X POST http://localhost:6333/collections/mem0_mcp_selfhosted/points/scroll \
  -H 'Content-Type: application/json' \
  -d '{"limit":1,"with_payload":true}' | jq '.result.points[0].payload'
```

Confirm the payload has a `data` key.

**"Same entries keep appearing every turn"**

Session dedup TTL is 15 minutes. If the same entry appears on consecutive turns, either:
1. The TTL has expired (the entry is genuinely relevant and keeps scoring highest)
2. The dedup cache file (`~/.claude/cache/auto-recall-dedup.json`) is being reset between turns due to a write failure; check for atomic write errors in the hook logs

**"Injection budget exhausted before auto-recall fires"**

Auto-recall registers on `UserPromptSubmit` and should be the first hook in that event's list. If another hook is consuming the full budget first, reorder the hook registrations in `settings.json`. The first registered hook fires first.

**"Blind spot entries not matching"**

Check:
1. Fewer than 2 trigger keywords appear in the message: add more keywords to the entry or rephrase the query
2. Effective confidence after decay has dropped below 0.5: update `last_validated` to restore confidence
3. Entry has exceeded the 180-day auto-expiry: re-validate and restore

---

## 11. Relationship to Other Knowledge Systems

This document covers the three runtime injection layers. The broader knowledge stack includes:

| System | What it stores | Injection trigger | Target |
|--------|---------------|-------------------|--------|
| **K-LEAN** (this doc) | Factual learnings, solutions, patterns | UserPromptSubmit (auto-recall) | Main agent |
| **mem0/Qdrant** (this doc) | Entity relationships | UserPromptSubmit, entity-gated | Main agent |
| **Blind spots** (this doc) | Repeated failure patterns | UserPromptSubmit, keyword-gated | Main agent |
| **Instincts** | Behavioral do/don't rules | SubagentStart | Subagents only |
| **Annotations** | Library-specific gotchas | PreToolUse on Context7 fetches | Main agent + subagents |
| **Intent topics** | Project-specific patterns | PreToolUse on Edit/Write/Bash | Main agent |
| **MEMORY.md** | Session-persistent index | Loaded at session start | Main agent |

The systems are complementary, not redundant:
- A solution to a bug goes into K-LEAN.
- A behavioral rule ("always read before edit") goes into instincts.
- A library gotcha discovered during a doc fetch goes into annotations.
- An entity relationship (client, service, configuration) goes into mem0.
- A failure pattern that recurs across sessions goes into blind spots.

---

## Related Documentation

- [Architecture](architecture.md): full system load order and data flow
- [Hook Lifecycle](hook-lifecycle.md): UserPromptSubmit, PreToolUse, SubagentStart events
- [Instinct System](instinct-system.md): confidence-scored behavioral patterns (subagent injection)
- [Annotation System](annotation-system.md): per-library gotcha injection (Context7 integration)
- [Intent Classification](intent-classification.md): topic routing for memory files
- [Metabolic States](metabolic-states.md): CRISIS/FOCUS mode suppression of injection
- [SAGE Patterns Guide](SAGE-Patterns-Guide.md): Pattern 5 (Trust Tensor Decay), used in blind spot and instinct decay
