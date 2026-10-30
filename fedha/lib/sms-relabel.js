// Give an M-Pesa message that is already recorded its real category (it is recorded straight away, as Other when
// Luxe doesn't know the person yet). Used by Wallets → M-Pesa messages and the "what was it?" card (SmsCategoryPrompt).
// The transaction keeps its id (sms_<message id>_0), so it can never be recorded twice and the balance nets out.
import { getTransaction } from './db';
import { clientIdOf, loanIdOf, ASK } from './sms-parser';
import { applyClientPayment } from './client-pay';
import { loanBalance, payLoan, addToLoan } from './finance-actions';

// A message that is already recorded (often as Other, because Luxe records money straight away and lets you
// categorise it after) gets a category: relabel that same transaction (same id, so it is never added twice and
// the balance nets out), or hand it to the client / loan it belongs to.
export async function relabelSms(x, choice, app) {
  const { loans = [], wallets = [], clientProjects = [], updateClientProject, addTransaction, removeTransaction, addLoan, updateLoan } = app;
  if (!choice || choice === ASK || !removeTransaction || !addTransaction) return;
  const id = `sms_${x.id}_0`;
  const t = await getTransaction(id).catch(() => null);
  if (!t || !['income', 'expense'].includes(t.type)) return;
  const party = x.parsed?.party || 'someone';
  if (clientIdOf(choice)) {
    if (t.type !== 'income' || t.client_project_id) return;
    const project = clientProjects.find((c) => c.id === clientIdOf(choice));
    await removeTransaction(id);
    await addTransaction({ ...t, category: 'freelance', description: `${project ? project.client_name : party} · client payment`, client_project_id: project?.id || null, skipSavingsCut: true });
    if (project) await applyClientPayment(project, { amount: t.amount, walletId: t.wallet_id, txId: id, updateClientProject }).catch(() => null);
    return;
  }
  if (loanIdOf(choice) || choice === 'loan_new') {
    // The loan records its own money movement, so the plain transaction goes.
    await removeTransaction(id);
    const amount = Number(t.amount);
    const walletId = t.wallet_id;
    const currency = wallets.find((w) => w.id === walletId)?.currency || 'KES';
    const loan = loans.find((l) => l.id === loanIdOf(choice));
    if (choice === 'loan_new') {
      const l = await addLoan({ type: t.type === 'expense' ? 'lent' : 'borrowed', contact_name: party, amount: 0, remaining: 0 });
      await addToLoan(l, { amount, walletId, wallets, currency, addTransaction, updateLoan, note: 'from M-Pesa' });
    } else if (loan && choice.startsWith('loanadd:')) {
      await addToLoan(loan, { amount, walletId, wallets, currency, addTransaction, updateLoan, note: 'from M-Pesa' });
    } else if (loan) {
      const owed = loanBalance(loan);
      await payLoan(loan, { amount: Math.min(amount, owed), walletId, wallets, currency, addTransaction, updateLoan });
      if (amount - owed > 0.5) await addTransaction({ type: t.type, wallet_id: walletId, amount: Math.round((amount - owed) * 100) / 100, category: 'other', description: `${party} (over the loan)`, date: t.date, skipSavingsCut: true });
    } else {
      await addTransaction({ ...t, skipSavingsCut: true }); // loan no longer there: put it back as it was
    }
    return;
  }
  if (t.category === choice || t.client_project_id) return;
  await removeTransaction(id);
  await addTransaction({ ...t, category: choice, skipSavingsCut: true });
}
