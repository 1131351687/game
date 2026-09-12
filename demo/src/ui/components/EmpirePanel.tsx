// 帝国面板（E4 帝国时代 · 治理仪表盘）
//
// 本组件是 E4 的常驻核心元素（对标 RecordPanel/TradePanel）：
//   👑 帝国 [秩序条] 72  版图 3  κ 0.92  ρ 24%  🪙 12,345  ⛏️ 2,345
//   下一行：扩张按钮（含成本与失败原因）+ 政体三选（郡县制解锁后）。
//
// 组件内部按 era === 'E4' 兜底，其它时代返回 null。

import { useState } from 'react';
import { useStore, toEngineState } from '../../state/store';
import {
  getAdminLoad,
  getCoverage,
  getStabilityRate,
  getOrderRegimeEffects,
  canExpand,
  canSwitchPolity,
  getPolity,
  isPolityUnlocked,
  POLITY_TABLE,
} from '../../game/empire';
import { E4 } from '../../data/constants';
import { formatNumber } from '../../core/format';
import { Icon } from './Icon';

/** 轻量文字按钮：主行动用琥珀色（扩张），政体用灰阶 */
const ACTION_BTN =
  'inline-flex h-8 items-center justify-center rounded-md px-3 text-sm font-mono font-semibold tabular-nums transition-colors';

const SECTION_TITLE = 'text-xs uppercase tracking-wide text-gray-500';

/** 秩序档位颜色：太平绿 / 安定灰 / 紧张琥珀 / 动荡红 */
function orderColor(order: number): string {
  if (order >= E4.ORDER_TIERS.peaceful) return '#4ade80';
  if (order >= E4.ORDER_TIERS.stable) return '#9ca3af';
  if (order >= E4.ORDER_TIERS.tense) return '#fbbf24';
  return '#f87171';
}

