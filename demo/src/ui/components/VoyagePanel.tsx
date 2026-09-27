// 远航面板（E5 远洋时代）
//
// 三环：近海 60s / 远洋 180s / 环球 480s。进度 = 水手 × 1.0/秒。
//
// ⚠️ 设计要点：单次远航**在数值上不划算**（第 2 环期望白银 24.5 < 成本 50）。
//    玩家出海的理由不是赚钱，而是：
//      · 印书坊（100 银）与大学（400 银）的成本里有白银，不出海就造不出来
//      · 首次完成第 2 环**必定**触发「发现新大陆」，给一大笔一次性奖励
//    这是把"探索"从收益计算里解放出来 —— 本面板要把这层意思讲清楚，
//    否则玩家会按"期望收益"算出海是亏的，然后永远不点。

import { useState } from 'react';
import { useStore, toEngineState } from '../../state/store';
import { aggregateEffects } from '../../game/engine';
import {
  RING1_EVENTS,
  RING2_EVENTS,
  RING3_EVENTS,
  getVoyageCost,
  getVoyageCapacity,
  ringName,
} from '../../game/e5/voyage';
import { E5 } from '../../data/constants';
import { formatNumber } from '../../core/format';
import { Icon } from './Icon';

const SECTION_TITLE = 'text-xs uppercase tracking-wide text-gray-500';

/** 资源 id → 中文名 */
const RES_NAME: Record<string, string> = {
  wood: '木材',
  iron: '铁',
  silver: '白银',
};

