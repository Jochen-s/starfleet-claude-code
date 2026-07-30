# Source Verification Guide

## Evaluating Source Quality

### Venue Assessment
- **Tier 1 venues**: Nature, Science, PNAS, top-tier conference proceedings (NeurIPS, ICML, ACL, CVPR)
- **Tier 2 venues**: Established journals with impact factor > 3, well-known conference workshops
- **Tier 3 venues**: Regional journals, new venues, or venues with limited peer review
- **Predatory signals**: Unsolicited email invitations, extremely fast review times (<2 weeks), broad scope with no specialization, missing editorial board, pay-to-publish without peer review

### Author and Institution Assessment
- Established researchers with publication history in the field
- Affiliated with recognized academic or research institutions
- Check for conflicts of interest (industry-funded research on own products)

### Methodology Assessment
- Sample size adequate for the claims made
- Appropriate statistical methods for the research design
- Reproducibility: Can the study be replicated from the description?
- Limitations acknowledged by the authors

## DOI Verification
- Use CrossRef API: `https://api.crossref.org/works/{doi}`
- Verify: title matches, authors match, publication year matches
- If DOI is not found in CrossRef, the citation may be fabricated

## Source Access Strategy
When a source is behind a paywall:
1. Check arXiv for a preprint version
2. Check PubMed Central for open-access version
3. Check the author's personal/institutional website
4. Use Unpaywall API: `https://api.unpaywall.org/v2/{doi}?email=...`
5. If no free version exists, note [ABSTRACT-ONLY] and base extraction on the abstract

## Citation Format
Use the `firstauthorYYYYkeyword` convention:
- `smith2024transformers` for Smith et al., 2024, about transformers
- Use lowercase, no spaces, no special characters
- If ambiguous, add a distinguishing suffix: `smith2024transformers-survey`
