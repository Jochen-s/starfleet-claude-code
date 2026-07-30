#!/usr/bin/env python3
"""
Citation Verification Script (adapted for Positronic Matrix)

Origin: 199-biotechnologies/claude-deep-research-skill
Pinned commit: 314d085b3357e61823aea6cf6468cca98147c3b2
Source hash: b77a9430aa2c9aec47a88434237879a02db75f87cd35a2429a5d7584f234f6ef
Adapted: 2026-03-25 -- added SSRF protection (K-002), inline citation mode

Catches fabricated citations by checking:
1. DOI resolution (via doi.org)
2. Basic metadata matching (title similarity, year match)
3. URL accessibility verification (SSRF-safe: HTTPS-only + RFC-1918 blocklist)
4. Hallucination pattern detection (generic titles, suspicious patterns)
5. Inline citation mode for grounded research outputs (no Bibliography section needed)

Usage:
    python verify-citations.py --report path/to/synthesis.md
    python verify-citations.py --report path/to/synthesis.md --strict
    python verify-citations.py --report path/to/synthesis.md --inline  # grounded mode
"""

import sys
import argparse
import re
import ipaddress
import socket
from pathlib import Path
from typing import List, Dict, Tuple, Optional
from urllib import request, error
from urllib.parse import quote, urlparse
import json
import time
from datetime import datetime


# SSRF Protection (Fleet K-002): block internal/private network access
BLOCKED_NETWORKS = [
    ipaddress.ip_network('10.0.0.0/8'),
    ipaddress.ip_network('172.16.0.0/12'),
    ipaddress.ip_network('192.168.0.0/16'),
    ipaddress.ip_network('127.0.0.0/8'),
    ipaddress.ip_network('169.254.0.0/16'),  # link-local
    ipaddress.ip_network('::1/128'),          # IPv6 loopback
    ipaddress.ip_network('fc00::/7'),         # IPv6 private
    ipaddress.ip_network('fe80::/10'),        # IPv6 link-local
]

BLOCKED_HOSTNAMES = {'localhost', 'metadata.google.internal', 'metadata'}


def is_ssrf_safe(url: str) -> Tuple[bool, str]:
    """Check if URL is safe to fetch (not targeting internal network)."""
    parsed = urlparse(url)

    # Scheme check: HTTPS only
    if parsed.scheme != 'https':
        return False, f"Non-HTTPS scheme blocked: {parsed.scheme}"

    hostname = parsed.hostname
    if not hostname:
        return False, "No hostname in URL"

    # Blocked hostname check
    if hostname.lower() in BLOCKED_HOSTNAMES:
        return False, f"Blocked hostname: {hostname}"

    # DNS resolution check
    try:
        resolved = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
        for family, _, _, _, sockaddr in resolved:
            ip = ipaddress.ip_address(sockaddr[0])
            for network in BLOCKED_NETWORKS:
                if ip in network:
                    return False, f"Resolved to private IP: {ip} ({network})"
    except socket.gaierror:
        # DNS resolution failed -- URL is unreachable, not an SSRF risk
        return True, "DNS unresolvable (safe but unreachable)"

    return True, "OK"


