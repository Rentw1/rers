import * as Notifications from 'expo-notifications';
import { startOfDay, startOfMonth, money } from './format';
import * as repo from './repo';

export interface BudgetState {
  budget: repo.Budget;
  spent: number;
  ratio: number;
}

export async function budgetStates(): Promise<BudgetState[]> {
  const budgets = await repo.listBudgets();
  const out: BudgetState[] = [];
  for (const b of budgets) {
    const since = b.period === 'day' ? startOfDay() : startOfMonth();
    const { costMicro } = await repo.usageTotals(since, b.scope === 'all' ? undefined : b.scope);
    out.push({ budget: b, spent: costMicro, ratio: b.limitMicro > 0 ? costMicro / b.limitMicro : 0 });
  }
  return out;
}

/** Hard budgets already exhausted for this provider (sending should be confirmed). */
export async function blockingBudgets(providerId: string): Promise<BudgetState[]> {
  return (await budgetStates()).filter((s) => s.budget.hard && s.ratio >= 1 && (s.budget.scope === 'all' || s.budget.scope === providerId));
}

/** Local notification once per period when a budget crosses 80% or 100%. */
export async function notifyBudgets(): Promise<void> {
  for (const s of await budgetStates()) {
    if (s.ratio < 0.8) continue;
    const periodStart = s.budget.period === 'day' ? startOfDay() : startOfMonth();
    const level = s.ratio >= 1 ? 2 : 1;
    const lastLevel = s.budget.notifiedAt && s.budget.notifiedAt >= periodStart ? (s.budget.notifiedAt % 10 === 2 ? 2 : 1) : 0;
    if (level <= lastLevel) continue;
    const scope = s.budget.scope === 'all' ? 'общий' : s.budget.scope;
    const period = s.budget.period === 'day' ? 'дневной' : 'месячный';
    try {
      const perm = await Notifications.getPermissionsAsync();
      if (perm.granted) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: level === 2 ? 'Бюджет исчерпан' : 'Бюджет почти исчерпан',
            body: `${period[0]!.toUpperCase()}${period.slice(1)} ${scope} бюджет: ${money(s.spent)} из ${money(s.budget.limitMicro)} (${Math.round(s.ratio * 100)}%)`,
          },
          trigger: null,
        });
      }
    } catch {
      // notifications unavailable
    }
    // Encode the level in the last digit of the timestamp.
    await repo.saveBudget({ ...s.budget, notifiedAt: Math.floor(Date.now() / 10) * 10 + level });
  }
}
