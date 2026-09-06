// Executes a Jarvis proposed action once the user has confirmed it.
// Jarvis works with human-readable names (a loan's contact_name, an income
// plan's name) since that's what it can see in the context summary and
// what's natural to say out loud — this module resolves those names back
// to real records before calling the actual db.js/finance-actions logic,
// and throws a clear error if a name doesn't match anything (rather than
// silently doing nothing or guessing).

import { getWallets, getLoans, getIncomePlans, getSetting, setSetting } from './db';
import { toggleIncomeReceived, settleLoan } from './finance-actions';
import { todayISO } from './utils';

function findByNameLoose(list, field, needle) {
  const target = needle.trim().toLowerCase();
  return (
    list.find((item) => (item[field] || '').trim().toLowerCase() === target) ||
    list.find((item) => (item[field] || '').trim().toLowerCase().includes(target))
  );
}

// ctx: { addTransaction, removeTransaction, updateLoan, updateIncomePlan,
//        currency, saveFoodLog } — the AppContext functions the caller
// (components/JarvisWidget.js) already has via useApp().
export async function executeProposedAction(action, ctx) {
  const { tool, args } = action;
  const wallets = await getWallets();

  switch (tool) {
    case 'propose_transaction': {
      const wallet = args.wallet_name
        ? findByNameLoose(wallets, 'name', args.wallet_name) || wallets[0]
        : wallets[0];
      if (!wallet) throw new Error('No wallet exists to record this against — add one first.');
      return ctx.addTransaction({
        type: args.type,
        amount: Number(args.amount),
        wallet_id: wallet.id,
        category: args.category || 'other',
        description: args.description || '',
        date: todayISO(),
        currency: ctx.currency,
      });
    }

    case 'propose_settle_loan': {
      const loans = await getLoans();
      const loan = findByNameLoose(loans.filter((l) => l.status === 'active'), 'contact_name', args.contact_name);
      if (!loan) throw new Error(`Couldn't find an active loan with "${args.contact_name}".`);
      return settleLoan(loan, { wallets, currency: ctx.currency, addTransaction: ctx.addTransaction, updateLoan: ctx.updateLoan });
    }

    case 'propose_mark_income_received': {
      const plans = await getIncomePlans();
      const plan = findByNameLoose(plans.filter((p) => !p.is_received), 'name', args.name);
      if (!plan) throw new Error(`Couldn't find a pending income plan named "${args.name}".`);
      return toggleIncomeReceived(plan, { wallets, currency: ctx.currency, addTransaction: ctx.addTransaction, removeTransaction: ctx.removeTransaction, updateIncomePlan: ctx.updateIncomePlan });
    }

    case 'propose_log_meal': {
      return ctx.saveFoodLog({
        id: ctx.genId(),
        date: todayISO(),
        created_at: new Date().toISOString(),
        slot: args.slot,
        name: args.name,
        cal: Number(args.cal) || 0,
        protein: Number(args.protein) || 0,
      });
    }

    case 'propose_planner_block_edit': {
      const overrides = await getSetting(`planner_overrides_${todayISO()}`, {});
      const patch = {};
      if (args.new_time) patch.time = args.new_time;
      if (args.new_note) patch.note = args.new_note;
      const next = { ...overrides, [args.block_id]: { ...(overrides[args.block_id] || {}), ...patch } };
      await setSetting(`planner_overrides_${todayISO()}`, next);
      return next;
    }

    default:
      throw new Error(`Unknown action: ${tool}`);
  }
}

// Human-readable description shown in the confirmation card, so the user
// sees plain English rather than raw tool/argument names before approving.
export function describeProposedAction(action) {
  const { tool, args } = action;
  switch (tool) {
    case 'propose_transaction':
      return `${args.type === 'income' ? 'Add income' : 'Add expense'}: ${args.amount} (${args.category})${args.description ? ` — ${args.description}` : ''}${args.wallet_name ? ` from ${args.wallet_name}` : ''}`;
    case 'propose_settle_loan':
      return `Mark loan with ${args.contact_name} as settled`;
    case 'propose_mark_income_received':
      return `Mark income plan "${args.name}" as received`;
    case 'propose_log_meal':
      return `Log ${args.slot}: ${args.name} (${args.cal} cal${args.protein ? `, ${args.protein}g protein` : ''})`;
    case 'propose_planner_block_edit':
      return `Edit today's plan: ${args.new_time ? `move to ${args.new_time}` : ''}${args.new_note ? ` note: "${args.new_note}"` : ''}`;
    default:
      return tool;
  }
}
