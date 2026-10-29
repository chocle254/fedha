// What Luxe would record for one captured M-Pesa / Ziidi message (or why it skips it). Used to preview on the
// Wallets card now, and by automatic recording later. Pure: everything it needs comes in `ctx`.
//
// ctx = {
//   wallets,                 every wallet (M-Pesa wallets have Ziidi pockets: pocket 'ziidi' / 'ziidi_locked')
//   sims: { 1: walletId, 2: walletId },
//   own:  { 1: '0719304501', 2: '0182***738' },   your own number on each SIM (for SIM-to-SIM transfers)
//   rules, activeLoanIds, loans,                  learned categories / loan links (lib/sms-parser.js)
//   txns,                    Luxe transactions around these dates (to never count anything twice)
//   rows,                    the other captured messages (to pair the two halves of a SIM-to-SIM transfer)
// }
//
// Never counted twice:
//   - Ziidi's own "invested / withdrawn ... transaction code X" texts confirm an M-Pesa text that records the move.
//   - A SIM-to-SIM transfer sends two texts (sent on one SIM, received on the other): recorded once.
//   - NestLink payouts and UpesiPay top-ups are already recorded by Luxe's own NestLink / UpesiPay connections.
//   - Anything that matches a transaction already in Luxe (same wallet, amount and direction within 6 hours,
//     e.g. one you typed in yourself) is linked to it instead of added again.
import { categoryFor, normPhone, loanIdOf, ASK } from './sms-parser';

const H = 3600e3;
const near = (a, b, tol = 0.011) => Math.abs(Number(a) - Number(b)) <= tol;
const fmt = (n) => `KES ${Number(n).toLocaleString('en-KE', { maximumFractionDigits: 2 })}`;

function samePhone(a, b) {
  const x = normPhone(a); const y = normPhone(b);
  if (!x || !y) return false;
  if (!x.includes('*') && !y.includes('*')) return x === y;
  const [full, masked] = x.includes('*') ? [y, x] : [x, y];
  if (full.includes('*')) return full === masked;
  const [head, tail] = masked.split('***');
  return full.startsWith(head) && full.endsWith(tail);
}

export function walletName(ctx, id) { return ctx.wallets.find((w) => w.id === id)?.name || id; }
const pocket = (ctx, parentId, kind) => ctx.wallets.find((w) => w.parent_id === parentId && w.pocket === kind) || null;

// An existing Luxe transaction this message is the same as (so it is not added again).
function existing(ctx, { walletId, amount, dir, at, match }) {
  const t = new Date(at).getTime();
  return (ctx.txns || []).find((x) => {
    if (String(x.id).startsWith('sms_')) return false;
    if (Math.abs(new Date(x.date).getTime() - t) > 6 * H || !near(x.amount, amount, 0.6)) return false;
    if (match && !match.test(String(x.description || ''))) return false;
    const out = x.wallet_id === walletId && (x.type === 'expense' || x.type === 'transfer');
    const inn = (x.wallet_id === walletId && x.type === 'income') || (x.to_wallet_id === walletId && x.type === 'transfer');
    return dir === 'out' ? out : inn;
  }) || null;
}

const skip = (summary, extra = {}) => ({ action: 'skip', summary, entries: [], ...extra });

