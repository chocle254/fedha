// Where a planner block leads: the section of Luxe it is about (🍽️ lunch → Food, 🚀 CivCare → that startup, ...).
// Used for the button on the block in the planner and for where its notification opens.
// ctx: { startups, hackathons } from the app, to find the right startup / hackathon page by name.
const has = (label, name) => name && label.toLowerCase().includes(String(name).toLowerCase());

export function blockLink(block, ctx = {}) {
  if (!block) return null;
  const id = String(block.id || '').replace(/@.*$/, '');
  const label = String(block.label || '');
  const type = block.type;

  if (/^(series|movies)/.test(id)) return { href: '/chill', text: '🍿 Open Chill Room' };
  if (id === 'night_out') return { href: '/planner#night-out', text: '🪩 Night out: pick where to go' };
  if (/^night_(out2|check|pace)$/.test(id)) return { href: '/planner#night-out', text: '🧭 Tonight\'s pace plan' };
  if (id === 'go_out_ready') return { href: '/planner#night-out', text: '🪩 See tonight\'s plan' };
  if (id === 'upkeep') return { href: '/living#upkeep', text: '🌤 Open Live a little' };
  if (id === 'first_time') return { href: '/living#firsts', text: '✨ Find where to get it' };
  if (id.startsWith('startup_')) {
    const s = (ctx.startups || []).find((x) => id.startsWith(`startup_${x.id}_`));
    if (s) return { href: `/startup/${s.id}`, text: `🚀 Open ${s.name}` };
  }
  if (id.startsWith('hackres_') || /hackathon/i.test(label)) {
    const h = (ctx.hackathons || []).find((x) => id === `hackres_${x.id}` || has(label, x.name));
    if (h) return { href: `/hackathon/${h.id}`, text: `🏆 Open ${h.name}` };
  }
  if (/^startup/i.test(label)) {
    const s = (ctx.startups || []).find((x) => has(label, x.name));
    if (s) return { href: `/startup/${s.id}`, text: `🚀 Open ${s.name}` };
  }
  if (type === 'meal' || /^(bfast|breakfast|lunch|dinner|snack)/.test(id)) return { href: '/meals', text: '🍽️ Open Food' };
  if (type === 'workout' || /workout|recovery/.test(id)) return { href: '/workout', text: '🏋️ Open Workout' };
  if (/^course/i.test(label) || type === 'learning') return { href: `/learning?study=${encodeURIComponent(label)}`, text: '🎧 Study this course' }; // opens Study mode on this block's course
  if (/^(client|project|research|job)/i.test(label) || type === 'research') return { href: '/tech-hub', text: '💻 Open Tech Hub' };
  if (id === 'scroll') return { href: '/reels', text: '📱 Open Reels' };
  if (/^(bath|freshen)/.test(id) || id === 'anchor_bath') return { href: '/health', text: '🚿 Open Health' };
  if (id === 'sleep' || id === 'night_prep') return { href: '/music', text: '🌙 Wind-down music' };
  if (id === 'smoke' || id === 'smoke_pm' || id.startsWith('break')) return { href: '/music', text: '🎧 Music Room' };
  return null;
}
