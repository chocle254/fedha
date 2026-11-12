import { requireUser } from '../../../lib/require-user';
import { deskHistory, deskState, saveDesk, walkForward, liveResults, learnRule, DESK, RULES, ruleOf } from '../../../lib/desk';
import { marketRead } from '../../../lib/desk-daily';

// Trading → Channels → The Desk: the market read, how the Desk's picks have done (on history and since it went
// live), the latest scored signals, the daily reviews, and the real-money switch.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const user = await requireUser(req, res);
  if (!user) return;

  if (req.method === 'POST') {
    const b = req.body || {};
    if (typeof b.real === 'boolean') await saveDesk(user.id, { real: b.real });
    if (b.refresh) await marketRead(user.id, { force: true }).catch(() => null);
  } else if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const history = await deskHistory(user.id);
    const [state, live] = await Promise.all([deskState(user.id), liveResults(user.id, history)]);
    const rule = ruleOf(state);
    // First visit after the update: record the comparison now (it only switches rules in the nightly review).
    if (!state.rule_check && history.length >= DESK.minHistory) {
      const check = learnRule(history, rule);
      state.rule_check = { at: new Date().toISOString(), rows: check.rows, use: rule };
      await saveDesk(user.id, { rule_check: state.rule_check }).catch(() => null);
    }
    const { seq, ...wf } = walkForward(history, rule); // seq is only for the daily rule check
    return res.status(200).json({
      real: state.real === true,
      market: state.market || null,
      reviews: state.reviews || [],
      closed: history.length, needed: DESK.minHistory,
      history: wf,
      coachTrusted: state.coach_trusted === true, coachCheck: state.coach_check || null,
      rule, ruleLabel: RULES[rule].label, ruleCheck: state.rule_check || null, ruleLog: state.rule_log || [],
      rules: Object.fromEntries(Object.entries(RULES).map(([k, v]) => [k, v.label])),
      live,
    });
  } catch (e) {
    return res.status(500).json({ error: 'Could not load the Desk.' });
  }
}
