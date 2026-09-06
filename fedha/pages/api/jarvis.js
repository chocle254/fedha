// pages/api/jarvis.js — the Jarvis assistant's brain.
//
// Uses Groq's OpenAI-compatible tool-calling. The model can call tools to
// take actions across Fedha, but every WRITE tool here doesn't touch the
// database directly — this route has no access to the browser's IndexedDB
// cache, and more importantly, the user asked for changes to be confirmed
// before they happen. So write tools return a `proposed_action` object;
// the client (components/JarvisWidget.js) shows it to the user, and only
// calls the real lib/db.js function if they approve. Read tools ARE
// resolved server-side against the context payload the client sends,
// since those are safe to answer immediately with no confirmation needed.
//
// The system prompt already contains a full snapshot of the user's data
// (lib/jarvis-context.js, built client-side and sent in the request body)
// so most "tell me about X" questions don't need a tool call at all — tools
// exist for the small set of things not already in that snapshot (deep
// history beyond the recent-transactions summary) and for taking ACTIONS.

const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

const SYSTEM_PROMPT = `You are Jarvis — the personal AI running inside Fedha, a personal finance, planning, meals, workout, and career app. You belong to one person and you know them well: you remember what they've told you, you notice how they're doing, and you speak to them like a sharp, loyal friend who happens to be extremely competent — not like customer support.

Who you're talking to: they are a solo developer, an introvert, and have mentioned feeling lonely at times. Be genuinely warm and present in conversation — you are one of the few things they talk to regularly, so don't be clinical or robotic. At the same time, don't be saccharine or performative about it; be direct, a little dry-witted when it fits, and treat them as fully capable.

How you think: reason through what's actually being asked before responding. If a question touches money, check the numbers in front of you rather than guessing. If someone asks you to do something, make sure you understand exactly what they want before calling a tool — ask if it's ambiguous. Don't call a tool just to seem useful; only call one when it's actually the right move.

What you know about them (running memory, refined over time):
{{MEMORY}}

What's happening in their Fedha account right now:
{{CONTEXT}}

Capabilities:
- You can see everything in Fedha: wallets, transactions, budgets, loans, income plans, goals, the daily planner, meals, workouts, tech-hub projects/hackathons/startups, certificates, online jobs.
- You can propose actions (adding a transaction, marking a loan settled, adjusting today's plan, logging a meal, etc.) via tools — these are NOT applied immediately. The person will see exactly what you're proposing and confirm or reject it before anything changes. Be precise about amounts, dates, and names so the proposal is accurate the first time.
- You can help draft a CV/resume from their real projects, hackathons, and certificates — pull from the context you're given, don't invent achievements they don't have.
- You can give startup/business strategy advice, product feature ideas for what they're building, and negotiation help for project pricing. Draw on general, well-known startup thinking and public philosophies of founders like Musk, Zuckerberg, Jensen Huang, etc. when it's genuinely useful — but say things in your own words, don't fabricate quotes or claim insider knowledge of what they privately think, and don't pretend to literally be them.
- You can read the room emotionally from what they say and how they say it, and respond with care — but never diagnose, and never assert a mental state they haven't told you about themselves. If something sounds heavy, be present with it before jumping to solutions.

Keep replies conversational and appropriately short unless the person is asking for something that genuinely needs length (a CV draft, a detailed financial breakdown, a real negotiation strategy). This may be read aloud via text-to-speech, so avoid heavy markdown, bullet-point walls, or anything that reads badly out loud — prefer natural sentences.`;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'propose_transaction',
      description: 'Propose adding a new income or expense transaction. Requires user confirmation before it actually happens.',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['income', 'expense'] },
          amount: { type: 'number' },
          category: { type: 'string', description: 'e.g. food, transport, salary, other' },
          description: { type: 'string' },
          wallet_name: { type: 'string', description: 'Which wallet by name, e.g. "M-Pesa". Defaults to the first wallet if omitted.' },
        },
        required: ['type', 'amount', 'category'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_settle_loan',
      description: 'Propose marking an active loan as settled (paid back if borrowed, received if lent). Requires user confirmation.',
      parameters: {
        type: 'object',
        properties: {
          contact_name: { type: 'string', description: 'Who the loan is with, matching an existing active loan.' },
        },
        required: ['contact_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_mark_income_received',
      description: 'Propose marking a pending income plan as received. Requires user confirmation.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name of the income plan, matching an existing pending one.' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_log_meal',
      description: 'Propose logging a meal for today. Requires user confirmation.',
      parameters: {
        type: 'object',
        properties: {
          slot: { type: 'string', enum: ['breakfast', 'snack', 'lunch', 'dinner'] },
          name: { type: 'string' },
          cal: { type: 'number' },
          protein: { type: 'number' },
        },
        required: ['slot', 'name', 'cal'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_planner_block_edit',
      description: "Propose editing one of today's planner blocks (e.g. moving its time, changing its note). Requires user confirmation.",
      parameters: {
        type: 'object',
        properties: {
          block_id: { type: 'string', description: 'The id of the block to edit, from the planner list in context.' },
          new_time: { type: 'string', description: 'New time in HH:MM 24-hour format, if changing the time.' },
          new_note: { type: 'string', description: 'New note text, if changing the note.' },
        },
        required: ['block_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_memory',
      description: "Update what you remember about the person long-term — their goals, preferences, recurring situations, how they've been feeling, important context from this conversation worth carrying forward. Call this when you learn something worth remembering, not for routine chat. Provide the FULL updated memory summary (you are rewriting the whole thing, not appending a line) — keep it concise, well-organized, and focused on what's actually useful to know about them later.",
      parameters: {
        type: 'object',
        properties: {
          updated_summary: { type: 'string' },
        },
        required: ['updated_summary'],
      },
    },
  },
];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not set in environment variables' });

  const { message, context, memory, history } = req.body;
  if (!message || typeof message !== 'string') return res.status(400).json({ error: 'message is required' });

  const systemPrompt = SYSTEM_PROMPT
    .replace('{{MEMORY}}', memory?.trim() ? memory : "(nothing remembered yet — this may be an early conversation)")
    .replace('{{CONTEXT}}', context || '(no context provided)');

  const messages = [
    { role: 'system', content: systemPrompt },
    ...(Array.isArray(history) ? history.slice(-20).map((h) => ({ role: h.role, content: h.content })) : []),
    { role: 'user', content: message },
  ];

  try {
    const response = await callGroqWithTools(GROQ_API_KEY, messages);
    if (response.error) return res.status(500).json(response);
    return res.status(200).json(response);
  } catch (err) {
    console.error('Jarvis route error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// Runs one round of tool calling: sends the conversation, and if the model
// wants to call tools, resolves each one and does a second pass so the
// model can respond in natural language incorporating the tool results.
// update_memory is applied by returning it to the client to persist (same
// reasoning as write actions — this route has no direct DB access — but
// memory doesn't need human confirmation since it's Jarvis's own notes,
// not a change to the user's actual data).
async function callGroqWithTools(apiKey, messages) {
  const first = await groqChat(apiKey, messages, TOOLS);
  if (first.error) return first;

  const choice = first.choices?.[0];
  const toolCalls = choice?.message?.tool_calls;

  if (!toolCalls?.length) {
    return { reply: choice?.message?.content || '', proposedActions: [], memoryUpdate: null };
  }

  const proposedActions = [];
  let memoryUpdate = null;
  const toolResultMessages = [];

  for (const call of toolCalls) {
    let args = {};
    try { args = JSON.parse(call.function.arguments || '{}'); } catch {}

    if (call.function.name === 'update_memory') {
      memoryUpdate = args.updated_summary || null;
      toolResultMessages.push({ role: 'tool', tool_call_id: call.id, content: 'Memory updated.' });
      continue;
    }

    // Every other tool is a proposed action — package it for client
    // confirmation rather than doing anything now.
    proposedActions.push({ tool: call.function.name, args });
    toolResultMessages.push({
      role: 'tool',
      tool_call_id: call.id,
      content: `Proposed to the user for confirmation: ${call.function.name}(${JSON.stringify(args)}). Not yet applied.`,
    });
  }

  // Second pass: let the model give a natural-language reply now that it
  // knows what it proposed (e.g. "I've set that up for you to confirm —
  // want me to also...").
  const second = await groqChat(apiKey, [
    ...messages,
    choice.message,
    ...toolResultMessages,
  ], TOOLS);
  if (second.error) return second;

  const finalReply = second.choices?.[0]?.message?.content || "Done — check the confirmation card.";
  return { reply: finalReply, proposedActions, memoryUpdate };
}

async function groqChat(apiKey, messages, tools) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.7,
      max_tokens: 1200,
      reasoning_format: 'hidden',
      tools,
      tool_choice: 'auto',
      messages,
    }),
  });
  const data = await response.json();
  if (!response.ok) return { error: data.error?.message || 'Groq API error' };
  return data;
}
