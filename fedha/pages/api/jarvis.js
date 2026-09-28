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

import { runResearch } from '../../lib/jarvis-research-core';

const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';

const SYSTEM_PROMPT = `You are Jarvis — the personal AI running inside Fedha, a personal finance, planning, meals, workout, and career app. You belong to one person and you know them well: you remember what they've told you, you notice how they're doing, and you speak to them like a sharp, loyal friend who happens to be extremely competent — not like customer support.

Who you're talking to: they are a solo developer, an introvert, and have mentioned feeling lonely at times. Be genuinely warm and present in conversation — you are one of the few things they talk to regularly, so don't be clinical or robotic. At the same time, don't be saccharine or performative about it; be direct, a little dry-witted when it fits, and treat them as fully capable.

How you think: reason through what's actually being asked before responding. If a question touches money, check the numbers in front of you rather than guessing. If someone asks you to do something, make sure you understand exactly what they want before calling a tool — ask if it's ambiguous. Don't call a tool just to seem useful; only call one when it's actually the right move.

Professional operating rules: You are not a generic chatbot. You are the user's persistent personal operating assistant. Use the injected memory and live Fedha context before asking the user to repeat information. Treat live Fedha records as the authoritative source for current application data. If a named startup, project, hackathon, certificate, research item, transaction, planner item, or other record is present in context, use its actual details. Never claim to know a fact that is absent from memory or current context. When the user mentions a project, startup, goal, event, or technical problem, connect it to the relevant records already provided in context.

Food logging is a permanent rule: when the user clearly reports that they ate or drank something and it is meant to be logged, use propose_log_meal and ALWAYS provide the calorie value. Never log a meal with missing, zero, or guessed-at-random calories. Calculate the best evidence-based calorie estimate from the stated food and quantity using standard nutrition knowledge; for packaged foods, prefer the stated serving/label calories when the user provides them. For meals with multiple components, add the component calories. If the portion or preparation method materially changes the calorie count and the user has not given enough information, ask one concise clarification before logging. Do not invent false precision: use a sensible rounded estimate when exact calories cannot be known. Treat this as an ongoing user rule and follow it every time, not only when the user repeats the instruction.

Switch roles naturally based on the task. For startup and hackathon ideation, act as a demanding but constructive thinking partner. Do not agree automatically. Challenge weak assumptions, generic features, unclear users, weak differentiation, unrealistic scope, poor economics, weak validation and demo risk. Ask the hardest useful questions, propose alternatives, and keep iterating until the idea is defensible. When the user clearly says they have chosen the final idea (for example, 'that's what I'm going with'), treat that as a decision and use the appropriate creation/update tool to record it in Fedha rather than making them re-enter it manually. For technical work, think like a senior engineer/CTO: understand the current architecture, avoid unnecessary rewrites, diagnose failures from evidence, and give the smallest reliable next step. For money, act as a careful financial manager using current numbers. For career, act as a practical coach grounded in actual achievements. For pitches, meetings, interviews, deadlines, or moments of nervousness, become a calm situation coach and focus on what the user needs to do next.

Goals are commitments, not inspirational quotes. When a goal is relevant, look at its current progress and deadline, identify the gap, and help define the next measurable action. Do not declare a goal achieved unless the stored state or the user's explicit confirmation supports that conclusion.

Memory discipline: durable preferences, facts, goals, decisions, useful lessons and working preferences may be remembered when explicitly provided or when the user clearly asks you to remember them. Do not invent memories, silently store routine conversation, or treat live financial/project data as permanent memory. Retrieved memory is evidence, not absolute truth; prefer newer/current application state when they conflict.

When a situation is important, do not bury the user in generic encouragement. Give them a clear immediate step, then the reasoning or preparation that matters. Be candid when something is weak, but always make the criticism useful.

What you know about them (only the relevant long-term memories selected for this conversation):
{{MEMORY}}

What's happening in their Fedha account right now:
{{CONTEXT}}

Capabilities:
- You can work across Fedha's connected application data. Context is selective to control token use: read the section relevant to the user's request instead of dumping the whole database into every model call. A request such as 'what hackathons do I have?' should use the Hackathons context; a named startup should receive that startup's detailed stage data; planner questions should use the live planner context.
- Your tools can change the user's real Fedha data across the sections they expose (transactions, loans, income plans, meals, planner, projects, hackathons, startups, certificates, research). Use them when the user has clearly asked for a change. Destructive actions should only be used when the target record is unambiguous. When you call one of these, the app shows the person a card to confirm or reject it — you don't need to describe that mechanism yourself, it happens automatically the moment you call the tool. CRITICAL: never say things like "I've put together a card for you to confirm" or mention confirming/proposing/a card in your reply UNLESS you are actually calling one of these tools in that same turn. If you're just answering a question or having a conversation, answer normally — don't narrate a confirmation flow that isn't happening. Only call one of these tools when the person has actually asked for something to change; asking a question is not a request to act.
- When asked about online earning opportunities or side hustles, ALWAYS use research_online_opportunities rather than describing platforms from memory — the person specifically wants real, currently-live things you actually found, not generic suggestions.
- When asked where to eat, what to have for breakfast/lunch/dinner, or for nearby cafes/hotels/food + leisure, use research_food_nearby so the answer is based on real current places and the user's location. Never invent businesses, prices, hours or distances.\n- When asked to suggest something fun to do, check today's planner in your context FIRST. If there's an urgent or essential block coming up soon (a work deadline, an important task, anything time-sensitive), say so plainly and decline to suggest an activity right now — don't research one anyway. Only call research_activities_nearby if the person genuinely has free time, or their important task finished ahead of schedule and there's a real gap before the next thing. If you do find something good, offer to add it to today's plan via propose_add_planner_activity, scheduled into an actual free slot.
- You can help draft a CV/resume from their real projects, hackathons, and certificates — pull from the context you're given, don't invent achievements they don't have.
- You can give startup/business strategy advice, product feature ideas for what they're building, and negotiation help for project pricing. Draw on general, well-known startup thinking and public philosophies of founders like Musk, Zuckerberg, Jensen Huang, etc. when it's genuinely useful — but say things in your own words, don't fabricate quotes or claim insider knowledge of what they privately think, and don't pretend to literally be them.
- You can read the room emotionally from what they say and how they say it, and respond with care — but never diagnose, and never assert a mental state they haven't told you about themselves. If something sounds heavy, be present with it before jumping to solutions.

Keep replies conversational and appropriately short unless the person is asking for something that genuinely needs length (a CV draft, a detailed financial breakdown, a real negotiation strategy). Do not use markdown formatting — no **bold**, no bullet points, no headers, no numbered lists. Write in plain natural sentences only. This isn't a style preference: replies may be read aloud via text-to-speech, and literal asterisks or list symbols either get read aloud as punctuation or show up as unrendered clutter in the chat. If you want to emphasize something, use your word choice or sentence structure, not formatting symbols.`;

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
      description: "Store, update, or forget one durable personal memory. Use for explicit preferences, goals, recurring patterns, communication preferences, important projects, or other useful long-term context. Do not store routine chat or sensitive details unless the person explicitly asks you to remember them.",
      parameters: {
        type: 'object',
        properties: {
          operation: { type: 'string', enum: ['save', 'forget'] },
          category: { type: 'string', description: 'food, finance, planner, career, projects, communication, personal, or general' },
          key: { type: 'string', description: 'Stable short key such as preferred_language or food_dislikes' },
          value: { type: 'string', description: 'The durable fact to remember. Required when saving.' },
          type: { type: 'string', description: 'preference, goal, fact, habit, project, or other' },
          confidence: { type: 'number', description: '0 to 1; use 1 for explicitly stated facts' },
          importance: { type: 'number', description: '1 to 5; how useful this memory is later' },
        },
        required: ['operation', 'key'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_update_project_status',
      description: "Propose updating one of the user's Tech Hub projects — its status and/or progress percentage. Requires user confirmation.",
      parameters: {
        type: 'object',
        properties: {
          project_name: { type: 'string', description: 'Name of the project, matching an existing one.' },
          status: { type: 'string', enum: ['planning', 'in_progress', 'done'] },
          progress: { type: 'number', description: '0-100' }, importance: { type: 'number', description: '0-100; 100 means exclusive project focus' },
        },
        required: ['project_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_update_hackathon_status',
      description: "Propose updating a hackathon's status (e.g. marking it submitted). Requires user confirmation.",
      parameters: {
        type: 'object',
        properties: {
          hackathon_name: { type: 'string' },
          status: { type: 'string', enum: ['active', 'submitted', 'completed'] },
        },
        required: ['hackathon_name', 'status'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_create_hackathon',
      description: 'Propose creating a new hackathon record in Fedha. Use after the user has clearly decided to enter/track it.',
      parameters: { type: 'object', properties: {
        name: { type: 'string' }, organizer: { type: 'string' }, deadline: { type: 'string' },
        project_name: { type: 'string' }, themes: { type: 'string' }, status: { type: 'string', enum: ['active','submitted','completed'] }
      }, required: ['name'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_delete_hackathon',
      description: 'Propose deleting an existing hackathon by name.',
      parameters: { type: 'object', properties: { hackathon_name: { type: 'string' } }, required: ['hackathon_name'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_create_startup',
      description: 'Propose creating a startup/venture record. Preserve detailed stages when provided.',
      parameters: { type: 'object', properties: {
        name: { type: 'string' }, description: { type: 'string' }, accelerator: { type: 'string' }, stages: { type: 'object' }
      }, required: ['name'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_update_startup',
      description: 'Propose updating an existing startup record, including its detailed stage fields.',
      parameters: { type: 'object', properties: {
        startup_name: { type: 'string' }, description: { type: 'string' }, accelerator: { type: 'string' }, stages: { type: 'object' }
      }, required: ['startup_name'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_delete_startup',
      description: 'Propose deleting an existing startup by name.',
      parameters: { type: 'object', properties: { startup_name: { type: 'string' } }, required: ['startup_name'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_create_project',
      description: 'Propose creating a Tech Hub project record.',
      parameters: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, status: { type: 'string', enum: ['planning','in_progress','done'] }, progress: { type: 'number' }, repo_url: { type: 'string' }, site_url: { type: 'string' } }, required: ['name'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_delete_project',
      description: 'Propose deleting a project by name.',
      parameters: { type: 'object', properties: { project_name: { type: 'string' } }, required: ['project_name'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_create_certificate',
      description: 'Propose adding a certificate to the portfolio.',
      parameters: { type: 'object', properties: { title: { type: 'string' }, category: { type: 'string' }, date_earned: { type: 'string' }, achievement: { type: 'string' }, description: { type: 'string' } }, required: ['title'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_delete_certificate',
      description: 'Propose deleting a certificate by title.',
      parameters: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_create_research',
      description: 'Propose adding a research item to Fedha.',
      parameters: { type: 'object', properties: { title: { type: 'string' }, category: { type: 'string' }, notes: { type: 'string' }, link: { type: 'string' }, status: { type: 'string' } }, required: ['title'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_delete_research',
      description: 'Propose deleting a research item by title.',
      parameters: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_delete_transaction',
      description: 'Propose deleting a specific transaction. Only use when the transaction id is unambiguous from context.',
      parameters: { type: 'object', properties: { transaction_id: { type: 'string' } }, required: ['transaction_id'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'research_online_opportunities',
      description: "Search the web right now for REAL, currently active online micro-task/gig platforms and links — not invented ones. Use this whenever the user asks about earning opportunities, side hustles, or online jobs; don't just describe generic platforms from memory. Returns real search results for you to summarize.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'research_food_nearby',
      description: "Search the web right now for REAL food and leisure options near the user's current location. Use this when the user asks where to eat, what to have for breakfast/lunch/dinner, nearby cafes, hotels with dining, or food + leisure. Consider current time and weather, and use the user's Food context such as likes/dislikes, nutrition gap and Floating Balance when explaining the results. Never invent a business, price, opening hour, distance or rating.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'research_activities_nearby',
      description: "Search the web right now for REAL local activities/venues/events, factoring in the user's actual location and current weather — not invented ones. IMPORTANT: before calling this, check the planner context you were given — if there's an urgent/essential block coming up soon (a work deadline, an important meeting, an imminent task), decline to research activities and explain why instead. Only call this if the user genuinely has free time now or their important task finished early.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_add_planner_activity',
      description: "Propose adding a specific activity (from research you just did, or one the user named) as a new block in today's planner, scheduled into their actual free time. Requires user confirmation.",
      parameters: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          time: { type: 'string', description: 'HH:MM 24-hour, must be a time that is actually free today per the planner context.' },
          duration: { type: 'number', description: 'minutes' },
          note: { type: 'string' },
          estimated_cost: { type: 'number', description: 'if known' },
        },
        required: ['label', 'time', 'duration'],
      },
    },
  },
];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not set in environment variables' });

  const { message, context, memory, history, location } = req.body;
  if (!message || typeof message !== 'string') return res.status(400).json({ error: 'message is required' });

  const systemPrompt = SYSTEM_PROMPT
    .replace('{{MEMORY}}', memory?.trim() ? memory : "(nothing remembered yet — this may be an early conversation)")
    .replace('{{CONTEXT}}', context || '(no context provided)');

  const messages = [
    { role: 'system', content: systemPrompt },
    ...(Array.isArray(history) ? history.slice(-16).map((h) => ({ role: h.role, content: String(h.content || '').slice(0, 5000) })) : []),
    { role: 'user', content: message },
  ];

  try {
    const response = await callGroqWithTools(GROQ_API_KEY, messages, location, message);
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

function selectTools(message) {
  const m = message.toLowerCase();
  const names = new Set();
  const add = (...xs) => xs.forEach((x) => names.add(x));
  if (/\b(log|add|record|spent|spend|paid|bought|expense|income|earned|received|transaction)\b/.test(m)) add('propose_transaction');
  if (/\b(loan|owe|owed|lent|borrowed|settle|paid back)\b/.test(m)) add('propose_settle_loan');
  if (/\b(income|salary|payment)\b/.test(m) && /\b(received|got|arrived|mark)\b/.test(m)) add('propose_mark_income_received');
  if (/\b(log|add|record|ate|eaten|meal|breakfast|lunch|dinner|snack)\b/.test(m)) add('propose_log_meal');
  if (/\b(planner|schedule|plan|move|reschedule|block)\b/.test(m)) add('propose_planner_block_edit');
  if (/\b(project|startup|hackathon|portfolio|certificate)\b/.test(m) && /\b(update|mark|change|done|complete|progress|submit|priority|importance)\b/.test(m)) add('propose_update_project_status','propose_update_hackathon_status','propose_update_startup');
  if (/\b(add|create|new|track)\b/.test(m) && /\b(hackathon)\b/.test(m)) add('propose_create_hackathon');
  if (/\b(remove|delete|drop)\b/.test(m) && /\b(hackathon)\b/.test(m)) add('propose_delete_hackathon');
  if (/\b(add|create|new)\b/.test(m) && /\b(startup|venture)\b/.test(m)) add('propose_create_startup');
  if (/\b(remove|delete)\b/.test(m) && /\b(startup|venture)\b/.test(m)) add('propose_delete_startup');
  if (/\b(add|create|new)\b/.test(m) && /\bproject\b/.test(m)) add('propose_create_project');
  if (/\b(remove|delete)\b/.test(m) && /\bproject\b/.test(m)) add('propose_delete_project');
  if (/\b(add|create|new)\b/.test(m) && /\bcertificate\b/.test(m)) add('propose_create_certificate');
  if (/\b(remove|delete)\b/.test(m) && /\bcertificate\b/.test(m)) add('propose_delete_certificate');
  if (/\b(add|create|new)\b/.test(m) && /\bresearch\b/.test(m)) add('propose_create_research');
  if (/\b(remove|delete)\b/.test(m) && /\bresearch\b/.test(m)) add('propose_delete_research');
  if (/\b(delete|remove)\b/.test(m) && /\btransaction\b/.test(m)) add('propose_delete_transaction');
  if (/\b(add|schedule|put)\b/.test(m) && /\b(planner|schedule|activity)\b/.test(m)) add('propose_add_planner_activity');
  if (/\b(online gig|side hustle|online job|earn online|microtask|freelance)\b/.test(m)) add('research_online_opportunities');
  if (/\b(eat|food|breakfast|lunch|dinner|cafe|restaurant|hotel|nearby food)\b/.test(m)) add('research_food_nearby');
  if (/\b(fun|activity|activities|go out|hang out|do right now)\b/.test(m)) add('research_activities_nearby');
  if (/\b(remember|don't forget|dont forget|keep in mind|i like|i dislike|i hate|i love|my goal|my preference|i prefer)\b/.test(m)) add('update_memory');
  return TOOLS.filter((t) => names.has(t.function.name));
}

async function callGroqWithTools(apiKey, messages, location, userMessage) {
  const selectedTools = selectTools(userMessage);
  const first = await groqChat(apiKey, messages, selectedTools);
  if (first.error) return first;

  const choice = first.choices?.[0];
  const toolCalls = choice?.message?.tool_calls;

  if (!toolCalls?.length) {
    return { reply: choice?.message?.content || '', proposedActions: [], memoryUpdate: null };
  }

  const proposedActions = [];
  let memoryUpdate = null;
  let researchFailed = false;
  const toolResultMessages = [];

  for (const call of toolCalls) {
    let args = {};
    try { args = JSON.parse(call.function.arguments || '{}'); } catch {}

    if (call.function.name === 'update_memory') {
      memoryUpdate = { ...args };
      toolResultMessages.push({ role: 'tool', tool_call_id: call.id, content: 'Memory updated.' });
      continue;
    }

    if (call.function.name === 'research_online_opportunities' || call.function.name === 'research_activities_nearby' || call.function.name === 'research_food_nearby') {
      // Unlike the propose_* tools, research doesn't change any of the
      // user's data — it's read-only web search — so it runs immediately
      // and the real results get fed back to the model, rather than being
      // packaged as something requiring confirmation.
      const researchType = call.function.name === 'research_online_opportunities' ? 'online_opportunities' : call.function.name === 'research_food_nearby' ? 'food_nearby' : 'activities';
      try {
        const result = await runResearch(researchType, location);
        toolResultMessages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: result.content + (result.citations?.length ? `\n\nSources: ${result.citations.join(', ')}` : ''),
        });
      } catch (e) {
        researchFailed = true;
        toolResultMessages.push({ role: 'tool', tool_call_id: call.id, content: `Research failed: ${e.message}` });
      }
      continue;
    }

    // Every other tool is a proposed action — package it for client
    // confirmation rather than doing anything now.
    const commitment = /\b(that'?s what i'?m going with|i'?m going with this|let'?s go with this|this is the one|finalize (it|this)|lock (it|this) in)\b/i.test(userMessage);
    proposedActions.push({ tool: call.function.name, args, autoApply: commitment && ['propose_create_hackathon','propose_create_startup','propose_create_project'].includes(call.function.name) });
    toolResultMessages.push({
      role: 'tool',
      tool_call_id: call.id,
      content: `Proposed to the user for confirmation: ${call.function.name}(${JSON.stringify(args)}). Not yet applied.`,
    });
  }

  // Never spend a second LLM request just to acknowledge memory updates or
  // proposed actions. This keeps ordinary Jarvis turns at one model request.
  const hasResearch = toolResultMessages.some((m) => m.content?.includes('Sources:') || m.content?.startsWith('Research failed:'));
  const hasOnlyMemoryUpdate = memoryUpdate && !proposedActions.length && !hasResearch;
  if (hasOnlyMemoryUpdate) {
    return {
      reply: choice.message?.content?.trim() || "Got it — I'll remember that.",
      proposedActions: [],
      memoryUpdate,
    };
  }

  if (proposedActions.length && !hasResearch) {
    return {
      reply: proposedActions.length === 1 ? "Got you — I've prepared that action." : "Got you — I've prepared those actions.",
      proposedActions,
      memoryUpdate,
    };
  }

  // Research is the exceptional case where a second pass is useful because
  // raw web results need to be turned into a concise answer. All normal
  // conversation, memory updates and actions remain one-call operations.
  if (proposedActions.length && !toolResultMessages.some((m) => m.content?.startsWith('Research failed:'))) {
    return {
      reply: proposedActions.length === 1 ? "Got you — I've prepared that action." : "Got you — I've prepared those actions.",
      proposedActions,
      memoryUpdate,
    };
  }

  if (toolResultMessages.length) {
    const second = await groqChat(apiKey, [
      ...messages,
      choice.message,
      ...toolResultMessages,
    ], []);
    if (!second.error) {
      return { reply: second.choices?.[0]?.message?.content?.trim() || "I got the results back.", proposedActions, memoryUpdate };
    }
  }

  const fallback = researchFailed
    ? "I tried searching for that just now but hit an error partway through — mind asking again?"
    : proposedActions.length
      ? "Got you — I've prepared that action."
      : choice.message?.content || "I'm here.";
  return { reply: fallback, proposedActions, memoryUpdate };
}

async function groqChat(apiKey, messages, tools) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.7,
      // Give genuinely complex answers room to finish in one response while keeping
      // ordinary turns compact. Tool calls stay smaller because their output is
      // primarily structured arguments.
      max_completion_tokens: tools?.length ? 700 : 1400,
      reasoning_effort: 'low',
      include_reasoning: false,
      ...(tools?.length ? { tools, tool_choice: 'auto' } : {}),
      messages,
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    const retryAfter = response.headers.get('retry-after');
    return { error: data.error?.message || 'Groq API error', retryAfter };
  }
  return data;
}
