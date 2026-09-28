import { useApp } from '../context/AppContext';

// Single source of truth for Floating Balance. Discover and Food both use this.
export function useFloatingCash() {
  const { wallets, budgets, loans, currency } = useApp();
  const totalBalance = wallets.reduce((s, w) => s + Number(w.balance || 0), 0);
  const totalBudgeted = budgets.reduce((s, b) => s + Math.max(0, Number(b.allocated || 0) - Number(b.spent || 0)), 0);
  const totalOwed = loans
    .filter((l) => l.type === 'borrowed' && l.status === 'active')
    .reduce((s, l) => s + Number(l.remaining || l.amount || 0), 0);
  const floating = totalBalance - totalBudgeted - totalOwed;
  return { floating, totalBalance, totalBudgeted, totalOwed, currency };
}
