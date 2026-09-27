/**
 * E5 银行与信贷。
 *
 * 设计依据：design/game/eras/E5-maritime.md §11.7、E5-devplan §4.2。
 *
 * ⚠️ 银行**不是第六座建筑**，而是「科技 + UI 面板」（devplan §4.2 评审结论）。
 *    理由：E5 已经有造纸坊/印书坊/大学/航海港/图书馆五座建筑，
 *    再加一座会让建筑栏变成清单；而信贷本质是一种**操作**，不是设施。
 *
 * 信贷的用途很具体：印书坊（100 银）与大学（400 银）的成本里有白银，
 * 而白银只能出海带回。忍耐期最后一个"卡死"的可能就是"我没银造印书坊，
 * 没印书坊就产不出足够的典籍，没典籍就造不了大学"。
 * 信贷就是给这个死结留的**一条活路**：先借，用未来的航次还。
 *
 * 代价是利息 —— 让"借钱"是一个真实决策，而不是免费加速。
 */

/** 贷款额度上限（白银） */
export const LOAN_LIMIT = 2000;
/** 每次可借的步长（白银） */
export const LOAN_STEP = 500;
/** 每秒利息率：0.02%/秒 ≈ 每 50 秒滚 1%，温和但不可忽视 */
export const LOAN_INTEREST_PER_SEC = 0.0002;

/**
 * 可借额度：上限减去当前未还。
 * 借贷受科技门槛限制（enableBank），未解锁时额度为 0。
 */
export function getLoanCapacity(loan: number, bankEnabled: boolean): number {
  if (!bankEnabled) return 0;
  return Math.max(0, LOAN_LIMIT - Math.max(0, loan));
}

/**
 * 借款。返回新的贷款额与到手白银。
 *
 * 只在额度内借，不产生"超额借款"这种状态。
 */
export function borrow(
  loan: number,
  amount: number,
  bankEnabled: boolean
): { loan: number; gained: number } {
  const capacity = getLoanCapacity(loan, bankEnabled);
  const actual = Math.max(0, Math.min(amount, capacity));
  return { loan: loan + actual, gained: actual };
}

/**
 * 还款。返回新的贷款额与实际偿还额。
 *
 * actual 宁少不多：silver 不够时能还多少还多少，不会还成负数。
 */
export function repay(
  loan: number,
  silver: number,
  amount: number
): { loan: number; spent: number } {
  const actual = Math.max(0, Math.min(amount, Math.max(0, loan), Math.max(0, silver)));
  return { loan: loan - actual, spent: actual };
}

/**
 * 推进利息 dt 秒。
 *
 * 只增长不结算：利息进入贷款本金（复利式），玩家必须主动还。
 * 这样"拖着不还"有真实代价，而不会被静默地从白银里扣走
 * （静默扣款会让玩家永远搞不清自己为什么变穷）。
 */
export function tickBank(loan: number, dt: number): number {
  if (loan <= 0) return 0;
  return loan * (1 + LOAN_INTEREST_PER_SEC * dt);
}

/**
 * 是否应当警告玩家：贷款接近额度或利息累积较快时，
 * UI 应当给出提示（忍耐期最容易在这里翻车）。
 */
export function getLoanWarning(loan: number, bankEnabled: boolean): 'none' | 'high' | 'maxed' {
  if (!bankEnabled || loan <= 0) return 'none';
  if (loan >= LOAN_LIMIT - 1e-6) return 'maxed';
  if (loan >= LOAN_LIMIT * 0.6) return 'high';
  return 'none';
}
