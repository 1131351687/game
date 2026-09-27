// 银行与信贷面板（E5 远洋时代）
//
// ⚠️ 银行**不是第六座建筑**，而是「科技 + UI 面板」（E5-devplan §4.2 评审结论）。
//    理由：E5 已有造纸坊/印书坊/大学/航海港/图书馆五座建筑，再加一座会让
//    建筑栏变成清单；而信贷本质是一种**操作**，不是设施。
//
// 信贷解决的死结很具体：
//   印书坊（100 银）与大学（400 银）的成本里有白银，而白银只能出海带回。
//   "没银造印书坊 → 没印书坊就产不出足够典籍 → 没典籍就造不了大学"
//   信贷就是给这个死结留的一条活路：先借，用未来的航次还。
//
// 利息进入本金（不静默扣银）—— "拖着不还"因此有真实且可见的代价。

import { useState } from 'react';
import { useStore, toEngineState } from '../../state/store';
import { aggregateEffects } from '../../game/engine';
import { LOAN_LIMIT, LOAN_STEP, getLoanCapacity, getLoanWarning } from '../../game/e5/bank';
import { formatNumber } from '../../core/format';
import { Icon } from './Icon';

const SECTION_TITLE = 'text-xs uppercase tracking-wide text-gray-500';

/** 借贷按钮样式（银行主色 = 金色） */
const BANK_BTN =
  'inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-mono font-semibold tabular-nums transition-colors';

export function BankPanel({ className }: { className?: string }) {
  const state = useStore();
  const view = toEngineState(state);
  if (state.era !== 'E5') return null;

  const [open, setOpen] = useState(false);
  const eff = aggregateEffects(view);

  // 未解锁银行科技时整面板不渲染（与 RecordPanel 同理）
  if (!eff.bankEnabled) return null;

  const capacity = getLoanCapacity(state.loan, eff.bankEnabled);
  const warning = getLoanWarning(state.loan, eff.bankEnabled);

  return (
    <section
      className={
        className
          ? `${className} space-y-3 rounded-md border border-gray-800 bg-gray-900/30 px-3 py-3`
          : 'space-y-3 rounded-md border border-gray-800 bg-gray-900/30 px-3 py-3'
      }
    >
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center gap-2 rounded-md px-1 text-left transition-colors hover:bg-gray-800/50 hover:text-gray-100"
      >
        <span className="text-[10px] text-gray-500">{open ? '▼' : '▶'}</span>
        <Icon emoji="🏦" className="text-sm" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-gray-200">银行 · 信贷</div>
          <div className="truncate text-xs text-gray-500">
            先借白银造印书坊与大学，再用未来的航次还
          </div>
        </div>
        <span
          className={`shrink-0 font-mono text-xs tabular-nums ${
            warning === 'maxed' ? 'text-red-300' : warning === 'high' ? 'text-orange-300' : 'text-gray-400'
          }`}
        >
          欠款 {formatNumber(state.loan, 0)}
        </span>
      </button>

      {open && (
        <div className="space-y-3">
          {/* ── 贷款仪表 ── */}
          <div className="grid grid-cols-3 gap-2">
            <Metric label="当前欠款" value={formatNumber(state.loan, 0)} tone={warning === 'none' ? 'gray' : 'warn'} />
            <Metric label="可借额度" value={formatNumber(capacity, 0)} tone="gray" />
            <Metric label="白银" value={formatNumber(state.silver, 0)} tone="gray" />
          </div>

          {/* ── 警告 ── */}
          {warning === 'maxed' && (
            <div className="rounded-md bg-red-500/10 px-3 py-1.5 text-xs text-red-300">
              借款已达上限 {formatNumber(LOAN_LIMIT, 0)} —— 利息仍在累积，尽快还款。
            </div>
          )}
          {warning === 'high' && (
            <div className="rounded-md bg-orange-500/10 px-3 py-1.5 text-xs text-orange-300">
              欠款已超过额度的 60%，利息在滚。可以考虑还款或加大出海频次。
            </div>
          )}

          {/* ── 操作 ── */}
          <div className="space-y-1.5">
            <h2 className={`flex items-center gap-1.5 ${SECTION_TITLE}`}>
              <Icon emoji="💰" className="text-xs" />
              <span>借款</span>
            </h2>
            <div className="flex flex-wrap gap-2">
              {[LOAN_STEP, LOAN_STEP * 2, LOAN_STEP * 4].map(amt => {
                const room = capacity;
                const actual = Math.min(amt, room);
                const disabled = actual <= 0;
                return (
                  <button
                    key={amt}
                    type="button"
                    disabled={disabled}
                    onClick={() => state.borrowSilver(amt)}
                    title={
                      disabled
                        ? '额度已用尽'
                        : `借款 ${formatNumber(actual, 0)} 白银（利息进入本金）`
                    }
                    className={`${BANK_BTN} ${
                      disabled
                        ? 'cursor-not-allowed text-gray-700'
                        : 'bg-yellow-500/15 text-yellow-300 hover:bg-yellow-500/25 active:bg-yellow-500/30'
                    }`}
                  >
                    借 {formatNumber(amt, 0)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <h2 className={`flex items-center gap-1.5 ${SECTION_TITLE}`}>
              <Icon emoji="💸" className="text-xs" />
              <span>还款</span>
            </h2>
            <div className="flex flex-wrap gap-2">
              {[LOAN_STEP, LOAN_STEP * 2, state.loan].map((amt, i) => {
                const actual = Math.min(amt, state.loan, state.silver);
                const disabled = actual <= 0;
                const label = i === 2 ? '全部还清' : `还 ${formatNumber(amt, 0)}`;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={disabled}
                    onClick={() => state.repaySilver(amt)}
                    title={disabled ? '没有可还的白银或欠款为 0' : `偿还 ${formatNumber(actual, 0)} 白银`}
                    className={`${BANK_BTN} ${
                      disabled
                        ? 'cursor-not-allowed text-gray-700'
                        : 'bg-gray-700/30 text-gray-300 hover:bg-gray-700/50 active:bg-gray-700/60'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {state.loan > 0 && state.silver < state.loan && (
              <div className="text-xs text-gray-500">
                白银不足以一次还清 —— 还差 {formatNumber(state.loan - state.silver, 0)}。
              </div>
            )}
          </div>

          {/* ── 利息说明 ── */}
          <div className="rounded-md bg-gray-900/40 px-3 py-2 text-xs text-gray-400">
            利息 <span className="font-mono tabular-nums text-yellow-300">0.02%/秒</span>
            （约每 50 秒滚 1%），<b>直接进入本金</b>——不会静默从白银里扣走，
            所以你能清楚看到自己欠了多少。
          </div>

          <p className="text-xs leading-relaxed text-gray-600">
            信贷是给「忍耐期」留的活路：印书坊与大学都要白银，而白银只能出海带回。
            没有信贷，玩家可能在"没银造印书坊"这一步彻底卡死。
            额度上限 {formatNumber(LOAN_LIMIT, 0)} 白银 —— 它是一次机会，不是一台印钞机。
          </p>
        </div>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'gray' | 'warn';
}) {
  return (
    <div className="rounded-md bg-gray-900/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div
        className={`font-mono text-base font-semibold tabular-nums ${
          tone === 'warn' ? 'text-orange-300' : 'text-gray-200'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

export default BankPanel;
