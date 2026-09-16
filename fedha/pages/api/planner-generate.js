// pages/api/planner-generate.js — the "I'm Awake" brain.
//
// planner.js's buildTodayBlocks() is a deterministic wish-list-then-fit
// algorithm: good at never overflowing a budget, bad at actually reasoning
// about what today should look like. This route replaces that reasoning
// step with an LLM call — same context Jarvis already sees (money, meals,
// hackathons, jobs, projects, goals, research, workouts), anchored to
// whatever moment the person actually pressed "I'm Awake" today — but
// keeps buildTodayBlocks() as a silent client-side fallback if this call
// fails for any reason, so the planner never breaks.
//
// The model outputs relative durations, not clock times — asking an LLM to
// do reliable time arithmetic (which so often goes wrong at midnight
// wraps, DST, etc.) is a bad idea when the client can just sum durations
// starting from the known wake instant instead.

const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const VALID_TYPES = ['routine', 'meal', 'coding', 'research', 'personal', 'chores', 'workout', 'health', 'gaming', 'sleep'];

const SYSTEM_PROMPT = `You are the planning brain inside Fedha's daily planner. You are a sharp, realistic personal/professional assistant, not a generic productivity template. Your ONE job right now: given everything happening in this person's life today, build the rest of their day, starting from the moment they just woke up, in a way that genuinely boosts their production and their health — in that order of care, but never sacrificing health for output.

Ground rules:
- The person just told you they woke up. Do not schedule anything before "now" — the first block starts immediately.
- They are actively trying to shift their sleep earlier over time (previously very late nights) — treat tonight's bedtime as one more step in that direction, not a instant fix. Pick a bedtime that's realistic given how much time is actually left today, gives at least 6.5 hours of sleep before a reasonable next wake, and is genuinely a bit earlier than their recent pattern if the day allows it. Never schedule bedtime after 2am relative to a normal night, and never so early it's impossible given what's left to do.
- Pull real work items from the context below — active hackathons (especially urgent deadlines), online jobs, startups, projects. Don't invent work that isn't there; if truly nothing is active, use one deep-work/learning block instead.
- If there's an OPEN RESEARCH item in the context, give it its own ~45-75 minute block (type "research") placed sensibly among the work blocks — not first thing, not last.
- Include meals appropriately spaced from now to bedtime (skip ones already logged today per the context) — each meal gets a short prep block right before it.
- Include exactly one workout block if the day's workout plan (in context) hasn't been done yet, sized to the plan.
- Protect at least one personal/social block and one leisure block (gaming or free time) — cutting these to zero every day is not sustainable, but they're the first things to shrink if the day is genuinely short on time.
- Do not exceed what's realistic — if it's already afternoon, don't cram a full 8-block workday in; be honest about what fits.
- End with exactly one block of type "sleep" as the last entry — its duration_minutes is the actual hours of sleep you're planning for, in minutes.

Output ONLY a single JSON object, nothing else — no markdown fences, no commentary before or after:
{"blocks": [{"label": "string", "type": "one of: ${VALID_TYPES.join(', ')}", "emoji": "single emoji", "duration_minutes": integer, "note": "one short actionable sentence"}]}`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not set in environment variables' });

  const { context, nowLabel, isWeekend } = req.body;
  if (!context) return res.status(400).json({ error: 'context is required' });

  const userPrompt = `Current moment: ${nowLabel || new Date().toLocaleString()} (${isWeekend ? 'weekend' : 'weekday'}).\n\nFull context on their life right now:\n${context}\n\nBuild the rest of today, starting now.`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.6,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Groq API error');

    const raw = data.choices?.[0]?.message?.content || '';
    let parsed;
    try { parsed = JSON.parse(raw); } catch { throw new Error('Model did not return valid JSON'); }

    const blocks = Array.isArray(parsed?.blocks) ? parsed.blocks : null;
    if (!blocks || !blocks.length) throw new Error('Model returned no blocks');

    // Validate/sanitize each block rather than trusting the model fully —
    // a bad type or a nonsense duration here would otherwise corrupt the
    // whole schedule silently.
    const clean = blocks
      .filter((b) => b && typeof b.label === 'string' && b.label.trim())
      .map((b) => ({
        label: b.label.trim().slice(0, 80),
        type: VALID_TYPES.includes(b.type) ? b.type : 'routine',
        emoji: typeof b.emoji === 'string' && b.emoji.trim() ? b.emoji.trim().slice(0, 4) : '•',
        duration_minutes: Number.isFinite(Number(b.duration_minutes)) ? Math.max(5, Math.min(600, Math.round(Number(b.duration_minutes)))) : 30,
        note: typeof b.note === 'string' ? b.note.trim().slice(0, 300) : '',
      }));

    if (!clean.length) throw new Error('No valid blocks after sanitizing');
    if (clean[clean.length - 1].type !== 'sleep') {
      clean.push({ label: 'Sleep', type: 'sleep', emoji: '😴', duration_minutes: 420, note: 'Phone in another room.' });
    }

    return res.status(200).json({ blocks: clean });
  } catch (err) {
    console.error('Planner generate route error:', err);
    return res.status(500).json({ error: err.message });
  }
}
