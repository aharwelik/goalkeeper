#!/usr/bin/env node
// goalkeeper CLI - run a goal-oriented agent with a hard budget + drift guard.
//
// Usage:
//   ANTHROPIC_API_KEY=... goalkeeper "Draft a launch checklist for my app" \
//       --max-usd 0.50 --max-steps 12 --model claude-opus-4-8
//
// Author: Anthony Harwelik <aharwelik@gmail.com>  License: MIT

import { runGoal } from '../src/agent.js';
import { BudgetGovernor } from '../src/budget.js';
import { DriftDetector } from '../src/drift.js';
import { createAnthropicClient } from '../src/llm.js';

function parseArgs(argv) {
  const opts = { maxUsd: 1.0, maxTokens: 200000, maxSteps: 20, model: 'claude-opus-4-8' };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--max-usd') opts.maxUsd = parseFloat(argv[++i]);
    else if (a === '--max-tokens') opts.maxTokens = parseInt(argv[++i], 10);
    else if (a === '--max-steps') opts.maxSteps = parseInt(argv[++i], 10);
    else if (a === '--model') opts.model = argv[++i];
    else if (a === '-h' || a === '--help') opts.help = true;
    else rest.push(a);
  }
  opts.goal = rest.join(' ').trim();
  return opts;
}

const HELP = `goalkeeper - goal-oriented agent with a hard cost governor + drift guard

USAGE:
  goalkeeper "<goal>" [--max-usd 1.0] [--max-tokens 200000] [--max-steps 20] [--model claude-opus-4-8]

Requires ANTHROPIC_API_KEY in the environment.`;

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help || !o.goal) { console.log(HELP); process.exit(o.goal ? 0 : 2); }

  let llm;
  try {
    llm = createAnthropicClient({ model: o.model });
  } catch (e) {
    console.error(`error: ${e.message}\nSet ANTHROPIC_API_KEY and run: npm install @anthropic-ai/sdk`);
    process.exit(2);
  }

  const budget = new BudgetGovernor({ maxUsd: o.maxUsd, maxTokens: o.maxTokens });
  const drift = new DriftDetector({ goal: o.goal });

  console.log(`goal: ${o.goal}`);
  console.log(`budget: $${o.maxUsd} / ${o.maxTokens} tokens / ${o.maxSteps} steps\n`);

  const result = await runGoal({
    goal: o.goal, llm, budget, drift, maxSteps: o.maxSteps,
    onStep: (s) => console.log(`#${s.step} [drift ${s.driftScore}] ${s.action}  ($${s.spentUsd})`),
  });

  console.log(`\nstatus: ${result.status}`);
  console.log(`steps: ${result.summary.steps}  spent: $${result.summary.spentUsd} (${result.summary.spentTokens} tokens)`);
  process.exit(result.status === 'completed' ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
