// Shared finance actions — the logic that actually moves money when
// something is marked received/settled. Originally lived only inside
// pages/budgets.js as local functions; extracted here so
// components/JarvisWidget.js can trigger the exact same behavior when the
// user confirms a proposed action, instead of duplicating (and risking
// drifting from) the real logic.
//
// Each function takes the db.js functions it needs as arguments rather
// than importing them directly — this file has no React dependency, and
// callers (a page component with context, or the Jarvis widget) each
// already have their own reference to these via useApp() or a direct
// lib/db import, so there's no reason to couple this module to either.

import { todayISO } from './utils';

// Marks an income plan received: creates a real income transaction for the
// full expected amount and links it via settled_txn_id, or un-marks it by
// deleting that same transaction — mirrors pages/budgets.js exactly.
export async function toggleIncomeReceived(plan, { wallets, currency, addTransaction, removeTransaction, updateIncomePlan }) {
  if (!plan.is_received) {
    if (!wallets[0]) throw new Error('Add a wallet first so received income has somewhere to go.');
    const tx = await addTransaction({
      type: 'income',
      amount: Number(plan.expected_amount),
      wallet_id: wallets[0].id,
      category: 'other',
      description: `Income plan: ${plan.name}`,
      date: todayISO(),
      currency,
    });
    return updateIncomePlan({ ...plan, is_received: true, settled_txn_id: tx.id });
  } else {
    if (plan.settled_txn_id) await removeTransaction(plan.settled_txn_id);
    return updateIncomePlan({ ...plan, is_received: false, settled_txn_id: null });
  }
}

// Marks a loan settled: borrowed = you paying it back (expense), lent =
// them paying you back (income). One-directional, same as budgets.js.
export async function settleLoan(loan, { wallets, currency, addTransaction, updateLoan }) {
  if (loan.status === 'settled') return loan;
  if (!wallets[0]) throw new Error('Add a wallet first so this settlement has somewhere to go.');
  const amount = Number(loan.remaining || loan.amount);
  const tx = await addTransaction({
    type: loan.type === 'borrowed' ? 'expense' : 'income',
    amount,
    wallet_id: wallets[0].id,
    category: 'other',
    description: `Loan settled: ${loan.contact_name}`,
    date: todayISO(),
    currency,
  });
  return updateLoan({ ...loan, status: 'settled', settled_txn_id: tx.id });
}
