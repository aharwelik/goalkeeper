// budget.js - Hard cost governor for an autonomous agent.
//
// The #1 complaint about goal-driven agents (AutoGPT/BabyAGI lineage) is
// runaway token spend. goalkeeper makes the budget a first-class object the
// loop checks every step, so an agent physically cannot exceed the ceiling.
//
// Author: Anthony Harwelik <aharwelik@gmail.com>  License: MIT

// Illustrative prices per 1K tokens; override via constructor.
export const DEFAULT_PRICES = {
  'claude-opus-4-8':   { in: 0.015, out: 0.075 },
  'claude-sonnet-4-6': { in: 0.003, out: 0.015 },
  'claude-haiku-4-5':  { in: 0.0008, out: 0.004 },
};

export class BudgetGovernor {
  constructor({ maxTokens = Infinity, maxUsd = Infinity, prices = DEFAULT_PRICES } = {}) {
    if (maxTokens <= 0) throw new Error('maxTokens must be > 0');
    if (maxUsd <= 0) throw new Error('maxUsd must be > 0');
    this.maxTokens = maxTokens;
    this.maxUsd = maxUsd;
    this.prices = prices;
    this._tokens = 0;
    this._usd = 0;
    this.ledger = [];
  }

  priceFor(model) {
    if (this.prices[model]) return this.prices[model];
    const key = Object.keys(this.prices).find(k => model && model.includes(k.split('-').slice(0, 2).join('-')));
    return key ? this.prices[key] : { in: 0, out: 0 };
  }

  costOf(model, inTok, outTok) {
    const p = this.priceFor(model);
    return (inTok / 1000) * p.in + (outTok / 1000) * p.out;
  }

  record(model, inTok = 0, outTok = 0) {
    const cost = this.costOf(model, inTok, outTok);
    this._tokens += inTok + outTok;
    this._usd += cost;
    this.ledger.push({ model, inTok, outTok, cost });
    return cost;
  }

  get spentTokens() { return this._tokens; }
  get spentUsd() { return Math.round(this._usd * 1e6) / 1e6; }
  remainingTokens() { return Math.max(0, this.maxTokens - this._tokens); }
  remainingUsd() { return this.maxUsd === Infinity ? Infinity : Math.max(0, this.maxUsd - this._usd); }
  exhausted() { return this._tokens >= this.maxTokens || this._usd >= this.maxUsd; }
}
