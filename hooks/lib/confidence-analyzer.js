/**
 * 4-Signal Confidence Analyzer
 *
 * Quantifies confidence in text output using 4 independent signals:
 *   1. Explicit markers (35%) - "I'm confident", "[HIGH]", confidence scores
 *   2. Linguistic hedging (25%) - "might", "perhaps", "I think", "possibly"
 *   3. Consistency (25%) - Agreement across multiple inputs (cross-agent)
 *   4. Evidence density (15%) - Citations, file refs, code blocks, URLs
 *
 * Assimilated from Community-Tech-UK/ai-orchestrator confidence-analysis pattern.
 * Clean-room reimplementation for our fleet/review pipeline (2026-03-28).
 *
 * Usage:
 *   const { analyzeConfidence } = require('./lib/confidence-analyzer');
 *   const result = analyzeConfidence(text);
 *   // result = { score: 0.72, signals: {...}, verdict: 'MEDIUM' }
 *
 *   // Cross-agent consistency:
 *   const result = analyzeConfidence(text, { peerTexts: [agentA, agentB] });
 */

'use strict';

// Signal 1: Explicit confidence markers (35% weight)
const EXPLICIT_HIGH = [
  /\bconfiden(?:t|ce)\s*(?::|is|=)\s*(?:high|0\.[89]\d*|1\.0|9\d?%|10\d?%)/i,
  /\[HIGH\]/,
  /\bstrongly\s+(?:believe|recommend|suggest)\b/i,
  /\bconfidence\s*(?::|=)\s*0\.[89]/i,
  /\bcertainly\b/i,
  /\bdefinitely\b/i,
  /\bwithout\s+(?:a\s+)?doubt\b/i,
];

const EXPLICIT_LOW = [
  /\bconfiden(?:t|ce)\s*(?::|is|=)\s*(?:low|0\.[0-4]\d*|[0-4]\d?%)/i,
  /\[LOW\]/,
  /\b(?:un)?verifi?ed\b/i,
  /\bnot\s+(?:confident|certain|sure)\b/i,
  /\bI\s+don'?t\s+know\b/i,
  /\bcannot\s+(?:confirm|verify)\b/i,
];

function scoreExplicit(text) {
  let highCount = 0;
  let lowCount = 0;
  for (const pat of EXPLICIT_HIGH) {
    const matches = text.match(new RegExp(pat, 'gi'));
    if (matches) highCount += matches.length;
  }
  for (const pat of EXPLICIT_LOW) {
    const matches = text.match(new RegExp(pat, 'gi'));
    if (matches) lowCount += matches.length;
  }
  const total = highCount + lowCount;
  if (total === 0) return 0.5; // neutral when no explicit markers
  return Math.min(1, Math.max(0, highCount / total));
}

// Signal 2: Linguistic hedging (25% weight) - inverted: more hedging = lower confidence
const HEDGE_WORDS = [
  /\bmight\b/gi,
  /\bperhaps\b/gi,
  /\bpossibly\b/gi,
  /\bprobably\b/gi,
  /\bcould\s+be\b/gi,
  /\bI\s+think\b/gi,
  /\bI\s+believe\b/gi,
  /\bit\s+seems?\b/gi,
  /\bappears?\s+to\b/gi,
  /\blikely\b/gi,
  /\bunlikely\b/gi,
  /\bunclear\b/gi,
  /\bnot\s+(?:entirely\s+)?sure\b/gi,
  /\bassum(?:e|ing|ption)\b/gi,
  /\bspeculat(?:e|ion|ing)\b/gi,
  /\btentative(?:ly)?\b/gi,
  /\broughly\b/gi,
  /\bapproximately\b/gi,
];

const ASSERT_WORDS = [
  /\bclearly\b/gi,
  /\bevident(?:ly)?\b/gi,
  /\bconfirmed?\b/gi,
  /\bverified?\b/gi,
  /\bproven\b/gi,
  /\bdemonstrat(?:e[ds]?|ing)\b/gi,
  /\bestablish(?:ed|es)?\b/gi,
  /\bconclusive(?:ly)?\b/gi,
];

function scoreLinguistic(text) {
  let hedgeCount = 0;
  let assertCount = 0;
  for (const pat of HEDGE_WORDS) {
    const matches = text.match(pat);
    if (matches) hedgeCount += matches.length;
  }
  for (const pat of ASSERT_WORDS) {
    const matches = text.match(pat);
    if (matches) assertCount += matches.length;
  }
  const total = hedgeCount + assertCount;
  if (total === 0) return 0.5; // neutral
  // Inverted: more assertions relative to hedges = higher confidence
  return Math.min(1, Math.max(0, assertCount / total));
}

