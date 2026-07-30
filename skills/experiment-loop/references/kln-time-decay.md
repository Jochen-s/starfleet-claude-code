# K-LEAN Time-Decay Schema

Reference: R-5 -- Evolution Store with Time-Decay
Scope: K-LEAN entries used for prompt overlay generation

## Purpose

Prevents stale learnings from occupying prompt overlay slots. Entries
decay in relevance over time; only entries above a minimum floor are
included when the `consolidate` lifecycle script generates overlays.

## Per-Entry Fields

Every K-LEAN entry subject to time-decay carries:

```
created_at: ISO-8601 timestamp (e.g. "2026-03-28T10:00:00Z")
half_life_days: 30
```

These fields are set on entry creation and are not updated on retrieval.

## Relevance Score Formula

```
relevance = base_utility * 2^(-days_since_created / half_life_days)
```

Where:
- `base_utility` is the entry's `utility_score` field (0.0 - 1.0)
- `days_since_created` is computed from `created_at` at overlay generation time
- `half_life_days` defaults to 30 for standard entries

At t=0 (day of creation): relevance = base_utility (no decay)
At t=30 days: relevance = base_utility * 0.5
At t=60 days: relevance = base_utility * 0.25
At t=90 days: relevance = base_utility * 0.125

## Exclusion Floor

```
relevance_floor: 0.1
```

Entries with computed relevance below 0.1 are excluded from prompt
overlays. They remain in the knowledge base for direct lookup via
`/kln:find` -- the floor only gates automatic injection.

## Extended Half-Life for High-Impact Entries

Entries with `utility_score >= 0.8` use an extended half-life of 90 days:

```
half_life_days: 90   (applied automatically by consolidate script)
```

Rationale: high-utility learnings capture rare, hard-won insights
(e.g. credential handling, bcrypt shell variable gotchas). These should
persist in overlays longer than routine patterns.

At t=90 days with extended half-life: relevance = base_utility * 0.5
(equivalent to a standard entry at t=30 days)

## Consolidate Script Integration

The `consolidate` lifecycle script applies this formula during prompt
overlay generation:

1. Read all K-LEAN entries with `created_at` set
2. Compute `relevance` for each entry using the formula above
3. Select entries where `relevance >= relevance_floor`
4. Sort descending by relevance, take top N (default N=5 per topic cluster)
5. Emit selected entries into the overlay; exclude the rest

Entries without `created_at` are treated as legacy entries and are
included without decay (backwards compatible).

## Example Calculation

Entry created 2026-01-28 (59 days before 2026-03-28), utility_score = 0.72:

```
days_since_created = 59
half_life_days = 30   (utility < 0.8, standard half-life)
relevance = 0.72 * 2^(-59/30)
           = 0.72 * 2^(-1.967)
           = 0.72 * 0.258
           = 0.186
```

0.186 >= 0.1 floor, so this entry is included in the overlay.

Same entry at 90 days old: relevance = 0.72 * 2^(-3) = 0.72 * 0.125 = 0.090
0.090 < 0.1 floor -- excluded from overlay, but still searchable.
