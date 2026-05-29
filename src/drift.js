// drift.js - Goal-drift detector.
//
// Autonomous loops wander off the original objective. goalkeeper re-anchors:
// each proposed step is scored for keyword overlap against the ORIGINAL goal.
// If the agent produces `patience` consecutive low-relevance steps, the loop
// halts with a goal_drift status instead of burning budget on a tangent.
//
// Deterministic + dependency-free so it is fully unit-testable.
//
// Author: Anthony Harwelik <aharwelik@gmail.com>  License: MIT

const STOP = new Set(('a an the of to and or for in on at by with is are be do this that '
  + 'it as from into your you we i our will should can could would step next then').split(' '));

export function tokenize(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP.has(w))
  );
}

export class DriftDetector {
  constructor({ goal, threshold = 0.12, patience = 2 } = {}) {
    if (!goal) throw new Error('goal is required');
    this.goalTokens = tokenize(goal);
    this.threshold = threshold;
    this.patience = patience;
    this.streak = 0;
    this.history = [];
  }

  // Jaccard-ish overlap of step tokens against the goal tokens.
  score(text) {
    const t = tokenize(text);
    if (t.size === 0 || this.goalTokens.size === 0) return 0;
    let inter = 0;
    for (const w of t) if (this.goalTokens.has(w)) inter++;
    return inter / Math.min(t.size, this.goalTokens.size);
  }

  observe(text) {
    const score = Math.round(this.score(text) * 1000) / 1000;
    if (score < this.threshold) this.streak++; else this.streak = 0;
    const drift = this.streak >= this.patience;
    this.history.push({ score, streak: this.streak, drift });
    return { score, streak: this.streak, drift };
  }
}
