import { useCallback, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { getTransaction } from '../lib/db';
import { payLoan, addToLoan, loanBalance } from '../lib/finance-actions';
import { requestUnlock } from '../lib/ziidi';
import { loanIdOf } from '../lib/sms-parser';
import { showNotif } from '../lib/notifications';
import { applyClientPayment } from '../lib/client-pay';

// Invisible. While Luxe is open it records the M-Pesa / Ziidi messages that arrived since automatic recording was
// switched on (the server decides what each one is: lib/sms-plan.js, /api/sms/ready), with the same code as a
// transaction you type in, so balances, budgets and the 30% savings question all behave as usual.
// Every transaction id is sms_<message id>_<n>, so a message can never be recorded twice.
const POLL_MS = 5 * 60e3; // Vercel CPU; reopening Luxe checks at once

// Messages this phone has already recorded (newest 300), with the transactions they made.
const DONE_KEY = 'luxe_sms_done';
const doneMap = () => { try { return JSON.parse(localStorage.getItem(DONE_KEY) || '{}'); } catch { return {}; } };
const wasDone = (id) => doneMap()[id] || null;
function markDone(id, ids) {
  try {
    const m = doneMap(); m[id] = ids || [];
    const keys = Object.keys(m);
    for (const k of keys.slice(0, Math.max(0, keys.length - 300))) delete m[k];
    localStorage.setItem(DONE_KEY, JSON.stringify(m));
  } catch { /* private mode */ }
}

export default function SmsAutoRecorder() {
  const app = useApp();
  const ref = useRef(app);
  ref.current = app;
  const busy = useRef(false);

  const record = useCallback(async (item) => {
    const { wallets, loans, addTransaction, addLoan, updateLoan } = ref.current;
    const plan = item.plan;
    const date = String(item.received_at).slice(0, 10);
    const ids = [];
    const tx = async (n, e, extra = {}) => {
      const id = `sms_${item.id}_${n}`;
      if (await getTransaction(id)) { ids.push(id); return; }
      const w = wallets.find((x) => x.id === e.wallet_id);
      await addTransaction({ id, date, currency: w?.currency || 'KES', ...e, ...extra });
      ids.push(id);
    };

    // Plain transactions (income, expense, transfers, fees).
    let n = 0;
    for (const e of plan.entries || []) await tx(n++, e, e.type === 'income' ? {} : { skipSavingsCut: true });

    // Loans picked for this person.
    if (plan.loan) {
      const { choice, walletId, amount, party } = plan.loan;
      const loan = loans.find((l) => l.id === loanIdOf(choice));
      const currency = wallets.find((w) => w.id === walletId)?.currency || 'KES';
      if (choice === 'loan_new') {
        const out = item.parsed?.kind !== 'received';
        const l = await addLoan({ type: out ? 'lent' : 'borrowed', contact_name: party, amount: 0, remaining: 0 });
        await addToLoan(l, { amount, walletId, wallets, currency, addTransaction, updateLoan, note: 'from M-Pesa' });
      } else if (loan && choice.startsWith('loanadd:')) {
        await addToLoan(loan, { amount, walletId, wallets, currency, addTransaction, updateLoan, note: 'from M-Pesa' });
      } else if (loan) {
        const owed = loanBalance(loan);
        await payLoan(loan, { amount: Math.min(amount, owed), walletId, wallets, currency, addTransaction, updateLoan });
        // Paid more than was owed: the rest is ordinary money in / out.
        if (amount - owed > 0.5) await tx(n++, { type: loan.type === 'lent' ? 'income' : 'expense', wallet_id: walletId, amount: Math.round((amount - owed) * 100) / 100, category: 'other', description: `${party} (over the loan)` });
      }
    }

    // A client's payment: the Freelance income above, also taken off what that Tech Hub client owes.
    if (plan.client) {
      const { clientProjects = [], updateClientProject } = ref.current;
      const project = clientProjects.find((c) => c.id === plan.client.projectId);
      const incomeId = ids[0] || null;
      if (project && updateClientProject) await applyClientPayment(project, { amount: plan.client.amount, walletId: plan.entries?.[0]?.wallet_id, txId: incomeId, updateClientProject }).catch(() => null);
    }

    // Fuliza: a 'borrowed' loan per M-Pesa account, its balance set from what Safaricom says is outstanding.
    if (plan.fuliza) {
      const f = plan.fuliza;
      const w = wallets.find((x) => x.id === f.walletId);
      const name = `Fuliza · ${w?.name || 'M-Pesa'}`;
      let loan = ref.current.loans.find((l) => l.type === 'borrowed' && l.contact_name === name);
      if (f.borrowed > 0) {
        if (!loan) loan = await addLoan({ type: 'borrowed', contact_name: name, amount: 0, remaining: 0, notes: 'Safaricom overdraft, kept in step by your M-Pesa messages' });
        loan = await addToLoan(loan, { amount: f.borrowed, walletId: f.walletId, wallets, currency: w?.currency || 'KES', addTransaction, updateLoan, note: f.fee ? `fee ${f.fee}` : 'Fuliza' });
        if (f.owed != null) await updateLoan({ ...loan, remaining: f.owed, amount: Math.max(Number(loan.amount) || 0, f.owed), notes: [loan.notes, f.due ? `due ${f.due}` : null].filter(Boolean).join(' · ') });
      } else if (f.repaid > 0) {
        if (loan && loan.status !== 'settled') {
          const owed = loanBalance(loan);
          const paid = await payLoan(loan, { amount: Math.min(f.repaid, owed), walletId: f.walletId, wallets, currency: w?.currency || 'KES', addTransaction, updateLoan });
          if (f.fully && paid?.status !== 'settled') await updateLoan({ ...paid, remaining: 0, status: 'settled' });
          if (f.repaid - owed > 0.5) await tx(n++, { type: 'expense', wallet_id: f.walletId, amount: Math.round((f.repaid - owed) * 100) / 100, category: 'fees', description: 'Fuliza charges' });
        } else {
          await tx(n++, { type: 'expense', wallet_id: f.walletId, amount: f.repaid, category: 'fees', description: 'Fuliza repayment' });
        }
      }
    }

    // Ziidi unlock: starts the same 72-hour unlock as the Wallets page.
    if (plan.unlock) await requestUnlock(plan.unlock.parentId, plan.unlock.amount, item.received_at);
    return ids;
  }, []);

  const run = useCallback(async () => {
    if (busy.current || document.visibilityState !== 'visible' || ref.current.loading) return;
    busy.current = true;
    try {
      const r = await fetch('/api/sms/ready', { cache: 'no-store' });
      if (!r.ok) return;
      const { items = [] } = await r.json();
      let done = 0;
      const stated = {}; // per wallet: the last "New M-PESA balance" in this batch
      for (const item of items) {
        try {
          // Recorded on this phone already but the server never heard (the connection dropped in between):
          // tell it again, and do not record it twice (a Fuliza loan entry would be counted double).
          const seen = wasDone(item.id);
          const ids = seen || await record(item);
          if (!seen) markDone(item.id, ids);
          if (item.parsed?.balance != null && item.wallet_id && item.parsed.kind !== 'failed') stated[item.wallet_id] = { balance: Number(item.parsed.balance), at: item.received_at };
          await fetch('/api/sms/ready', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, transaction_ids: ids }) });
          done++;
          // Recorded as Other because Luxe doesn't know this person yet: ask for the category (it relabels in place).
          if (item.plan?.needsCategory) {
            const p = item.parsed || {};
            showNotif({ title: `${p.kind === 'received' ? '💸 Received' : 'Paid'} KSh ${Number(p.amount || 0).toLocaleString()} ${p.kind === 'received' ? 'from' : 'to'} ${p.party || 'someone'}`, body: 'Recorded as Other so your balance is right. Open Wallets → M-Pesa messages to pick a category, a client or a loan.', tag: `sms-cat-${item.id}`, url: '/wallets' });
          }
        } catch (e) { console.warn('[fedha] SMS record failed:', item.id, e?.message); }
      }
      if (done > 1) showNotif({ title: `✓ ${done} M-Pesa transactions recorded`, body: 'From your messages. Tap a transaction to change or delete it.', tag: 'sms-batch' });
      // The check: M-Pesa states its balance in every text. If Luxe's wallet does not agree after recording, say
      // so straight away (it never changes your balance by itself), so a slip is caught the day it happens.
      if (done) {
        await new Promise((res) => setTimeout(res, 1500));
        for (const [walletId, st] of Object.entries(stated)) {
          if (Date.now() - new Date(st.at).getTime() > 15 * 60e3) continue; // an old text: other things may have happened since
          const w = (ref.current.wallets || []).find((x) => x.id === walletId);
          if (!w || Math.abs(Number(w.balance) - st.balance) <= 1) continue;
          const k = (n) => `KSh ${Number(n).toLocaleString('en-KE', { maximumFractionDigits: 2 })}`;
          showNotif({ title: `⚠️ ${w.name}: Luxe and M-Pesa disagree`, body: `M-Pesa says ${k(st.balance)}, Luxe has ${k(w.balance)}. Open Wallets and set ${w.name} to ${k(st.balance)}.`, tag: `sms-balance-${walletId}`, url: '/wallets' });
        }
      }
    } catch { /* offline */ } finally { busy.current = false; }
  }, [record]);

  useEffect(() => {
    run();
    const t = setInterval(run, POLL_MS);
    const on = () => run();
    document.addEventListener('visibilitychange', on);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', on); };
  }, [run]);

  return null;
}
