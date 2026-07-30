# VerifiedRegistry: Anti-Fabrication Protocol for Quantitative Claims

## Purpose

Prevents fabricated numbers from entering research outputs by requiring every quantitative claim to trace to a verified source. Any number that cannot be traced is either removed or explicitly marked [UNVERIFIED].

## When to Use

Apply the VerifiedRegistry protocol when a research output contains:
- Statistics (percentages, counts, measurements)
- Benchmarks (scores, rankings, comparisons)
- Financial figures (costs, revenue, market sizes)
- Temporal claims (dates, durations, frequencies)
- Quantities (star counts, user numbers, download counts)

Do NOT apply to:
- Numbers that are part of code (line counts, version numbers)
- Numbers internal to the analysis methodology (band counts, iteration numbers)
- Rounded estimates explicitly labeled as such

**Scope limitation**: VerifiedRegistry covers quantitative claims only. Qualitative claims (reputation, adoption quality, community health) are out of scope for this protocol but are subject to the claim-sweep gate (Phase 5 of deep-research). Do not treat VerifiedRegistry compliance as a proxy for full anti-fabrication coverage.

## Registry Format

For each quantitative claim in the output, maintain an entry:

| # | Claim | Value | Source | Source Type | Verified | Date Checked | Notes |
|---|-------|-------|--------|-------------|----------|-------------|-------|
| V1 | "GEPA has 2.9K stars" | 2900 | github.com/gepa | [WEB-SOURCE] | YES | 2026-03-24 | Via GitHub API |
| V2 | "Market size is $2.4B" | 2.4B | Gartner 2025 forecast | [GREY-LIT] | NO | - | Cited in secondary source, primary not accessed |
| V3 | "LLM agents score 20-40" | 20-40 | arXiv:2602.18920 | [PREPRINT] | YES | 2026-03-24 | Table 3, ResearchClawBench |
| V4 | "Improves performance by 94%" | 94% | experiment-loop run | [PRIMARY] | YES | 2026-03-28 | experiment-log.tsv, iter 1-10 |

## Source Types

| Type | Meaning | Verification Method |
|------|---------|-------------------|
| [PRIMARY] | Data you generated (experiments, measurements) | Check experiment log or raw data |
| [PEER-REVIEWED] | Published in peer-reviewed venue | DOI lookup, CrossRef verification |
| [PREPRINT] | arXiv, bioRxiv, SSRN | Paper exists at URL, table/figure referenced |
| [GREY-LIT] | Technical reports, documentation | URL accessible, claim found on page |
| [WEB-SOURCE] | Blog, news, forum | URL accessible, claim found on page |
| [SECONDARY] | Cited by another source, primary not accessed | Mark as lower confidence |
| [COMPUTED] | Derived from other verified values | Show computation with source values |

## Verification Status

| Status | Meaning |
|--------|---------|
| YES | Agent accessed the source and confirmed the value |
| NO | Source not directly accessed; value taken from secondary citation |
| PARTIAL | Source accessed but value is approximate (range, estimate) |
| STALE | Value was verified but source may have changed (>30 days old) |
| COMPUTED | Derived from other verified values (show formula) |

## Integration with Existing Quality Gates

### With Claim Sweep Gate (deep-research Phase 5)
The claim sweep identifies all factual claims. The VerifiedRegistry adds the quantitative verification layer:
1. Claim sweep finds: "GEPA has 2.9K stars" [GROUNDED]
2. VerifiedRegistry asks: was 2.9K actually checked? When? How?
3. If checked via GitHub API on 2026-03-24: registry entry with YES
4. If taken from a blog post that mentioned "~3K stars": registry entry with NO + downgrade

### With Evidence Grading (T1-T4)
The evidence grade applies to the claim as a whole. The VerifiedRegistry applies to specific numbers within the claim:
- T1 claim with all registry entries YES: high confidence
- T1 claim with registry entries NO: downgrade to T2 (the numbers need re-verification)
- T4 claim: all registry entries should be NO or absent

### With Scientific Research (claim-evidence table)
The claim-evidence table maps claims to sources. The VerifiedRegistry extends this with:
- The specific numeric value extracted
- When it was last verified
- Whether the value is exact or approximate

## Protocol for Research Skills

### During research (Phase 2-4 of deep-research):
- Each band file MUST include a `## Numbers Found` section with a registry table
- When a subagent finds a number, record it in this section immediately with source URL
- Mark as YES if the agent accessed the source directly
- Mark as NO if the number was found in a secondary source
- This makes the registry a structural output format, not a discipline requirement: the Phase 5 synthesis compiles from these sections

### During synthesis (Phase 5):
- Compile all registry entries from band files
- Resolve conflicts (same metric, different values from different sources)
- Flag stale entries (verified >30 days ago for rapidly changing metrics like star counts)

### Pre-delivery (claim sweep gate):
- Cross-reference: every number in the output must have a registry entry
- Numbers without entries: either verify now or mark [UNVERIFIED]
- Report: "VerifiedRegistry: N values verified, M unverified, K stale"

## Output Format

Append to the end of any research output that contains quantitative claims:

```
## VerifiedRegistry

| # | Claim | Value | Source | Verified | Notes |
|---|-------|-------|--------|----------|-------|
{entries}

Registry summary: {N} verified, {M} unverified, {K} stale
```

## Worked Example

Research output states: "The AI research agent market has grown 340% in 6 months, with autoresearch reaching 53K stars and spawning 55+ derivatives."

Registry:
| # | Claim | Value | Source | Verified | Notes |
|---|-------|-------|--------|----------|-------|
| V1 | "grown 340%" | 340% | - | NO | No source found; likely computed from star growth but methodology unclear. REMOVE or mark [UNVERIFIED] |
| V2 | "6 months" | 6 months | GitHub commit history | PARTIAL | First commit Dec 2025, current Mar 2026 = ~3 months, not 6. CORRECT to "3 months" |
| V3 | "53K stars" | 53000 | github.com/karpathy/autoresearch | YES | Checked 2026-03-24 via GitHub |
| V4 | "55+ derivatives" | 55 | awesome-autoresearch curated list | PARTIAL | List has 55 entries but includes non-derivatives (tools, papers). Approximate. |

Action: Remove V1, correct V2 to "3 months", keep V3, qualify V4 as "55+ related tools (not all derivatives)".

## Anti-Fabrication Rules

1. **Never round to make a number look cleaner** (per aesthetic-laundering-ban instinct)
2. **Never extrapolate from a single data point** without stating the extrapolation
3. **Never present a secondary citation's number as directly verified**
4. **If two sources disagree on a value, report both** with their source types
5. **Star counts, download counts, and user metrics are inherently stale** -- always include the date checked
6. **Computed values must show the formula and source values** (e.g., "94.1% = (0.0523 - 0.0031) / 0.0523")
