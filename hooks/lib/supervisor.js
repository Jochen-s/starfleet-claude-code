/**
 * Subagent Supervisor Module
 *
 * Erlang OTP-inspired restart policies for subagent dispatch.
 * Tracks failure counts per agent type per session, applies circuit breakers,
 * and provides restart strategy recommendations.
 *
 * Assimilated from Community-Tech-UK/ai-orchestrator supervisor-tree pattern.
 * Clean-room reimplementation for our fleet pipeline (2026-03-28).
 *
 * Strategies:
 *   - one-for-one: restart the failed agent only (default)
 *   - circuit-breaker: after N failures for same agent type, stop trying
 *
 * Usage:
 *   const { Supervisor } = require('./lib/supervisor');
 *   const sup = new Supervisor();
 *
 *   // Before dispatching an agent:
 *   const decision = sup.canDispatch('sonnet-reviewer', 'code-review');
 *   if (decision.allowed) { ... dispatch ... }
 *   else { console.warn(decision.reason); }
 *
 *   // After agent completes:
 *   sup.recordOutcome('sonnet-reviewer', 'code-review', { success: true, durationMs: 5000 });
 *   // or on failure:
 *   sup.recordOutcome('sonnet-reviewer', 'code-review', { success: false, error: 'timeout' });
 *
 *   // Get restart recommendation:
 *   const rec = sup.getRestartRecommendation('sonnet-reviewer', 'code-review');
 *   // { strategy: 'retry', backoffMs: 2000, attemptNumber: 2 }
 *   // { strategy: 'circuit-open', reason: '3 consecutive failures', cooldownMs: 60000 }
 *   // { strategy: 'escalate', reason: 'different error each time', suggestedType: 'general-purpose' }
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const STATE_DIR = path.join(os.homedir(), '.claude', 'cache');
const STATE_FILE = path.join(STATE_DIR, 'supervisor-state.json');

const DEFAULTS = {
  maxConsecutiveFailures: 3,    // Circuit breaker threshold
  backoffBaseMs: 1000,          // Base backoff (doubles each retry)
  backoffMaxMs: 30000,          // Max backoff cap
  circuitCooldownMs: 60000,     // How long circuit stays open
  maxHistoryPerType: 20,        // Outcome history retention per agent type
};

class Supervisor {
  constructor(options = {}) {
    this.config = { ...DEFAULTS, ...options };
    this.state = this._loadState();
  }

  _loadState() {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        // Reset if stale (>1 hour old, different session)
        if (raw.timestamp && (Date.now() - raw.timestamp > 3600000)) {
          return this._freshState();
        }
        return raw;
      }
    } catch { /* ignore */ }
    return this._freshState();
  }

  _freshState() {
    return {
      timestamp: Date.now(),
      agents: {},   // keyed by agentType: { outcomes: [], consecutiveFailures: 0, circuitOpenUntil: 0 }
    };
  }

  _save() {
    try {
      fs.mkdirSync(STATE_DIR, { recursive: true });
      this.state.timestamp = Date.now();
      fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2));
    } catch { /* non-critical */ }
  }

  _getAgent(agentType) {
    if (!this.state.agents[agentType]) {
      this.state.agents[agentType] = {
        outcomes: [],
        consecutiveFailures: 0,
        circuitOpenUntil: 0,
        totalDispatches: 0,
        totalFailures: 0,
      };
    }
    return this.state.agents[agentType];
  }

  /**
   * Check if an agent type can be dispatched.
   * Returns { allowed: boolean, reason?: string }
   */
  canDispatch(agentType, taskType) {
    const agent = this._getAgent(agentType);
    const now = Date.now();

    // Circuit breaker check
    if (agent.circuitOpenUntil > now) {
      const remainingMs = agent.circuitOpenUntil - now;
      return {
        allowed: false,
        reason: `Circuit open for ${agentType}: ${agent.consecutiveFailures} consecutive failures. Cooldown: ${Math.ceil(remainingMs / 1000)}s remaining.`,
        strategy: 'circuit-open',
        cooldownMs: remainingMs,
      };
    }

    // If circuit was open but cooldown expired, allow (half-open state)
    if (agent.consecutiveFailures >= this.config.maxConsecutiveFailures) {
      return {
        allowed: true,
        reason: `Half-open: testing ${agentType} after cooldown. Next failure re-opens circuit.`,
        strategy: 'half-open',
      };
    }

    return { allowed: true, strategy: 'normal' };
  }

  /**
   * Record the outcome of an agent dispatch.
   */
  recordOutcome(agentType, taskType, outcome) {
    const agent = this._getAgent(agentType);
    const record = {
      taskType,
      success: outcome.success,
      durationMs: outcome.durationMs || 0,
      error: outcome.error || null,
      timestamp: Date.now(),
    };

    agent.outcomes.push(record);
    agent.totalDispatches++;

    // Trim history
    if (agent.outcomes.length > this.config.maxHistoryPerType) {
      agent.outcomes = agent.outcomes.slice(-this.config.maxHistoryPerType);
    }

    if (outcome.success) {
      agent.consecutiveFailures = 0;
      agent.circuitOpenUntil = 0; // Reset circuit
    } else {
      agent.consecutiveFailures++;
      agent.totalFailures++;

      // Open circuit if threshold reached
      if (agent.consecutiveFailures >= this.config.maxConsecutiveFailures) {
        agent.circuitOpenUntil = Date.now() + this.config.circuitCooldownMs;
      }
    }

    this._save();
  }

  /**
   * Get restart recommendation after a failure.
   * Returns { strategy, backoffMs?, attemptNumber?, reason?, suggestedType? }
   */
  getRestartRecommendation(agentType, taskType) {
    const agent = this._getAgent(agentType);
    const failures = agent.consecutiveFailures;

    if (failures === 0) {
      return { strategy: 'none', reason: 'No failures recorded' };
    }

    if (failures >= this.config.maxConsecutiveFailures) {
      // Check if errors are diverse (different error each time = not retryable)
      const recentErrors = agent.outcomes
        .slice(-this.config.maxConsecutiveFailures)
        .filter(o => !o.success)
        .map(o => o.error);
      const uniqueErrors = new Set(recentErrors).size;

      if (uniqueErrors >= this.config.maxConsecutiveFailures) {
        // Different error each time: escalate to a different agent type
        const escalationMap = {
          'haiku-explorer': 'general-purpose',
          'sonnet-reviewer': 'general-purpose',
          'sonnet-worker': 'general-purpose',
        };
        return {
          strategy: 'escalate',
          reason: `${failures} failures with ${uniqueErrors} different errors. Agent type may be wrong for this task.`,
          suggestedType: escalationMap[agentType] || 'general-purpose',
        };
      }

      return {
        strategy: 'circuit-open',
        reason: `${failures} consecutive failures for ${agentType}. Circuit breaker engaged.`,
        cooldownMs: this.config.circuitCooldownMs,
      };
    }

    // One-for-one: retry with backoff
    const backoffMs = Math.min(
      this.config.backoffBaseMs * Math.pow(2, failures - 1),
      this.config.backoffMaxMs
    );

    return {
      strategy: 'retry',
      backoffMs,
      attemptNumber: failures + 1,
      reason: `Failure ${failures}/${this.config.maxConsecutiveFailures}. Retrying after ${backoffMs}ms.`,
    };
  }

  /**
   * Get summary statistics for all agent types.
   */
  getSummary() {
    const summary = {};
    for (const [type, agent] of Object.entries(this.state.agents)) {
      const successRate = agent.totalDispatches > 0
        ? ((agent.totalDispatches - agent.totalFailures) / agent.totalDispatches * 100).toFixed(1)
        : 'N/A';
      summary[type] = {
        dispatches: agent.totalDispatches,
        failures: agent.totalFailures,
        successRate: `${successRate}%`,
        consecutiveFailures: agent.consecutiveFailures,
        circuitOpen: agent.circuitOpenUntil > Date.now(),
      };
    }
    return summary;
  }

  /**
   * Reset state (e.g., on new session).
   */
  reset() {
    this.state = this._freshState();
    this._save();
  }
}

module.exports = { Supervisor };
