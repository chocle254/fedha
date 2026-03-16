export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not set in environment variables' });
  }

  const { type, balance, currency, location, dateMode, budgets, currency_symbol } = req.body;
  let prompt = '';

  if (type === 'activities') {
    const locationStr = location?.city
      ? `The user is near: ${location.city} (coordinates: ${location.lat}, ${location.lng}).`
      : `No location provided — suggest general affordable activities.`;
    const modeStr = dateMode
      ? `This is for a romantic date — suggest couple-friendly, fun, memorable date activities.`
      : `This is for personal enjoyment — suggest fun solo or social activities.`;

    prompt = `You are a fun personal finance assistant helping someone enjoy their money wisely.
${locationStr}
${modeStr}
The user has ${currency_symbol}${balance} in floating cash available (after all budgets and commitments).
Budgets already set: ${budgets?.length ? budgets.map(b => b.name + ' (' + b.period + ')').join(', ') : 'none'}.
Suggest real activities, venues, restaurants near their location that fit their budget. If in Kenya, suggest Kenya-specific places.
Respond ONLY with a valid JSON array (no markdown, no explanation, no code fences) of 6 activity suggestions. Each object mus
