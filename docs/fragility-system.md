# Fragility System -- Per-File Risk Scoring

> "It is possible to commit no mistakes and still lose. That is not a weakness.
> That is life."
> -- Captain Jean-Luc Picard

The fragility system assesses how risky it is to modify a given file. It uses git history and code metrics to compute a multi-signal score, assigns files to action stations, and warns the agent before touching high-risk files.

## How It Works

1. **SessionStart**: `fragility-cache-builder.js` pre-computes scores for all tracked files
2. **PreToolUse** (Edit/Write): `fragility-hook.js` looks up the file in cache and emits an advisory
3. **Cache miss**: If a file is not in cache, the hook scores it incrementally (~50-100ms)

## The Seven Signals

Each file is scored on seven signals, each normalized to 0.0-1.0:

| Signal | Weight | What it measures | High value means |
|--------|--------|------------------|-----------------|
| **Churn** | 25% | Commits in last 90 days / 20 | File changes frequently |
| **Bug-fix ratio** | 20% | Bug-fix commits / total commits | Many changes are fixes |
| **Coupling** | 15% | How many files co-change with this one | Changes cascade |
| **Authors** | 10% | Bus factor (1 author = 1.0, 4+ = 0.1) | Knowledge concentrated |
| **Size** | 10% | Line count / 500 | Large, complex file |
| **Recency** | 10% | How recently the file was last modified | Recently active |
| **Test coverage** | 10% | Inverse coverage (higher = less tested) | Under-tested code |

The weighted sum produces a composite score between 0.0 and 1.0.

## Action Stations

The composite score maps to an action station:

| Score Range | Station | Label | Behavior |
|-------------|---------|-------|----------|
| 0.00-0.30 | Station 0 | Low | No advisory. Proceed normally. |
| 0.31-0.60 | Station 1 | Moderate | Brief advisory: "File fragility: 0.45 (moderate). Top signal: churn." |
| 0.61-0.80 | Station 2 | High | Full advisory with signals, blast radius, axis analysis. Quality gate escalation suggested. |
| 0.81-1.00 | Station 3 | Critical | Strong warning. Human review strongly recommended. |

Station classification aligns with the risk classification system from `rules/risk-classification.md`:

- **Station 0**: Read-only equivalent -- no concerns
- **Station 1**: Standard file edit -- normal review
- **Station 2**: High-fragility file -- run the failure-mode checklist
- **Station 3**: Critical fragility -- human confirmation before proceeding

## Multi-Axis Salience (SAGE Pattern 4)

For Station 2+ files, the system also computes five risk axes that explain *why* the file is risky:

| Axis | Formula | What it tells you |
|------|---------|-------------------|
| **Volatility** | churn * 0.7 + recency * 0.3 | Is the file in a period of rapid change? |
| **Novelty** | recency - churn * 0.5 + 0.3 | Is this a new file with little track record? |
| **Coupling** | Direct from coupling signal | Do changes here cascade to other files? |
| **Coverage** | Direct from test coverage signal | Is the file adequately tested? |
| **Contention** | authors * 0.5 + bugFix * 0.5 | Is ownership disputed? Do fixes keep recurring? |

Each axis gets a label at three levels:

| Axis | Low (<0.33) | Mid (0.33-0.66) | High (>0.66) |
|------|-------------|------------------|--------------|
| Volatility | stable | active | volatile |
| Novelty | established | maturing | novel |
| Coupling | isolated | connected | entangled |
| Coverage | covered | partial | exposed |
| Contention | owned | shared | contested |

### Example Advisory (Station 2)

```
FRAGILE FILE (score: 0.72, Station 2). Signals: churn (0.8), bugFix (0.6).
Blast radius: config.ts, utils.ts. Dominant axis: volatility (volatile).
Elevated: volatility:0.8, contention:0.6. Consider quality gate escalation.
```

This tells the developer: the file is risky primarily because it is churning (volatile) and has contention issues, and changes here affect `config.ts` and `utils.ts`.

## Cache Architecture

The fragility cache is a JSON file at `~/.claude/cache/fragility-scores.json`:

```json
{
  "version": 2,
  "files": {
    "src/api/users.ts": {
      "score": 0.72,
      "station": 2,
      "signals": {
        "churn": 0.8, "authors": 0.7, "size": 0.3,
        "coupling": 0.4, "recency": 0.6, "bugFix": 0.6, "testCoverage": 0.5
      },
      "blastRadius": ["src/api/config.ts", "src/utils.ts"],
      "topSignal": "churn",
      "axes": {
        "volatility": 0.74, "novelty": 0.5, "coupling": 0.4,
        "coverage": 0.5, "contention": 0.65
      },
      "dominantAxis": "volatility"
    }
  },
  "stats": { "totalFiles": 42 },
  "_hash": "a1b2c3d4e5f6g7h8"
}
```

**Integrity verification**: The cache includes a SHA-256 hash (first 16 hex chars) computed over the version, files, and stats. If the hash does not match on load, the cache is treated as corrupted and rebuilt.

**Size limits**: Maximum cache size is 1MB. Maximum files tracked: 500.

## Incremental Scoring

When a file is not in the pre-built cache (new file, or file not tracked), the fragility hook computes an incremental score on the fly:

- Runs the same 7 signals, but skips coupling analysis (too expensive for a single file)
- Sets test coverage to the conservative default of 1.0 (assumes no coverage)
- Takes ~50-100ms (dominated by git log queries)
- Saves the result back to cache for future lookups

## Integration with Quality Gates

The fragility system feeds into quality gate escalation:

1. Station 2 files trigger a suggestion to escalate to L4+ review
2. Station 3 files trigger a strong recommendation for human review
3. The `/evaluate` skill considers file sensitivity when suggesting next review level
4. Fleet Command can use fragility data to weight findings from different factions

## Related Documentation

- [Architecture](architecture.md) -- where fragility fits in the system
- [Hook Lifecycle](hook-lifecycle.md) -- PreToolUse event flow
- [Quality Gates](quality-gates.md) -- how action stations map to review levels
- [SAGE Patterns Guide](SAGE-Patterns-Guide.md) -- Pattern 4 (Multi-Axis Salience)
