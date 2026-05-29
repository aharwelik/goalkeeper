// agent.js - The goalkeeper loop.
//
// A deliberately small loop (the 2026 lesson: fewer moving parts win). Every
// iteration: ask the model for the next concrete step, record its token usage
// against the BudgetGovernor, score it for goal drift, and stop the moment any
// guardrail trips. The model client is injected, so the whole loop is testable
// offline with a fake.
//
// Author: Anthony Harwelik <aharwelik@gmail.com>  License: MIT

import { BudgetGovernor } from './budget.js';
import { DriftDetector } from './drift.js';

export async function runGoal({
  goal,
  llm,
  budget = new BudgetGovernor(),
  drift = new DriftDetector({ goal }),
  maxSteps = 25,
  onStep = null,
} = {}) {
  if (!goal) throw new Error('goal is required');
  if (!llm || typeof llm.complete !== 'function') throw new Error('llm.complete(fn) is required');

  const steps = [];
  let status = 'in_progress';

  for (let step = 1; step <= maxSteps; step++) {
    if (budget.exhausted()) { status = 'budget_exhausted'; break; }

    const resp = await llm.complete({ goal, history: steps, remaining: budget.remainingUsd() });
    if (resp && resp.usage) budget.record(resp.usage.model, resp.usage.inTok || 0, resp.usage.outTok || 0);

    const text = (resp && (resp.action || resp.result)) || '';
    const d = drift.observe(text);

    const entry = {
      step,
      action: resp?.action ?? '',
      result: resp?.result ?? '',
      done: !!resp?.done,
      driftScore: d.score,
      spentUsd: budget.spentUsd,
      spentTokens: budget.spentTokens,
    };
    steps.push(entry);
    if (onStep) onStep(entry);

    if (d.drift) { status = 'goal_drift'; break; }
    if (resp?.done) { status = 'completed'; break; }
    if (budget.exhausted()) { status = 'budget_exhausted'; break; }
  }
  if (status === 'in_progress') status = 'max_steps';

  return {
    goal,
    status,
    steps,
    summary: {
      steps: steps.length,
      spentUsd: budget.spentUsd,
      spentTokens: budget.spentTokens,
      remainingUsd: budget.remainingUsd(),
    },
  };
}
