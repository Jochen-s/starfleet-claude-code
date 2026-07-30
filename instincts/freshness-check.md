**Confidence**: 0.78
**Source**: fleet-command full (3/5 factions: Federation, Klingon, Borg)
**source_entry_ids**: []
**Created**: 2026-03-08
**Last validated**: 2026-03-08
**failure_mode**: stale-data

When output depends on volatile data (versions, CVEs, API pricing,
deprecation status), verify against authoritative sources first.

Authoritative sources (not blogs or Stack Overflow):
- Package versions: npmjs.com, pypi.org, crates.io, GitHub releases
- Container images: hub.docker.com, ghcr.io
- CVEs: nvd.nist.gov, GitHub Security Advisories
- API docs: vendor documentation sites
- Compatibility: official migration/upgrade guides

Do NOT use cached training data for anything with a release cycle.
Do NOT use open web search as sole source for version claims.

When verification is impossible, disclose explicitly:
"Based on training data as of [cutoff] -- verify at [source]."

For code imports, use the project's lock file as ground truth.