export function EmpirePanel() {
  const state = useStore();
  const view = toEngineState(state);
  const [expandErr, setExpandErr] = useState<string | null>(null);

  // 时代门控：仅 E4 渲染
  if (state.era !== 'E4') return null;

  const Aeff = getAdminLoad(view);
  const kappa = getCoverage(view);
  const rho = getStabilityRate(view);
  const regime = getOrderRegimeEffects(view);
  const polity = getPolity(view);
  const polityUnlocked = isPolityUnlocked(view);
  const expandCheck = canExpand(view);
  const orderRatio = Math.min(1, Math.max(0, state.order / 100));

  return (
    <section className="space-y-3 pb-40">
      {/* ── 治理仪表盘 ── */}
      <div className="flex shrink-0 flex-nowrap items-center gap-3 overflow-x-auto rounded-md bg-gray-900/40 px-4 py-2.5 text-sm leading-tight">
        <span className="flex shrink-0 items-center gap-1.5 text-gray-400">
          <Icon emoji="👑" className="text-sm" />
          <span>帝国</span>
        </span>

        {/* 秩序条 */}
        <div
          className="relative h-2 min-w-[6rem] flex-1 overflow-hidden rounded-md bg-gray-800"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(state.order)}
          aria-label={`秩序 ${Math.round(state.order)} / 100`}
        >
          <div
            className="h-full rounded-md transition-all duration-300"
            style={{
              width: `${orderRatio * 100}%`,
              backgroundColor: orderColor(state.order),
            }}
          />
        </div>
        <span className="shrink-0 font-mono tabular-nums" style={{ color: orderColor(state.order) }}>
          {regime.label} {Math.round(state.order)}
        </span>

        <span className="shrink-0 text-gray-500">版图</span>
        <span className="shrink-0 font-mono tabular-nums text-gray-300">{state.territory}</span>

        {/* 治理覆盖率 κ：≥0.8 达标线（绿色），否则琥珀/红 */}
        <span className="shrink-0 text-gray-500">κ</span>
        <span
          className="shrink-0 font-mono tabular-nums"
          style={{ color: kappa >= 0.8 ? '#4ade80' : kappa >= 0.5 ? '#fbbf24' : '#f87171' }}
        >
          {kappa.toFixed(2)}
        </span>

        {/* 维稳成本率 ρ */}
        <span className="shrink-0 text-gray-500">ρ</span>
        <span className="shrink-0 font-mono tabular-nums text-gray-300">
          {(rho * 100).toFixed(0)}%
        </span>

        {/* 铸币 / 铁 */}
        <span className="shrink-0 font-mono tabular-nums text-amber-300/90">
          🪙 {formatNumber(state.coin, 0)}
        </span>
        <span className="shrink-0 font-mono tabular-nums text-gray-300">
          ⛏️ {formatNumber(state.iron, 0)}
        </span>

        {/* A_eff（行政负荷）—— 供进阶玩家核对 κ */}
        <span className="shrink-0 text-gray-600" title={`A=${Aeff.A.toFixed(1)} R=${Aeff.R.toFixed(2)} Λ=${Aeff.Lambda.toFixed(2)}${Aeff.flatMul > 1 ? ' 平定期×1.5' : ''}`}>
          A_eff {Aeff.Aeff.toFixed(1)}
        </span>
      </div>

      {/* ── 扩张 + 政体 行 ── */}
      <div className="flex flex-nowrap items-center gap-3 overflow-x-auto rounded-md bg-gray-900/40 px-4 py-2.5 text-sm leading-tight">
        <span className={`shrink-0 ${SECTION_TITLE}`}>扩张</span>
        <button
          className={`${ACTION_BTN} ${
            expandCheck.ok
              ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
              : 'cursor-not-allowed bg-gray-800/40 text-gray-600'
          }`}
          disabled={!expandCheck.ok}
          onClick={() => {
            const err = state.expandTerritory();
            setExpandErr(err);
          }}
        >
          ⚔️ 版图 {state.territory} → {state.territory + 1}
          <span className="ml-2 text-xs opacity-70">
            🪙 {formatNumber(expandCheck.coinCost, 0)} ⛏️ {formatNumber(expandCheck.ironCost, 0)}
          </span>
        </button>
        {/* 失败原因 / 平定期提示 */}
        {expandErr && (
          <span className="shrink-0 text-xs text-red-400">{expandErr}</span>
        )}
        {!expandErr && !expandCheck.ok && expandCheck.reason && (
          <span className="shrink-0 text-xs text-gray-500">{expandCheck.reason}</span>
        )}
        {!expandErr && expandCheck.ok && (
          <span className="shrink-0 text-xs text-gray-500">
            平定期 {expandCheck.flatSec}s（A_eff ×1.5）
          </span>
        )}

        <span className="ml-4 shrink-0 text-gray-700">|</span>

        {/* 政体三选（郡县制解锁后可用） */}
        <span className={`shrink-0 ${SECTION_TITLE}`}>政体</span>
        {(['monarchy', 'republic', 'theocracy'] as const).map(p => {
          const active = polity === p;
          const check = canSwitchPolity(view, p);
          const affordable = check.ok;
          return (
            <button
              key={p}
              disabled={!polityUnlocked || active || !affordable}
              title={polityUnlocked ? `${POLITY_TABLE[p].desc}${affordable ? '' : `（${check.reason}）`}` : '研究「郡县制」后解锁'}
              className={`${ACTION_BTN} ${
                active
                  ? 'bg-violet-500/25 text-violet-300'
                  : polityUnlocked && affordable
                    ? 'bg-gray-800/60 text-gray-300 hover:bg-gray-700/60'
                    : 'cursor-not-allowed bg-gray-800/20 text-gray-600'
              }`}
              onClick={() => state.switchPolity(p)}
            >
              {POLITY_TABLE[p].icon} {POLITY_TABLE[p].name}
            </button>
          );
        })}
        {state.polityCooldownSec > 0 && (
          <span className="shrink-0 text-xs text-gray-500">
            冷却 {Math.ceil(state.polityCooldownSec)}s
          </span>
        )}
      </div>
    </section>
  );
}
