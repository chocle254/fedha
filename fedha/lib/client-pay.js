// Client payments that arrive as M-Pesa messages (choice 'client:<projectId>' in the SMS category picker).
// Same maths as Tech Hub's clientProjectTotals: agreed (plus paid change requests) minus everything paid.
import { genId, todayISO } from './utils';

export function clientTotals(p) {
  const previousPaid = Number(p.previously_paid || 0) + (p.change_requests || []).reduce((s, x) => s + Number(x.previously_paid || 0), 0);
  const payments = (p.payments || []).reduce((s, x) => s + Number(x.amount || 0), 0);
  const agreed = Number(p.agreed_amount || 0) + (p.change_requests || []).reduce((s, x) => s + Number(x.amount || 0), 0);
  const paid = previousPaid + payments;
  return { agreed, paid, remaining: Math.max(0, agreed - paid) };
}

// Takes the payment off what the client owes (never more than they owe) and remembers which transaction it was.
// Returns the updated project, or null when there was nothing left to pay (then it is just Freelance income).
export async function applyClientPayment(project, { amount, walletId, txId, updateClientProject, note = 'from M-Pesa' }) {
  if (!project) return null;
  if ((project.payments || []).some((x) => txId && x.transaction_id === txId)) return project; // already applied
  const left = clientTotals(project).remaining;
  if (!(left > 0)) return null;
  const paid = Math.min(Number(amount) || 0, left);
  return updateClientProject({
    ...project,
    payments: [{ id: genId(), amount: paid, date: todayISO(), wallet_id: walletId, note, transaction_category: 'freelance', transaction_id: txId, from_sms: true }, ...(project.payments || [])],
  });
}
