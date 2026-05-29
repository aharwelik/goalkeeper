// Offline test suite for goalkeeper. Uses a FAKE model client, so it runs with
// zero network and no API key -- yet exercises the real loop, budget, and drift
// logic that back the project's headline claims.
import assert from 'node:assert';
import { BudgetGovernor } from '../src/budget.js';
import { DriftDetector, tokenize } from '../src/drift.js';
import { TaskQueue } from '../src/tasks.js';
import { runGoal } from '../src/agent.js';

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log('  PASS  ' + name); pass++; }
  catch (e) { console.log('  FAIL  ' + name + '  -> ' + e.message); fail++; }
}
async function ta(name, fn) {
  try { await fn(); console.log('  PASS  ' + name); pass++; }
  catch (e) { console.log('  FAIL  ' + name + '  -> ' + e.message); fail++; }
}

// fake client: scripted responses, each "costs" tokens
function fakeLLM(scripts) {
  let i = 0;
  return { complete: async () => scripts[Math.min(i++, scripts.length - 1)] };
}

console.log('== budget ==');
t('records cost and reports spend', () => {
  const b = new BudgetGovernor({ maxUsd: 1 });
  b.record('claude-opus-4-8', 1000, 1000);
  assert.ok(b.spentUsd > 0, 'spentUsd should be > 0');
  assert.strictEqual(b.spentTokens, 2000);
});
t('exhausts at token ceiling', () => {
  const b = new BudgetGovernor({ maxTokens: 1500 });
  b.record('claude-opus-4-8', 1000, 1000);
  assert.strictEqual(b.exhausted(), true);
});
t('rejects invalid ceilings', () => {
  assert.throws(() => new BudgetGovernor({ maxUsd: 0 }));
});

console.log('== drift ==');
t('tokenize drops stopwords', () => {
  const s = tokenize('The agent should deploy the website');
  assert.ok(s.has('deploy') && s.has('website') && !s.has('the'));
});
t('on-goal step scores high, off-goal scores low', () => {
  const d = new DriftDetector({ goal: 'deploy the marketing website to production' });
  assert.ok(d.score('deploy website to production servers') > 0.2);
  assert.ok(d.score('write a poem about cats') < 0.12);
});
t('flags drift after patience consecutive tangents', () => {
  const d = new DriftDetector({ goal: 'migrate the database to postgres', patience: 2 });
  assert.strictEqual(d.observe('plan the postgres migration').drift, false);
  assert.strictEqual(d.observe('order a pizza for lunch').drift, false);
  assert.strictEqual(d.observe('watch a movie tonight').drift, true);
});

console.log('== tasks ==');
t('queue orders by priority then insertion', () => {
  const q = new TaskQueue(['a']);
  q.add('b', 5); q.add('c', 0);
  assert.strictEqual(q.next().task, 'b');
  q.complete(q.next().id);
  assert.strictEqual(q.pending, 2);
});

console.log('== agent loop ==');
await ta('completes when model signals done', async () => {
  const llm = fakeLLM([
    { action: 'outline the launch checklist', result: 'drafted', done: false, usage: { model: 'claude-opus-4-8', inTok: 100, outTok: 100 } },
    { action: 'finalize launch checklist items', result: 'done', done: true, usage: { model: 'claude-opus-4-8', inTok: 100, outTok: 100 } },
  ]);
  const r = await runGoal({ goal: 'create a product launch checklist', llm, maxSteps: 10 });
  assert.strictEqual(r.status, 'completed');
  assert.strictEqual(r.steps.length, 2);
});
await ta('stops at budget before maxSteps (anti-runaway)', async () => {
  const llm = fakeLLM([{ action: 'keep working on the launch checklist', result: 'x', done: false, usage: { model: 'claude-opus-4-8', inTok: 5000, outTok: 5000 } }]);
  const budget = new BudgetGovernor({ maxTokens: 12000 });
  const r = await runGoal({ goal: 'create a launch checklist', llm, budget, maxSteps: 100 });
  assert.strictEqual(r.status, 'budget_exhausted');
  assert.ok(r.steps.length < 100, 'should stop well before maxSteps');
});
await ta('halts on goal drift (anti-tangent)', async () => {
  const llm = fakeLLM([
    { action: 'plan the launch checklist', result: '', done: false, usage: { model: 'claude-opus-4-8', inTok: 50, outTok: 50 } },
    { action: 'browse vacation destinations', result: '', done: false, usage: { model: 'claude-opus-4-8', inTok: 50, outTok: 50 } },
    { action: 'read celebrity gossip news', result: '', done: false, usage: { model: 'claude-opus-4-8', inTok: 50, outTok: 50 } },
  ]);
  const r = await runGoal({ goal: 'create a product launch checklist', llm, drift: new DriftDetector({ goal: 'create a product launch checklist', patience: 2 }), maxSteps: 20 });
  assert.strictEqual(r.status, 'goal_drift');
});

console.log(`\nResult: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