class CitationVerifier:
    """Verify citations in research report"""

    def __init__(self, report_path: Path, strict_mode: bool = False, inline_mode: bool = False):
        self.report_path = report_path
        self.strict_mode = strict_mode
        self.inline_mode = inline_mode
        self.content = self._read_report()
        self.suspicious = []
        self.verified = []
        self.errors = []
        self.ssrf_blocked = []

        # Hallucination detection patterns
        self.suspicious_patterns = [
            (r'^(A |An |The )?(Study|Analysis|Review|Survey|Investigation) (of|on|into)',
             "Generic academic title pattern"),
            (r'^(Recent|Current|Modern|Contemporary) (Advances|Developments|Trends) in',
             "Generic 'advances' title pattern"),
            (r'^[A-Z][a-z]+ [A-Z][a-z]+: A (Comprehensive|Complete|Systematic) (Review|Analysis|Guide)$',
             "Too perfect, templated structure"),
        ]

    def _read_report(self) -> str:
        """Read report file"""
        try:
            with open(self.report_path, 'r', encoding='utf-8') as f:
                return f.read()
        except Exception as e:
            print(f"ERROR: Cannot read report: {e}", file=sys.stderr)
            sys.exit(1)

    def extract_inline_citations(self) -> List[Dict]:
        """Extract inline URL citations from grounded research output.
        Matches patterns like (https://...) and [text](https://...) common in grounded mode."""
        entries = []
        seen_urls = set()

        # Match markdown links: [text](url)
        for match in re.finditer(r'\[([^\]]+)\]\((https?://[^\s\)]+)\)', self.content):
            url = match.group(2).rstrip('.,;:)')
            if url not in seen_urls:
                seen_urls.add(url)
                entries.append({
                    'num': str(len(entries) + 1),
                    'raw': match.group(0),
                    'title': match.group(1),
                    'year': None,
                    'doi': self._extract_doi(url),
                    'url': url,
                })

        # Match bare parenthetical URLs: (https://...)
        for match in re.finditer(r'\(?(https?://[^\s\)\]]+)\)?', self.content):
            url = match.group(1).rstrip('.,;:)')
            if url not in seen_urls:
                seen_urls.add(url)
                doi = self._extract_doi(url)
                entries.append({
                    'num': str(len(entries) + 1),
                    'raw': url,
                    'title': None,
                    'year': None,
                    'doi': doi,
                    'url': url,
                })

        return entries

    def _extract_doi(self, url: str) -> Optional[str]:
        """Extract DOI from a URL if present."""
        doi_match = re.search(r'doi\.org/(10\.\S+)', url)
        return doi_match.group(1) if doi_match else None

    def extract_bibliography(self) -> List[Dict]:
        """Extract bibliography entries from report"""
        pattern = r'## (?:Bibliography|Sources|References)(.*?)(?=##|\Z)'
        match = re.search(pattern, self.content, re.DOTALL | re.IGNORECASE)

        if not match:
            self.errors.append("No Bibliography/Sources/References section found")
            return []

        bib_section = match.group(1)
        entries = []
        lines = bib_section.strip().split('\n')

        current_entry = None
        for line in lines:
            line = line.strip()
            if not line:
                continue

            # Numbered entries: [N] or N. or - [text](url)
            match_num = re.match(r'^\[(\d+)\]\s+(.+)$', line)
            match_dash = re.match(r'^[-*]\s+\[([^\]]+)\]\((https?://[^\)]+)\)', line)

            if match_num:
                if current_entry:
                    entries.append(current_entry)
                num = match_num.group(1)
                rest = match_num.group(2)
                year_match = re.search(r'\((\d{4})\)', rest)
                title_match = re.search(r'"([^"]+)"', rest)
                doi_match = re.search(r'doi\.org/(10\.\S+)', rest)
                url_match = re.search(r'https?://[^\s\)]+', rest)
                current_entry = {
                    'num': num,
                    'raw': rest,
                    'year': year_match.group(1) if year_match else None,
                    'title': title_match.group(1) if title_match else None,
                    'doi': doi_match.group(1) if doi_match else None,
                    'url': url_match.group(0) if url_match else None,
                }
            elif match_dash:
                if current_entry:
                    entries.append(current_entry)
                title = match_dash.group(1)
                url = match_dash.group(2)
                current_entry = {
                    'num': str(len(entries) + 1),
                    'raw': line,
                    'year': None,
                    'title': title,
                    'doi': self._extract_doi(url),
                    'url': url,
                }
            elif current_entry:
                current_entry['raw'] += ' ' + line

        if current_entry:
            entries.append(current_entry)

        return entries

    def verify_doi(self, doi: str) -> Tuple[bool, Dict]:
        """Verify DOI exists and get metadata."""
        if not doi:
            return False, {}

        # DOI resolution always goes to doi.org (trusted, not SSRF risk)
        try:
            url = f"https://doi.org/{quote(doi)}"
            req = request.Request(url)
            req.add_header('Accept', 'application/vnd.citationstyles.csl+json')

            with request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode('utf-8'))
                return True, {
                    'title': data.get('title', ''),
                    'year': data.get('issued', {}).get('date-parts', [[None]])[0][0],
                    'authors': [
                        f"{a.get('family', '')} {a.get('given', '')}"
                        for a in data.get('author', [])
                    ],
                    'venue': data.get('container-title', '')
                }
        except error.HTTPError as e:
            if e.code == 404:
                return False, {'error': 'DOI not found (404)'}
            return False, {'error': f'HTTP {e.code}'}
        except Exception as e:
            return False, {'error': str(e)}

    def verify_url(self, url: str) -> Tuple[bool, str]:
        """Verify URL is accessible (SSRF-safe)."""
        if not url:
            return False, "No URL"

        # SSRF check (Fleet K-002)
        safe, reason = is_ssrf_safe(url)
        if not safe:
            self.ssrf_blocked.append((url, reason))
            return False, f"SSRF blocked: {reason}"

        try:
            req = request.Request(url, method='HEAD')
            req.add_header('User-Agent', 'Mozilla/5.0 (Research Citation Verifier)')

            with request.urlopen(req, timeout=10) as response:
                if response.status == 200:
                    return True, "URL accessible"
                else:
                    return False, f"HTTP {response.status}"
        except error.HTTPError as e:
            # 403/405 often means the server exists but blocks HEAD -- count as reachable
            if e.code in (403, 405):
                return True, f"Server responded (HTTP {e.code})"
            return False, f"HTTP {e.code}"
        except error.URLError as e:
            return False, f"URL error: {e.reason}"
        except Exception as e:
            return False, f"Connection error: {str(e)[:50]}"

    def detect_hallucination_patterns(self, entry: Dict) -> List[str]:
        """Detect common LLM hallucination patterns in citations."""
        issues = []
        title = entry.get('title', '')

        if not title:
            return issues

        for pattern, description in self.suspicious_patterns:
            if re.match(pattern, title, re.IGNORECASE):
                issues.append(f"Suspicious title pattern: {description}")

        generic_words = ['overview', 'introduction', 'guide', 'handbook', 'manual']
        if any(word in title.lower() for word in generic_words) and len(title.split()) < 5:
            issues.append("Very generic short title")

        if any(x in title.lower() for x in ['tbd', 'todo', 'placeholder', 'example']):
            issues.append("Placeholder text in title")

        if entry.get('year'):
            year = int(entry['year'])
            current_year = datetime.now().year
            if year >= current_year - 1 and not entry.get('doi') and not entry.get('url'):
                issues.append(f"Recent year ({year}) with no verification method")
            if year > current_year:
                issues.append(f"Future year: {year} (current: {current_year})")
            if year < 2000 and any(word in title.lower() for word in ['ai', 'llm', 'gpt', 'transformer']):
                issues.append(f"Anachronistic: pre-2000 ({year}) citing modern AI terms")

        return issues

    def check_title_similarity(self, title1: str, title2: str) -> float:
        """Simple title similarity check (word overlap)."""
        if not title1 or not title2:
            return 0.0

        def normalize(s):
            s = s.lower()
            s = re.sub(r'[^\w\s]', ' ', s)
            return set(s.split())

        words1 = normalize(title1)
        words2 = normalize(title2)

        if not words1 or not words2:
            return 0.0

        overlap = len(words1 & words2)
        total = len(words1 | words2)
        return overlap / total if total > 0 else 0.0

    def verify_entry(self, entry: Dict) -> Dict:
        """Verify a single citation entry."""
        result = {
            'num': entry['num'],
            'status': 'unknown',
            'issues': [],
            'metadata': {},
        }

        # Hallucination detection
        hallucination_issues = self.detect_hallucination_patterns(entry)
        if hallucination_issues:
            result['issues'].extend(hallucination_issues)
            result['status'] = 'suspicious'

        # DOI check
        if entry.get('doi'):
            print(f"  [{entry['num']}] Checking DOI {entry['doi']}...", end=' ', flush=True)
            success, metadata = self.verify_doi(entry['doi'])

            if success:
                result['metadata'] = metadata
                result['status'] = 'verified'
                print("OK")

                if entry.get('title') and metadata.get('title'):
                    similarity = self.check_title_similarity(entry['title'], metadata['title'])
                    if similarity < 0.5:
                        result['issues'].append(f"Title mismatch (similarity: {similarity:.1%})")
                        result['status'] = 'suspicious'

                if entry.get('year') and metadata.get('year'):
                    if int(entry['year']) != int(metadata['year']):
                        result['issues'].append(
                            f"Year mismatch: report says {entry['year']}, DOI says {metadata['year']}")
                        result['status'] = 'suspicious'
            else:
                print(f"FAIL: {metadata.get('error', 'Failed')}")
                result['status'] = 'unverified'
                result['issues'].append(f"DOI resolution failed: {metadata.get('error', 'unknown')}")

        # URL check (if no DOI or DOI failed)
        if entry.get('url') and result['status'] != 'verified':
            print(f"  [{entry['num']}] Checking URL...", end=' ', flush=True)
            url_ok, url_status = self.verify_url(entry['url'])
            if url_ok:
                if result['status'] in ['unknown', 'unverified']:
                    result['status'] = 'url_verified'
                print(f"OK ({url_status})")
            else:
                result['issues'].append(f"URL check failed: {url_status}")
                print(f"FAIL: {url_status}")

        # No verification method at all
        if not entry.get('doi') and not entry.get('url'):
            result['issues'].append("No DOI or URL -- cannot verify")
            result['status'] = 'suspicious'

        return result

    def verify_all(self) -> bool:
        """Verify all citations in the report."""
        print(f"\n{'='*60}")
        print(f"CITATION VERIFICATION: {self.report_path.name}")
        print(f"Mode: {'inline' if self.inline_mode else 'bibliography'}")
        print(f"{'='*60}\n")

        if self.inline_mode:
            entries = self.extract_inline_citations()
        else:
            entries = self.extract_bibliography()
            if not entries and not self.errors:
                # Try inline as fallback
                print("No Bibliography section found, trying inline citation extraction...")
                entries = self.extract_inline_citations()

        if not entries:
            print("No citations found to verify.\n")
            return True

        print(f"Found {len(entries)} citations\n")

        results = []
        for entry in entries:
            result = self.verify_entry(entry)
            results.append(result)
            time.sleep(0.5)  # Rate limiting

        # Summary
        print(f"\n{'='*60}")
        print(f"VERIFICATION SUMMARY")
        print(f"{'='*60}\n")

        verified = [r for r in results if r['status'] == 'verified']
        url_verified = [r for r in results if r['status'] == 'url_verified']
        suspicious = [r for r in results if r['status'] == 'suspicious']
        unverified = [r for r in results if r['status'] in ('unverified', 'unknown')]

        print(f"DOI Verified:  {len(verified)}/{len(results)}")
        print(f"URL Verified:  {len(url_verified)}/{len(results)}")
        print(f"Suspicious:    {len(suspicious)}/{len(results)}")
        print(f"Unverified:    {len(unverified)}/{len(results)}")

        if self.ssrf_blocked:
            print(f"\nSSRF Blocked:  {len(self.ssrf_blocked)}")
            for url, reason in self.ssrf_blocked:
                print(f"  BLOCKED: {url[:60]}... -- {reason}")

        if suspicious:
            print(f"\nSUSPICIOUS CITATIONS (Manual Review Needed):")
            for r in suspicious:
                print(f"\n  [{r['num']}]")
                for issue in r['issues']:
                    print(f"    - {issue}")

        if unverified:
            print(f"\nUNVERIFIED CITATIONS:")
            for r in unverified:
                print(f"  [{r['num']}] {r['issues'][0] if r['issues'] else 'Unknown'}")

        print()

        # Decision
        total_verified = len(verified) + len(url_verified)

        if suspicious and self.strict_mode:
            print("STRICT MODE: Failing due to suspicious citations")
            return False

        if self.strict_mode and unverified:
            print("STRICT MODE: Unverified citations found")
            return False

        if len(results) > 0 and total_verified / len(results) < 0.5:
            print("WARNING: Less than 50% citations verified")

        print("CITATION VERIFICATION COMPLETE")
        return True


def main():
    parser = argparse.ArgumentParser(
        description="Verify citations in research report (SSRF-safe)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python verify-citations.py --report synthesis.md
  python verify-citations.py --report synthesis.md --inline --strict

Note: Requires internet connection to check DOIs.
Uses free DOI resolver - no API key needed.
SSRF protection: blocks RFC-1918, loopback, and non-HTTPS URLs.
        """
    )

    parser.add_argument('--report', '-r', type=str, required=True,
                        help='Path to research report markdown file')
    parser.add_argument('--strict', action='store_true',
                        help='Strict mode: fail on any unverified or suspicious')
    parser.add_argument('--inline', action='store_true',
                        help='Inline citation mode (for grounded research without Bibliography)')

    args = parser.parse_args()
    report_path = Path(args.report)

    if not report_path.exists():
        print(f"ERROR: Report file not found: {report_path}", file=sys.stderr)
        sys.exit(1)

    verifier = CitationVerifier(report_path, strict_mode=args.strict, inline_mode=args.inline)
    passed = verifier.verify_all()
    sys.exit(0 if passed else 1)


if __name__ == '__main__':
    main()
