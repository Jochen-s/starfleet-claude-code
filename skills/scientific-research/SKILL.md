---
name: scientific-research
description: "Rigorous, citation-backed scientific research with evidence grading and claim-evidence tracing. Use when research needs academic-grade citations, source verification, or systematic review methodology. Trigger: /scientific-research, 'research with citations', 'find papers on', 'systematic review', 'literature review'."
tags: [research, scientific, citations, evidence, systematic-review, academic]
---

# /scientific-research -- Citation-Rigorous Research

Conducts sequential, evidence-graded scientific research with inline citations, source verification, and claim-evidence tracing. Designed for outputs suitable for university collaboration, open-source publication, and fact-based decision-making.

**Differentiator from /deep-research:**
- /deep-research = fast, broad, parallel agents, speed-optimized
- /scientific-research = rigorous, sequential, citation-backed, verifiable

## Artifact Naming Convention

All scientific-research artifacts use a consistent topic-slug:
- **Slug derivation**: Lowercase the research question, replace spaces with hyphens, strip punctuation, max 40 chars
- `{slug}-research.md` -- Main research output with YAML frontmatter provenance
- `{slug}-evidence-table.md` -- Claim-evidence mapping table
- `{slug}-sources.bib` -- Bibliography (if --format latex)
- `{slug}-discovery-notes.md` -- Progressive discovery working file

---

## Arguments

- `/scientific-research "<topic>"` -- Standard scientific research
- `/scientific-research "<topic>" --systematic` -- PRISMA-style systematic review
- `/scientific-research "<topic>" --format latex` -- LaTeX-ready output with BibTeX
- `/scientific-research "<topic>" --depth quick|standard|thorough` -- Research depth

## Non-Negotiable Research Integrity Rules

These rules are absolute and cannot be overridden:

1. **NEVER fabricate citations.** Every cited work must be a real, verifiable publication with correct title, authors, venue, and year.
2. **NEVER fabricate statistics.** Every number must trace to a verifiable source or be explicitly labeled [ESTIMATED] or [UNVERIFIED].
3. **Label every source** with its verification status:
   - [PEER-REVIEWED]: Published in a peer-reviewed journal or conference
   - [PREPRINT]: Available on arXiv, bioRxiv, SSRN, medRxiv but not peer-reviewed
   - [GREY-LIT]: Technical reports, white papers, official documentation
   - [WEB-SOURCE]: Blog posts, news articles, forum discussions
   - [UNVERIFIED]: No source found; included based on reasoning only
4. **Grade every key finding** using evidence tiers (T1-T4, see Phase 5).
5. **Trace claims to evidence** using the claim-evidence mapping template.
6. **Prefer primary sources** over secondary summaries or news articles.
7. **State uncertainty explicitly.** "I could not verify this claim" is always preferable to a fabricated citation.

## Workflow Overview

```
Phase 1: Scope          -- Define question, criteria, databases
Phase 2: Discovery      -- Search sources, build candidate list
Phase 3: Screen         -- Apply criteria, label status, log decisions
Phase 4: Extract        -- Per-source structured extraction
Phase 5: Synthesize     -- Cross-source analysis, evidence grading, direction decision
Phase 6: Report         -- Structured output with citations and bibliography
```

---

## Phase 1 -- Scope

**Goal**: Define a precise, answerable research question with clear boundaries.

1. Analyze the user's topic and formulate a specific research question
2. Define inclusion criteria (what sources count):
   - Publication date range (default: last 5 years unless historical context needed)
   - Source types accepted (peer-reviewed, preprints, grey literature)
   - Languages (default: English)
   - Domains/disciplines relevant to the question
3. Define exclusion criteria (what to filter out):
   - Opinion pieces without data
   - Retracted papers
   - Sources below quality threshold
4. Identify target databases:
   - **Semantic Scholar** (broad academic search)
   - **arXiv** (CS, physics, math, biology preprints)
   - **PubMed/MEDLINE** (biomedical literature)
   - **CrossRef** (DOI resolution and metadata verification)
   - **Google Scholar** (broad coverage, use for discovery)
5. If `--systematic` flag: create a formal protocol document per PRISMA guidelines (see references/prisma-workflow.md)

**Output**: Research protocol with question, criteria, and search strategy.