export function VoyagePanel({ className }: { className?: string }) {
  const state = useStore();
  const view = toEngineState(state);
  if (state.era !== 'E5') return null;

  const [open, setOpen] = useState(false);
  const eff = aggregateEffects(view);

  const harbors = state.buildings.harbor ?? 0;
  const capacity = getVoyageCapacity(harbors);
  const sailors = state.jobs.sailor ?? 0;
  const unlocked = eff.voyageEnabled;
  const newWorldFound = state.voyages.some(v => v.newWorldFound);

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
        <Icon emoji="⛵" className="text-sm" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-gray-200">
            远航探索{!unlocked && ' · 未解锁'}
          </div>
          <div className="truncate text-xs text-gray-500">
            {unlocked
              ? `船队 ${state.voyages.length} / ${capacity} · 水手 ${sailors}`
              : '需要研究「指南针」并建造航海港'}
          </div>
        </div>
        {newWorldFound && (
          <span className="shrink-0 text-xs text-green-300">
            <Icon emoji="🌍" className="text-xs" /> 已发现新大陆
          </span>
        )}
      </button>

      {open && (
        <div className="space-y-3">
          {/* ── 未解锁提示 ── */}
          {!unlocked && (
            <div className="rounded-md bg-gray-800/40 px-3 py-2 text-xs text-gray-400">
              远航系统需要研究<b>「指南针」</b>才会开启。开启后需要
              <b>航海港</b>提供船位（每港 1 支船队）。
            </div>
          )}

          {/* ── 进行中的船队 ── */}
          {state.voyages.length > 0 && (
            <div className="space-y-1.5">
              <h2 className={`flex items-center gap-1.5 ${SECTION_TITLE}`}>
                <Icon emoji="🧭" className="text-xs" />
                <span>航行中</span>
              </h2>
              {state.voyages.map((v, i) => {
                const ratio = v.target > 0 ? Math.min(1, v.progress / v.target) : 0;
                const speed =
                  (sailors / state.voyages.length) *
                  E5.VOYAGE_PROGRESS_PER_SAILOR *
                  (1 + eff.voyageBonus + E5.VOYAGE_LITERACY_BONUS * (state.literacy / 100));
                const remain = speed > 0 ? Math.max(0, (v.target - v.progress) / speed) : Infinity;
                return (
                  <div key={i} className="rounded-md bg-gray-900/40 px-3 py-2">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-gray-300">
                        <Icon emoji={v.ring === 3 ? '🌍' : v.ring === 2 ? '🚢' : '⛵'} className="mr-1 text-sm" />
                        {ringName(v.ring)}航程
                        <span className="ml-1 text-gray-600">(第 {v.ring} 环)</span>
                      </span>
                      <span className="font-mono tabular-nums text-gray-400">
                        {remain === Infinity ? '—' : `${Math.ceil(remain)}s`}
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-md bg-gray-800">
                      <div
                        className="h-full rounded-md bg-sky-500 transition-all duration-300"
                        style={{ width: `${ratio * 100}%` }}
                      />
                    </div>
                    <div className="mt-0.5 text-[11px] text-gray-600">
                      进度 {v.progress.toFixed(0)} / {v.target} · 速率 {speed.toFixed(2)}/s
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── 三环成本与时长 ── */}
          <div className="space-y-1.5">
            <h2 className={`flex items-center gap-1.5 ${SECTION_TITLE}`}>
              <Icon emoji="🗺️" className="text-xs" />
              <span>三环航程</span>
            </h2>
            <div className="space-y-1">
              {([1, 2, 3] as const).map(ring => {
                const cost = getVoyageCost(ring);
                const affordable = Object.entries(cost).every(([res, need]) => {
                  const have =
                    res === 'wood' ? state.wood : res === 'iron' ? state.iron : state.silver;
                  return have >= need;
                });
                return (
                  <div
                    key={ring}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-gray-900/40 px-3 py-1.5 text-xs"
                  >
                    <span className="flex items-center gap-1.5">
                      <Icon emoji={ring === 3 ? '🌍' : ring === 2 ? '🚢' : '⛵'} className="text-sm" />
                      <span className="text-gray-300">
                        第 {ring} 环 · {ringName(ring)}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono tabular-nums text-gray-500">
                      <span>{E5.VOYAGE_DURATION[ring]}s</span>
                      <span>水手 {E5.VOYAGE_SAILORS[ring]}</span>
                      <span className={affordable ? 'text-gray-400' : 'text-danger'}>
                        {Object.entries(cost)
                          .map(([res, n]) => `${RES_NAME[res] ?? res} ${n}`)
                          .join(' + ')}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── 新大陆里程碑 ── */}
          <div
            className={`rounded-md px-3 py-2 text-xs ${
              newWorldFound
                ? 'bg-green-500/10 text-green-300'
                : 'bg-sky-500/10 text-sky-300'
            }`}
          >
            {newWorldFound ? (
              <>
                <Icon emoji="🌍" className="mr-1 text-sm" />
                已完成「发现新大陆」—— 异域物产 +{E5.NEW_WORLD_REWARD.exoticGoods}、
                白银 +{E5.NEW_WORLD_REWARD.silver}、研究点 +{formatNumber(E5.NEW_WORLD_REWARD.researchPoints, 0)}
              </>
            ) : (
              <>
                <Icon emoji="🌍" className="mr-1 text-sm" />
                <b>首次完成第 2 环远航必定发现新大陆</b>
                （异域物产 +{E5.NEW_WORLD_REWARD.exoticGoods}、白银 +{E5.NEW_WORLD_REWARD.silver}、
                研究点 +{formatNumber(E5.NEW_WORLD_REWARD.researchPoints, 0)}）——
                这是出海真正的理由。
              </>
            )}
          </div>

          {/* ── 为什么出海不赚钱 ── */}
          <p className="text-xs leading-relaxed text-gray-600">
            单次远航<b>在数值上不划算</b>：第 2 环常规期望白银约 24.5，而成本是 50。
            出海的理由不是赚钱，而是印书坊与大学的成本里有白银 ——
            不出海就造不出它们。<b>探索不是投资，是开门。</b>
          </p>

          {/* ── 事件表（让玩家知道可能遇到什么）── */}
          <details className="rounded-md bg-gray-900/40 px-3 py-2">
            <summary className="cursor-pointer text-xs text-gray-400">
              第 2 环事件表（{RING2_EVENTS.length} 项）
            </summary>
            <div className="mt-1.5 space-y-0.5">
              {RING2_EVENTS.map((e, i) => {
                const o = e.make();
                return (
                  <div key={i} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className={o.success ? 'text-gray-400' : 'text-orange-300/80'}>
                      {o.label}
                    </span>
                    <span className="font-mono tabular-nums text-gray-600">{e.w}%</span>
                  </div>
                );
              })}
            </div>
          </details>
          <details className="rounded-md bg-gray-900/40 px-3 py-2">
            <summary className="cursor-pointer text-xs text-gray-400">
              第 1 环 / 第 3 环事件表
            </summary>
            <div className="mt-1.5 space-y-1.5">
              {[
                { name: '第 1 环 · 近海', table: RING1_EVENTS },
                { name: '第 3 环 · 环球', table: RING3_EVENTS },
              ].map(g => (
                <div key={g.name}>
                  <div className="text-[11px] font-medium text-gray-500">{g.name}</div>
                  {g.table.map((e, i) => {
                    const o = e.make();
                    return (
                      <div key={i} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className={o.success ? 'text-gray-400' : 'text-orange-300/80'}>
                          {o.label}
                        </span>
                        <span className="font-mono tabular-nums text-gray-600">{e.w}%</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
    </section>
  );
}

export default VoyagePanel;
