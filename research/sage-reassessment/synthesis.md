# Long-Range Sensor Sweep: SAGE Reassessment

**Date**: 2026-03-28
**Bands deployed**: 1 (focused analysis, not parallel sweep)
**Bands completed**: 1/1
**Total sources**: ~6 unique (GitHub repos, HN, web)

## Executive Summary

SAGE (Situation-Aware Governance Engine) is a cognition kernel for edge AI devices, NOT a Claude Code enhancement framework. It orchestrates local LLMs (0.8B-27B) on physical hardware using a 12-step consciousness loop. The only Claude Code-relevant derivative is SNARC, a salience-gated memory plugin (MIT, 6 stars, 51 commits). Three patterns from SNARC were identified as high-value and have been implemented: pre-storage salience scoring, automatic confidence decay, and PostCompact dream-cycle enrichment.

## Key Findings

1. SAGE is a different domain entirely (edge AI cognition kernel vs developer workflow). No direct comparison possible. [HIGH]
2. SNARC extracts SAGE's memory concepts into a Claude Code plugin with 4 hooks, 4 MCP tools, and 4-tier memory. [HIGH]
3. Pre-storage salience scoring (filter at capture, not retrieval) is genuinely novel. Implemented in knowledge-capture.py. [HIGH]
4. Automatic confidence decay prevents stale knowledge accumulation. Implemented in klean-utility-update.py --age-decay. [HIGH]
5. PostCompact dream-cycle enrichment re-injects relevant context after compaction. Implemented in post-compact-enrichment.js. [HIGH]
6. Original fleet evaluation (2026-03-02) identified 5 patterns; 4 of 5 are now implemented or superseded. [HIGH]
7. AGPL-3.0 license on SAGE remains a hard legal barrier. All patterns adopted via clean-room reimplementation. [MEDIUM]

## Cross-Reference: AI Learning Problem + SAGE

| Pattern | Source | Status |
|---------|--------|--------|
| Q-value utility scoring | Learning Problem (MemRL) | DONE |
| Automated failure reflection | Learning Problem (Reflexion) | DONE |
| Sleep-time consolidation | Learning Problem (Letta) | DONE |
| Circular buffer memory | SAGE (2026-03-02 eval) | DONE (prior) |
| Multi-axis salience | SAGE/SNARC | SUPERSEDED by 7-dim fragility |
| Trust tensor decay | SAGE | DONE (confidence + age-decay) |
| Pre-storage salience scoring | SNARC | DONE (today) |
| PostCompact enrichment | SNARC | DONE (today) |
| Per-message context injection | SNARC | DEFERRED (medium cost) |

## Recommendations

1. No further SAGE/SNARC assimilation needed. All high-value patterns extracted.
2. Consider per-message context injection (SNARC UserPromptSubmit pattern) as a future enhancement when K-LEAN search is fast enough for per-message invocation.
3. Monitor SNARC repo for future innovations (MIT license enables adoption).

## Band Reports

- [Band 1: SAGE Analysis](band-1-sage-analysis.md) -- COMPLETE

## Assimilation Status

All 9 identified patterns across both research streams are now implemented or explicitly deferred. The setup has absorbed the practical insights from both the Dupoux-LeCun-Malik framework and the SAGE/SNARC ecosystem without taking any code dependencies.