---

## Phase 2 -- Discovery

**Goal**: Build a comprehensive candidate source list.

1. Construct search queries using:
   - Primary keywords from the research question
   - Synonym expansion (e.g., "LLM" OR "large language model")
   - Boolean operators (AND, OR, NOT)
   - Field-specific filters (year, venue, author)
2. Execute searches across target databases:
   - For each source found, record: title, authors, year, venue, DOI/URL, abstract
   - Use Semantic Scholar API patterns: `https://api.semanticscholar.org/graph/v1/paper/search?query=...`
   - For DOI verification: CrossRef API `https://api.crossref.org/works/{doi}`
3. Apply snowball sampling:
   - Check reference lists of highly relevant papers
   - Check "cited by" for seminal works
4. Deduplicate by DOI or title similarity
5. Log discovery statistics: N sources found per database, N after deduplication

**Output**: Candidate source list with metadata.

### Progressive Write Protocol
Write search results to a working file after each search cycle:
- Create `{output-dir}/discovery-notes.md` at phase start
- Append each source found with: citation, relevance score (1-5), key findings
- This file serves as both a progress log and recovery artifact
- If interrupted, the discovery notes survive for the next session

---

## Phase 3 -- Screen

**Goal**: Filter candidates against inclusion/exclusion criteria.

1. For each candidate source:
   - Apply inclusion criteria (date, type, language, domain)
   - Apply exclusion criteria (opinion, retracted, below threshold)
   - Record screening decision: INCLUDE / EXCLUDE / UNCERTAIN
   - For EXCLUDE: record reason
   - For UNCERTAIN: flag for Phase 4 full-text review
2. Label each included source with verification status:
   - [PEER-REVIEWED], [PREPRINT], [GREY-LIT], [WEB-SOURCE]
3. If `--systematic`: maintain a screening log per PRISMA (see references/prisma-workflow.md)
4. Report screening statistics: N screened, N included, N excluded (by reason)

**Output**: Filtered source list with status labels and screening log.

---

## Phase 4 -- Extract

**Goal**: Structured extraction from each included source.

For each included source, extract:

| Field | Description |
|-------|-------------|
| **Citation key** | firstauthorYYYYkeyword format (e.g., smith2024llmagents) |
| **Key findings** | 2-5 bullet points of main results |
| **Methods** | Research methodology, sample size, evaluation approach |
| **Limitations** | Stated limitations and potential biases |
| **Relevance** | How this source addresses the research question (1-3 sentences) |
| **Data points** | Specific numbers, statistics, or quantitative claims with context |
| **Contradictions** | Any findings that contradict other included sources |

If a source is behind a paywall and only the abstract is available, note: "[ABSTRACT-ONLY] Full text not accessible; findings based on abstract."

### Selective Reading
When extracting data from sources:
- Read abstracts and conclusions first (highest information density)
- Only read full methodology sections for T1/T2 sources
- Skip supplementary materials unless specifically needed for a claim
- Write extracted data points to the evidence table immediately, not in batch

**Output**: Extraction matrix (structured per-source summaries).

---

## Phase 5 -- Synthesize

**Goal**: Cross-source analysis with evidence grading and direction decision.

### Cross-Source Analysis
1. Identify themes across sources (group by finding type)
2. Identify agreements (multiple sources support the same claim)
3. Identify contradictions (sources disagree on specific claims)
4. Identify gaps (aspects of the question not covered by any source)

### Evidence Grading

Grade each key finding:

| Grade | Meaning | Criteria |
|-------|---------|----------|
| **T1** | Strong evidence | Multiple peer-reviewed sources agree; methodology sound and reproducible |
| **T2** | Moderate evidence | 1-2 peer-reviewed sources, or strong grey literature with data |
| **T3** | Weak evidence | Single source, preprint only, or limited data |
| **T4** | Unverified | No source found; based on reasoning or extrapolation only |

### Claim-Evidence Mapping

For each key claim in the synthesis, create a mapping entry (see references/claim-evidence-template.md):

| Claim | Grade | Sources | Status | Conditions | Caveats |
|-------|-------|---------|--------|------------|---------|

### Direction Decision

After synthesis, choose a direction:

