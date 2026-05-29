// llm.js - Anthropic client adapter for goalkeeper.
//
// Produces an object with `.complete({goal, history})` that asks Claude for the
// single next step toward the goal and returns { action, result, done, usage }.
// The SDK is imported lazily so the rest of the package (and the test suite)
// has zero hard dependency on it.
//
// Author: Anthony Harwelik <aharwelik@gmail.com>  License: MIT

const SYSTEM = `You are goalkeeper, a disciplined goal-oriented agent.
Rules:
- Propose exactly ONE concrete next step toward the user's GOAL.
- Stay strictly anchored to the GOAL; do not pursue tangents.
- Respond ONLY with minified JSON: {"action":"<the step you will take>","result":"<what it produced or expected outcome>","done":<true|false>}.
- Set done=true only when the GOAL is fully achieved.`;

function buildUserPrompt(goal, history) {
  const recent = (history || []).slice(-6)
    .map(h => `#${h.step} action: ${h.action} | result: ${h.result}`)
    .join('\n');
  return `GOAL: ${goal}\n\nPROGRESS SO FAR:\n${recent || '(none yet)'}\n\nReturn JSON for the next step only.`;
}

function extractJson(text) {
  if (!text) return null;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

export function createAnthropicClient({ apiKey = process.env.ANTHROPIC_API_KEY, model = 'claude-opus-4-8', maxTokens = 1024 } = {}) {
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required to create a live client');
  let sdk = null;
  async function getSdk() {
    if (!sdk) {
      const mod = await import('@anthropic-ai/sdk');
      const Anthropic = mod.default || mod.Anthropic;
      sdk = new Anthropic({ apiKey });
    }
    return sdk;
  }
  return {
    model,
    async complete({ goal, history }) {
      const client = await getSdk();
      const msg = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: SYSTEM,
        messages: [{ role: 'user', content: buildUserPrompt(goal, history) }],
      });
      const text = (msg.content || []).map(b => b.text || '').join('');
      const parsed = extractJson(text) || { action: text.slice(0, 200), result: '', done: false };
      return {
        action: parsed.action || '',
        result: parsed.result || '',
        done: !!parsed.done,
        usage: {
          model,
          inTok: msg.usage?.input_tokens ?? 0,
          outTok: msg.usage?.output_tokens ?? 0,
        },
      };
    },
  };
}