export function planMessage(row, ctx) {
  const p = row.parsed;
  if (!p) return skip('Not understood');
  const at = row.received_at;
  const wallet = row.wallet_id && !ctx.wallets.find((w) => w.id === row.wallet_id)?.pocket ? row.wallet_id : ctx.sims?.[row.sim_slot] || null;
  const otherSlot = row.sim_slot === 1 ? 2 : row.sim_slot === 2 ? 1 : null;
  const feeEntry = (w) => (p.cost > 0 ? [{ type: 'expense', wallet_id: w, amount: p.cost, category: 'fees', description: `M-Pesa fee${p.party ? `: ${p.party}` : ''}` }] : []);

  // ── Nothing to record ─────────────────────────────────────────────────────
  if (p.kind === 'failed') return skip(`Failed${p.party ? ` payment to ${p.party}` : ''}: no money moved`);
  if (p.kind === 'balance_check') return p.cost > 0 && wallet ? { action: 'record', summary: `Balance check fee ${fmt(p.cost)}`, entries: feeEntry(wallet) } : skip('Balance check');
  if (p.kind === 'ziidi') {
    if (p.action === 'invest' || p.action === 'withdraw') return skip(`Ziidi confirmation of ${p.mpesaCode || 'an M-Pesa move'} (recorded from the M-Pesa text)`);
    if (p.action === 'lock') {
      // Which account: the one whose Locked pocket ends at the stated balance.
      const lockedW = ctx.wallets.filter((w) => w.pocket === 'ziidi_locked').find((w) => near(w.balance, p.lockedAfter, 1) || near(Number(w.balance) + p.amount, p.lockedAfter, 1))
        || pocket(ctx, ctx.sims?.[row.sim_slot], 'ziidi_locked');
      if (!lockedW) return { action: 'ask', summary: `Locked ${fmt(p.amount)} in Ziidi: which account?`, entries: [] };
      const zW = pocket(ctx, lockedW.parent_id, 'ziidi');
      const dup = existing(ctx, { walletId: lockedW.id, amount: p.amount, dir: 'in', at });
      if (dup) return skip(`Already in Luxe: ${dup.description || 'lock'}`);
      return { action: 'record', summary: `Lock ${fmt(p.amount)}: ${walletName(ctx, zW?.id)} → ${walletName(ctx, lockedW.id)}`, entries: [{ type: 'transfer', wallet_id: zW?.id, to_wallet_id: lockedW.id, amount: p.amount, description: 'Lock in Ziidi' }] };
    }
    if (p.action === 'unlock') {
      const lockedW = ctx.wallets.filter((w) => w.pocket === 'ziidi_locked').find((w) => near(w.balance, p.amount, 1)) || pocket(ctx, ctx.sims?.[row.sim_slot], 'ziidi_locked');
      return lockedW
        ? { action: 'record', summary: `Start 72 h unlock of ${fmt(p.amount)} from ${walletName(ctx, lockedW.id)}`, entries: [], unlock: { parentId: lockedW.parent_id, amount: p.amount } }
        : { action: 'ask', summary: `Unlock of ${fmt(p.amount)}: which account?`, entries: [] };
    }
    return skip(p.action === 'lock_echo' ? 'Second text for the same lock' : 'Ziidi information');
  }
  if (!wallet) return { action: 'ask', summary: 'Which M-Pesa account? (SIM not known)', entries: [] };
  const name = walletName(ctx, wallet);

  // ── M-Pesa ↔ Ziidi ────────────────────────────────────────────────────────
  if (p.ziidiMove) {
    const z = pocket(ctx, wallet, 'ziidi');
    if (!z) return { action: 'ask', summary: `${name} has no Ziidi pocket in Luxe yet`, entries: [] };
    const [from, to] = p.ziidiMove === 'in' ? [wallet, z.id] : [z.id, wallet];
    const dup = existing(ctx, { walletId: to, amount: p.amount, dir: 'in', at });
    if (dup) return skip(`Already in Luxe: ${dup.description || 'Ziidi move'}`);
    return { action: 'record', summary: `${p.ziidiMove === 'in' ? 'Push to' : 'Withdraw from'} Ziidi ${fmt(p.amount)}: ${walletName(ctx, from)} → ${walletName(ctx, to)}`, entries: [{ type: 'transfer', wallet_id: from, to_wallet_id: to, amount: p.amount, description: p.ziidiMove === 'in' ? 'Push to Ziidi' : 'Withdraw to M-Pesa' }, ...feeEntry(wallet)] };
  }

  // ── Fuliza (a 'borrowed' loan per M-Pesa account) ─────────────────────────
  if (p.kind === 'fuliza_draw') {
    return { action: 'record', summary: `Fuliza lent ${fmt(p.amount)} to ${name}${p.fuliza?.fee ? ` (fee ${fmt(p.fuliza.fee)})` : ''} · you owe Fuliza ${fmt(p.fuliza?.owed ?? p.amount)}`, entries: [], fuliza: { walletId: wallet, borrowed: p.amount, fee: p.fuliza?.fee || 0, owed: p.fuliza?.owed ?? null, due: p.fuliza?.due || null } };
  }
  if (p.kind === 'fuliza_repay') {
    return { action: 'record', summary: `Fuliza ${p.fully ? 'fully repaid' : 'part repaid'} ${fmt(p.amount)} from ${name}`, entries: [], fuliza: { walletId: wallet, repaid: p.amount, fully: !!p.fully } };
  }

  // ── Between your own two SIMs ─────────────────────────────────────────────
  const otherWallet = otherSlot ? ctx.sims?.[otherSlot] : null;
  const toOwn = otherSlot && ctx.own?.[otherSlot] && samePhone(p.phone, ctx.own[otherSlot]);
  if (toOwn && otherWallet && (p.kind === 'sent' || p.kind === 'received')) {
    const [from, to] = p.kind === 'sent' ? [wallet, otherWallet] : [otherWallet, wallet];
    if (p.kind === 'received') {
      const half = (ctx.rows || []).find((r) => r.id !== row.id && r.sim_slot === otherSlot && r.parsed?.kind === 'sent' && near(r.parsed.amount, p.amount) && Math.abs(new Date(r.received_at) - new Date(at)) < 15 * 60e3);
      if (half) return skip(`Other half of the ${walletName(ctx, from)} → ${walletName(ctx, to)} transfer`);
    }
    const dup = existing(ctx, { walletId: to, amount: p.amount, dir: 'in', at });
    if (dup) return skip(`Already in Luxe: ${dup.description || 'transfer'}`);
    return { action: 'record', summary: `Transfer ${fmt(p.amount)}: ${walletName(ctx, from)} → ${walletName(ctx, to)}`, entries: [{ type: 'transfer', wallet_id: from, to_wallet_id: to, amount: p.amount, description: 'Between my SIMs' }, ...(p.kind === 'sent' ? feeEntry(wallet) : [])] };
  }

  // ── Recorded elsewhere in Luxe already ────────────────────────────────────
  if (p.kind === 'received' && /^NESTLINK/i.test(p.party || '')) {
    const dup = existing(ctx, { walletId: wallet, amount: p.amount, dir: 'in', at: at, match: /nestlink/i }) || existing(ctx, { walletId: wallet, amount: p.amount, dir: 'in', at });
    return dup ? skip(`Already in Luxe: ${dup.description}`) : skip('NestLink payout: Luxe records these from NestLink itself');
  }
  if (p.kind === 'paybill' && /upesi\s*pay/i.test(`${p.account} ${p.party}`)) {
    const dup = existing(ctx, { walletId: wallet, amount: p.amount, dir: 'out', at, match: /upesi/i });
    return dup ? skip(`Already in Luxe: ${dup.description}`) : skip('UpesiPay top-up: Luxe records these from UpesiPay itself');
  }

  // ── Everything else ───────────────────────────────────────────────────────
  const signedOut = ['sent', 'paybill', 'paid', 'airtime', 'withdraw'].includes(p.kind);
  const dup = existing(ctx, { walletId: wallet, amount: p.amount, dir: signedOut ? 'out' : 'in', at });
  if (dup) return skip(`Already in Luxe: ${dup.description || dup.category || 'same amount'}`);

  if (p.kind === 'withdraw' || p.kind === 'deposit') {
    const cash = ctx.wallets.find((w) => w.type === 'cash' && !w.pocket);
    if (!cash) return { action: 'ask', summary: 'Agent cash: add a Cash wallet', entries: [] };
    const [from, to] = p.kind === 'withdraw' ? [wallet, cash.id] : [cash.id, wallet];
    return { action: 'record', summary: `${p.kind === 'withdraw' ? 'Withdrawn' : 'Deposited'} ${fmt(p.amount)}: ${walletName(ctx, from)} → ${walletName(ctx, to)}`, entries: [{ type: 'transfer', wallet_id: from, to_wallet_id: to, amount: p.amount, description: p.party ? `Agent ${p.party}` : 'Agent' }, ...feeEntry(wallet)] };
  }
  if (p.kind === 'reversal') return { action: 'record', summary: `Reversal ${fmt(p.amount)} back to ${name}`, entries: [{ type: 'income', wallet_id: wallet, amount: p.amount, category: 'other', description: 'M-Pesa reversal' }] };

  // Airtime and data bundles (Safaricom Offers / Tunukiwa / "of airtime").
  const airtime = p.kind === 'airtime' || /safaricom offers|tunukiwa|bundles|airtime|data/i.test(`${p.party} ${p.account}`);
  const choice = airtime ? 'airtime' : categoryFor(p, ctx.rules || {}, ctx.activeLoanIds);
  const who = p.party || 'someone';
  if (!choice) return { action: 'ask', summary: `${p.kind === 'received' ? 'Received' : 'Paid'} ${fmt(p.amount)} ${p.kind === 'received' ? 'from' : 'to'} ${who}: pick a category`, entries: [] };
  if (loanIdOf(choice) || choice === 'loan_new') {
    const loan = (ctx.loans || []).find((l) => l.id === loanIdOf(choice));
    return { action: 'record', summary: loan ? `${choice.startsWith('loanadd:') ? (loan.type === 'lent' ? 'Lent more to' : 'Borrowed more from') : 'Loan payment:'} ${loan.contact_name.trim()} ${fmt(p.amount)}` : `New loan ${fmt(p.amount)} ${p.kind === 'received' ? 'from' : 'to'} ${who}`, entries: feeEntry(wallet), loan: { choice, walletId: wallet, amount: p.amount, party: who } };
  }
  const type = p.kind === 'received' ? 'income' : 'expense';
  return {
    action: 'record',
    summary: `${type === 'income' ? 'Income' : 'Expense'} ${fmt(p.amount)} ${type === 'income' ? 'from' : 'to'} ${who}`,
    entries: [{ type, wallet_id: wallet, amount: p.amount, category: choice, description: p.account && !/^\d+$/.test(p.account) ? `${who} · ${p.account}` : who }, ...feeEntry(wallet)],
  };
}