| Decision | When | Action |
|----------|------|--------|
| **CONCLUDE** | Question answered with sufficient T1/T2 evidence | Proceed to Phase 6 |
| **DEEPEN** | A finding needs more depth (most evidence is T3-T4) | Return to Phase 2 with narrower query |
| **BROADEN** | Gaps identified; adjacent areas need exploration | Return to Phase 2 with expanded query |
| **PIVOT** | Question was wrong or findings suggest a better question | Return to Phase 1 with new question |

Maximum 2 PIVOTs. Maximum 3 total rounds (initial + 2 iterations).

**Quality gate**: If more than 50% of key findings are T4, the research is LOW CONFIDENCE. Flag this explicitly and recommend DEEPEN.

**Output**: Synthesis with evidence grades, claim-evidence map, direction decision.

---

## Phase 6 -- Report

**Goal**: Structured output with inline citations, bibliography, and verification status.

### Claim Sweep Gate (pre-delivery)

Before generating the final report, perform a claim sweep:

1. **List every factual claim** from the Phase 5 synthesis
2. **For each claim**, verify it traces to the claim-evidence mapping table
3. **Grade each claim**: GROUNDED (T1-T3 source), INFERRED (reasoning), UNGROUNDED (no source)
4. **Action**: Remove or flag [UNVERIFIED] any ungrounded claims. Never deliver ungrounded claims unmarked.
5. **Report**: "Claim sweep: N grounded, N inferred, N ungrounded (removed/flagged)"

If more than 30% of claims are ungrounded, return to Phase 5 for additional synthesis before reporting.

### Provenance Tracking

Every research output MUST include a provenance block as YAML frontmatter at the top of the report file:

```yaml
---
provenance:
  date: YYYY-MM-DD
  skill: scientific-research
  question: "[exact research question]"
  rounds: N
  sources_found: N
  sources_screened: N
  sources_included: N
  sources_excluded: N
  evidence_quality: "N% T1, N% T2, N% T3, N% T4"
  confidence: HIGH|MEDIUM|LOW
  direction_decisions: ["CONCLUDE at round 1"]
  claim_sweep: "N grounded, N inferred, N ungrounded"
  pivots: 0
---
```

This frontmatter makes every research artifact self-documenting and auditable.
Do NOT create a separate .provenance.md sidecar file; embed provenance in the artifact itself.

### Report Structure

```markdown
# Scientific Research Report: [Topic]

**Research question**: [precise question from Phase 1]
**Date**: [YYYY-MM-DD]
**Sources analyzed**: [N included / N screened]
**Evidence quality**: [% T1, % T2, % T3, % T4]
**Overall confidence**: [HIGH (>60% T1+T2) | MEDIUM (40-60% T1+T2) | LOW (<40% T1+T2)]

## Key Findings

[Numbered findings with inline citations and evidence grades]

1. [Finding text] [T1, smith2024llmagents, jones2025research]
2. [Finding text] [T2, doe2024survey]

## Analysis

[Cross-source narrative with inline citations]

## Claim-Evidence Map

[Full claim-evidence table from Phase 5]

## Limitations

[Research limitations, gaps, and caveats]

## Direction Decision

[CONCLUDE/DEEPEN/BROADEN/PIVOT with rationale]

## Bibliography

[Full bibliography in citation-key alphabetical order]

- smith2024llmagents: Smith, J. et al. (2024). "Title." Venue. DOI. [PEER-REVIEWED]
- jones2025research: Jones, A. (2025). "Title." arXiv:XXXX.XXXXX. [PREPRINT]

## Verification Status

[Summary: N sources verified, N unverified, N abstract-only]
```

### LaTeX output (if `--format latex`)

Generate a LaTeX-compatible version with `\cite{}` commands and a `.bib` file structured as:

```bibtex
@article{smith2024llmagents,
  author    = {Smith, John and Doe, Jane},
  title     = {Title of the Paper},
  journal   = {Venue Name},
  year      = {2024},
  doi       = {10.xxxx/xxxxx},
  note      = {[PEER-REVIEWED]}
}
```

---

## Reference Files

For detailed guidance on specific aspects, consult:
- `references/source-verification.md` -- How to evaluate and verify sources
- `references/claim-evidence-template.md` -- Claim-evidence mapping format
- `references/prisma-workflow.md` -- PRISMA systematic review methodology
