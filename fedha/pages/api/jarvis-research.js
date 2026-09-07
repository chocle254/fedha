// pages/api/jarvis-research.js — real web-search-backed discovery, callable
// directly (e.g. from a future rebuilt Discover page) as well as via
// Jarvis's own research_online_opportunities/research_activities_nearby
// tools in pages/api/jarvis.js. Both paths share lib/jarvis-research-core.js
// so the actual search prompts and weather logic live in exactly one place.

import { runResearch } from '../../lib/jarvis-research-core';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { researchType, location, freeMinutes } = req.body;
  if (!['online_opportunities', 'activities'].includes(researchType)) {
    return res.status(400).json({ error: 'researchType must be online_opportunities or activities' });
  }

  try {
    const result = await runResearch(researchType, location, freeMinutes);
    return res.status(200).json(result);
  } catch (err) {
    console.error('Jarvis research route error:', err);
    return res.status(500).json({ error: err.message });
  }
}
