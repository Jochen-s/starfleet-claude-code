# PRISMA Systematic Review Workflow

## When to Use
Invoke with `/scientific-research "<topic>" --systematic` for a PRISMA-compliant systematic review.

## Protocol (Phase 1)

Before searching, define and document:
1. **Research question** (PICO format if applicable: Population, Intervention, Comparison, Outcome)
2. **Inclusion criteria**: publication types, date range, languages, domains
3. **Exclusion criteria**: specific exclusions with rationale
4. **Search strategy**: databases, keywords, Boolean operators
5. **Data extraction plan**: what fields to extract from each source
6. **Quality appraisal method**: how to assess source quality

## Search Execution (Phase 2)

For each database:
1. Record exact search query used
2. Record date of search
3. Record number of results
4. Export all results with metadata

## Screening (Phase 3)

### Title/Abstract Screening
- Apply inclusion/exclusion criteria to title and abstract
- Record decision for each: INCLUDE / EXCLUDE / UNCERTAIN
- For EXCLUDE: record which criterion triggered exclusion

### Full-Text Screening (for INCLUDE and UNCERTAIN)
- Read full text (or abstract if full text unavailable)
- Apply criteria again with full context
- Record final decision

### PRISMA Flow Diagram
Track numbers through the process:
```
Records identified (N)
  |
  v
After deduplication (N)
  |
  v
Title/abstract screened (N)
  |--> Excluded (N, reasons)
  v
Full-text assessed (N)
  |--> Excluded (N, reasons)
  v
Studies included (N)
```

## Extraction (Phase 4)

Use a standardized extraction matrix:
| Source | Design | Population | Key Finding | Effect Size | Quality Score |
|--------|--------|-----------|-------------|-------------|--------------|

## Quality Appraisal

Rate each source on:
- **Study design**: RCT > cohort > case-control > cross-sectional > case report
- **Sample size**: adequate for the claims?
- **Methodology**: clearly described and appropriate?
- **Bias risk**: selection, performance, detection, attrition, reporting
- **Reproducibility**: could the study be replicated?

## Synthesis (Phase 5)

- **Narrative synthesis**: Group by theme, summarize patterns
- **Vote counting**: How many sources support vs. oppose each finding
- **Consistency assessment**: Are findings consistent across sources?
- **Gap identification**: What aspects are not covered?

## Limitations Section (Phase 6)

Mandatory limitations to address:
- Search strategy limitations (databases searched, language bias)
- Publication bias (positive results more likely published)
- Quality of included sources
- Generalizability of findings
- What was not found or could not be assessed