// Signal 3: Cross-agent consistency (25% weight)
// Requires peerTexts option. Without peers, returns neutral 0.5.
function scoreConsistency(text, peerTexts) {
  if (!peerTexts || peerTexts.length === 0) return 0.5;

  // Extract key claims: sentences containing "should", "must", "is", "are", recommendations
  const extractClaims = (t) => {
    const sentences = t.split(/[.!?\n]+/).filter(s => s.trim().length > 20);
    return sentences.map(s => s.trim().toLowerCase().replace(/\s+/g, ' '));
  };

  const myClaims = extractClaims(text);
  if (myClaims.length === 0) return 0.5;

  // Jaccard-like similarity: what fraction of my claims appear in peer texts?
  let agreements = 0;
  for (const claim of myClaims) {
    const claimWords = new Set(claim.split(' ').filter(w => w.length > 3));
    for (const peer of peerTexts) {
      const peerLower = peer.toLowerCase();
      // Count word overlap as proxy for semantic agreement
      let overlap = 0;
      for (const word of claimWords) {
        if (peerLower.includes(word)) overlap++;
      }
      const overlapRatio = claimWords.size > 0 ? overlap / claimWords.size : 0;
      if (overlapRatio > 0.4) { // 40% word overlap = agreement
        agreements++;
        break; // one peer agreeing is enough
      }
    }
  }

  return Math.min(1, agreements / myClaims.length);
}

// Signal 4: Evidence density (15% weight)
const EVIDENCE_PATTERNS = [
  /https?:\/\/[^\s)]+/g,                    // URLs
  /`[^`]{3,}`/g,                             // inline code
  /```[\s\S]*?```/g,                         // code blocks
  /\b[A-Za-z0-9_/.-]+\.[a-z]{1,4}:\d+\b/g, // file:line references
  /\((?:source|ref|see|from):/gi,            // citation markers
  /\[(?:HIGH|MEDIUM|LOW)\]/g,                // confidence tags
  /Table \d+|Figure \d+|Section \d+/gi,      // document references
];

function scoreEvidence(text) {
  let evidenceCount = 0;
  for (const pat of EVIDENCE_PATTERNS) {
    const matches = text.match(pat);
    if (matches) evidenceCount += matches.length;
  }

  // Normalize: 0 evidence = 0.1 (not zero; absence of evidence isn't proof of wrong)
  // 1-3 pieces = 0.3-0.5, 4-8 = 0.6-0.8, 9+ = 0.9-1.0
  const wordCount = text.split(/\s+/).length;
  const density = wordCount > 0 ? evidenceCount / (wordCount / 100) : 0; // per 100 words
  if (density === 0) return 0.1;
  if (density < 1) return 0.3 + density * 0.2;
  if (density < 3) return 0.5 + (density - 1) * 0.15;
  return Math.min(1.0, 0.8 + (density - 3) * 0.05);
}

// Weights (from ai-orchestrator pattern)
const WEIGHTS = {
  explicit: 0.35,
  linguistic: 0.25,
  consistency: 0.25,
  evidence: 0.15,
};

/**
 * Analyze confidence of a text output.
 *
 * @param {string} text - The text to analyze
 * @param {object} [options] - Optional configuration
 * @param {string[]} [options.peerTexts] - Peer agent outputs for consistency scoring
 * @returns {{ score: number, signals: object, verdict: string }}
 */
function analyzeConfidence(text, options = {}) {
  if (!text || typeof text !== 'string') {
    return { score: 0, signals: {}, verdict: 'UNKNOWN' };
  }

  const signals = {
    explicit: scoreExplicit(text),
    linguistic: scoreLinguistic(text),
    consistency: scoreConsistency(text, options.peerTexts),
    evidence: scoreEvidence(text),
  };

  const score = Math.round((
    signals.explicit * WEIGHTS.explicit +
    signals.linguistic * WEIGHTS.linguistic +
    signals.consistency * WEIGHTS.consistency +
    signals.evidence * WEIGHTS.evidence
  ) * 100) / 100;

  let verdict;
  if (score >= 0.75) verdict = 'HIGH';
  else if (score >= 0.50) verdict = 'MEDIUM';
  else if (score >= 0.25) verdict = 'LOW';
  else verdict = 'VERY_LOW';

  return { score, signals, verdict };
}

module.exports = { analyzeConfidence, scoreExplicit, scoreLinguistic, scoreConsistency, scoreEvidence };