// Your own number on each SIM, guessed from the messages: the same name sends from SIM a to one number and is
// received on SIM b from a DIFFERENT number -> those two numbers are your two SIMs. (A friend who appears on both
// SIMs has the same number on both sides, so they are not mistaken for you.) The pair seen most often wins.
export function suggestOwn(rows) {
  const norm = (s) => String(s || '').toUpperCase().replace(/\s+/g, ' ').trim();
  const pairs = new Map();
  const sent = rows.filter((r) => r.parsed?.kind === 'sent' && r.parsed.phone && r.sim_slot);
  const got = rows.filter((r) => r.parsed?.kind === 'received' && r.parsed.phone && r.sim_slot);
  for (const s of sent) {
    for (const r of got) {
      if (r.sim_slot === s.sim_slot || norm(s.parsed.party) !== norm(r.parsed.party) || samePhone(s.parsed.phone, r.parsed.phone)) continue;
      const key = `${r.sim_slot}=${normPhone(s.parsed.phone)}|${s.sim_slot}=${normPhone(r.parsed.phone)}`;
      pairs.set(key, (pairs.get(key) || 0) + 1);
    }
  }
  const best = [...pairs.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!best) return {};
  return Object.fromEntries(best[0].split('|').map((kv) => kv.split('=')));
}

export { ASK };
