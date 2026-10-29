import { useCallback, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { getTransaction } from '../lib/db';
import { payLoan, addToLoan, loanBalance } from '../lib/finance-actions';
import { requestUnlock } from '../lib/ziidi';
import { loanIdOf } from '../lib/sms-parser';
import { showNotif } from '../lib/notifications';

// Invisible. While Luxe is open it records the M-Pesa / Ziidi messages that arrived since automatic recording was
// switched on (the server decides what each one is: lib/sms-plan.js, /api/sms/ready), with the same code as a
// transaction you type in, so balances, budgets and the 30% savings question all behave as usual.
// Every transaction id is sms_<message id>_<n>, so a message can never be recorded twice.
const POLL_MS = 45e3;

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
      for (const item of items) {
        try {
          const ids = await record(item);
          await fetch('/api/sms/ready', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, transaction_ids: ids }) });
          done++;
        } catch (e) { console.warn('[fedha] SMS record failed:', item.id, e?.message); }
      }
      if (done > 1) showNotif({ title: `✓ ${done} M-Pesa transactions recorded`, body: 'From your messages. Tap a transaction to change or delete it.', tag: 'sms-batch' });
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
