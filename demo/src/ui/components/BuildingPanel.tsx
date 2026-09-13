// 建筑页（独立 Tab）· 建筑建造
//
// 布局约定（配合 App.tsx 的 Tab 结构）：
//   1. 外层已由 App.tsx 提供 `mx-auto max-w-4xl`，本组件不再套外层容器
//   2. 资源存量常驻顶部 TopBar —— 详情卡里**只显示成本数字**（不足标红），不重复显示存量
//
// 2026-09-13 改版（用户拍板）：常规状态只显示**紧凑小方块**（图标 + 名称 + 已建数），
// 与科技网格的视觉密度看齐；详细信息（说明、成本材料、建造按钮）收纳进
// hover / 点击展开的悬浮详情卡 —— 成本**直接列所需材料**，不再单独标倍率数字。
//
// 渐进解锁：未满足解锁条件的建筑不显示（getRevealedBuildings 过滤）。
//
// 纯文字模式：所有 emoji 走 <Icon>；图标可能渲染为 null，
// 因此所有含图标的行都用 flex + gap 排布，不依赖图标宽度。

import { useState } from 'react';
import { useStore, toEngineState, type GameState } from '../../state/store';
import type { BuildingDef } from '../../data/buildings';
import { RESOURCE_MAP, type ResourceId } from '../../data/resources';
import { E2 } from '../../data/constants';
import {
  aggregateEffects,
  canAffordBuilding,
  getBuildingCost,
  type E1State,
} from '../../game/engine';
import { getRevealedBuildings } from '../../game/reveal';
import { formatNumber } from '../../core/format';
import { Icon } from './Icon';

/** 建筑对应的人口的哪一种限制（BUILDINGS[].limit） */
const LIMIT_LABEL: Record<BuildingDef['limit'], string> = {
  population: '提升人口上限',
  environment: '强化火源',
  output: '提升产出',
  record: '记录容量',
  trade: '贸易路线',
};

/** 每座建筑的效果图标（用于方块与详情卡的视觉锚点） */
const LIMIT_ICON: Record<BuildingDef['limit'], string> = {
  population: '👥',
  environment: '🔥',
  output: '⚙️',
  record: '📜',
  trade: '🐴',
};

export function BuildingPanel() {
  const state = useStore();
  const view = toEngineState(state);
  const { build } = state;

  const revealed = getRevealedBuildings(view);
  // 顶部「已建总数」只统计可见建筑
  const totalBuilt = revealed.reduce((sum, b) => sum + (state.buildings[b.id] ?? 0), 0);

  return (
    <section className="space-y-4 pb-40">
      {/* 页头：标题 + 已建总数 */}
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-gray-500">
          <Icon emoji="🏗️" className="text-xs" />
          <span>建筑</span>
        </h2>
        <div className="text-xs tabular-nums text-gray-600">
          已建总数 <span className="font-semibold text-gray-300">{totalBuilt}</span> 座
          <span className="ml-2 text-gray-700">悬停查看详情与成本</span>
        </div>
      </header>

      {/* ── 建筑网格：紧凑小方块，hover / 点击出详情卡 ── */}
      {revealed.length === 0 ? (
        // 兜底：Tab 本身在任一建筑可见后才出现，正常不会走到这里
        <div className="rounded-md bg-gray-800/40 px-4 py-8 text-center text-sm text-gray-500">
          尚未解锁任何建筑 —— 先研究相关科技。
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {revealed.map(b => (
            <BuildingTile key={b.id} def={b} state={state} view={view} build={build} />
          ))}
        </div>
      )}

      {/* ── 牲畜储备 · 宰杀（畜栏的配套操作：活体库存的兑现入口）──
          livestock 只有在有畜栏（或继承了旧时代存栏）后才可能 > 0，
          因此用「有牲畜 或 有畜栏」作为显示条件即可。 */}
      {(state.livestock > 0 || (state.buildings.animal_pen ?? 0) > 0) && (
        <LivestockReserve />
      )}
    </section>
  );
}

/**
 * 单个建筑方块。
 *
 * 常规态：图标 + 名称 + 已建数，三行以内的小方块；
 * 详情态（hover 或点击固定）：悬浮卡显示说明、成本材料（直接列所需材料、
 * 不足标红）、建造按钮。点击方块本身 = 快捷建造（可负担时）。
 */
function BuildingTile({
  def: b,
  state,
  view,
  build,
}: {
  def: BuildingDef;
  state: GameState;
  view: E1State;
  build: (id: BuildingDef['id']) => void;
}) {
  const [pinned, setPinned] = useState(false);
  const owned = state.buildings[b.id] ?? 0;
  const cost = getBuildingCost(b.id, view);
  const affordable = canAffordBuilding(b.id, view);

  // 成本条目（跳过空值）
  const entries = (Object.keys(cost) as ResourceId[])
    .map(res => ({ res, amount: cost[res] ?? 0 }))
    .filter(e => e.amount > 0);

  return (
    <div
      className="relative"
      onMouseEnter={() => setPinned(true)}
      onMouseLeave={() => setPinned(false)}
    >
      {/* ── 紧凑方块：可负担的"亮起"，不可负担的压暗 —— 一眼分清能建什么 ── */}
      <button
        type="button"
        disabled={!affordable}
        onClick={() => build(b.id)}
        className={`flex w-full flex-col items-center gap-1 rounded-md border px-2 py-3 text-center transition-colors ${
          affordable
            ? 'cursor-pointer border-accent/50 bg-accent/10 hover:border-accent hover:bg-accent/20'
            : 'cursor-not-allowed border-gray-800/60 bg-gray-900/20 opacity-40'
        }`}
      >
        <Icon emoji={b.icon} className="text-xl leading-none" />
        <span
          className={`w-full truncate text-xs font-medium ${affordable ? 'text-gray-100' : 'text-gray-500'}`}
        >
          {b.name}
        </span>
        <span className={`font-mono text-xs tabular-nums ${affordable ? 'text-gray-300' : 'text-gray-500'}`}>
          {owned > 0 ? `×${owned}` : '—'}
        </span>
      </button>

      {/* ── 悬浮详情卡：hover 展开（触屏点按同样触发）── */}
      {pinned && (
        <div className="absolute left-1/2 top-full z-20 mt-1 w-72 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-md border border-gray-700 bg-gray-900 p-3 shadow-xl shadow-black/50">
          {/* 标题行：图标 + 名称 + 分类徽章 */}
          <div className="flex items-center gap-2">
            <Icon emoji={b.icon} className="text-lg leading-none" />
            <span className="text-sm font-semibold text-gray-100">{b.name}</span>
            <span className="ml-auto flex items-center gap-1 rounded-md bg-gray-800/60 px-1.5 py-0.5 text-xs text-gray-400">
              <Icon emoji={LIMIT_ICON[b.limit]} className="text-xs" />
              <span>{LIMIT_LABEL[b.limit]}</span>
            </span>
          </div>

          {/* 效果说明 */}
          <p className="mt-2 text-xs leading-relaxed text-gray-400">{b.desc}</p>

          {/* 成本：直接列所需材料（名称 + 数量，不足标红） */}
          <div className="mt-2 border-t border-gray-800 pt-2">
            <div className="text-xs text-gray-600">所需材料</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              {entries.map(({ res, amount }) => {
                const short = !hasEnough(res, amount, view);
                return (
                  <span
                    key={res}
                    className={`flex items-center gap-1 text-xs tabular-nums ${
                      short ? 'font-semibold text-red-400' : 'text-gray-300'
                    }`}
                  >
                    <Icon emoji={RESOURCE_MAP[res].icon} className="text-xs" />
                    <span>{RESOURCE_MAP[res].name}</span>
                    <span>{formatNumber(amount, 0)}</span>
                  </span>
                );
              })}
            </div>
            {owned > 0 && (
              <div className="mt-1 text-xs text-gray-600">
                已建 {owned} 座 · 下一座成本随数量递增
              </div>
            )}
          </div>

          {/* 建造按钮 */}
          <button
            type="button"
            disabled={!affordable}
            onClick={() => build(b.id)}
            className={`mt-2 w-full rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
              affordable
                ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 active:bg-emerald-500/30'
                : 'cursor-not-allowed text-gray-700'
            }`}
          >
            {affordable ? `建造（第 ${owned + 1} 座）` : '资源不足'}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * 牲畜储备 · 宰杀面板。
 *
 * 牲畜是"活体储备"：不占粮仓容量，但每个 tick 都吃饲料；
 * 存栏由畜栏上限约束（畜栏 = 活体库存的仓库）。
 * 宰杀即是把活体储备兑现成食物 —— 按牲畜世代每头换 30（世代≥3 为 38）食物，
 * 仍受食物储存上限约束（否则屠宰 = 无限粮仓，破坏"秋天必须攒够"的核心循环）。
 */
function LivestockReserve() {
  const state = useStore();
  const view = toEngineState(state);
  const [amount, setAmount] = useState(1);

  const pens = state.buildings.animal_pen ?? 0;
  const eff = aggregateEffects(view);
  const perHead = eff.livestockTier >= 3 ? E2.SLAUGHTER_YIELD_TIER3 : E2.SLAUGHTER_YIELD;
  const penCap = pens * (E2.PEN_CAPACITY + eff.penCapacityAdd);
  const maxSlaughter = Math.min(Math.floor(state.livestock), 99);
  const headCount = Math.floor(state.livestock);

  return (
    <div className="rounded-md bg-gray-800/30 px-4 py-3.5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
        {/* 左：图标 + 名称 + 存栏数 + 说明 */}
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Icon emoji="🐐" className="text-2xl leading-none" />
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold text-gray-100">牲畜储备</span>
              <span className="rounded-md bg-gray-800/60 px-1.5 py-0.5 text-xs tabular-nums text-gray-400">
                存栏 {headCount} / {Math.floor(penCap)}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-gray-400">
              活体储备不占粮仓容量。宰杀一头换 {perHead} 食物
              {eff.livestockTier >= 3 ? '（犁耕世代，产量更高）' : '；世代达到 3（犁耕）后为 38'}。
              粮仓已满则换不到存粮。
            </p>
          </div>
        </div>

        {/* 右：数量步进器 + 宰杀按钮 */}
        <div className="flex shrink-0 items-center gap-2 lg:w-72 lg:justify-end">
          <button
            type="button"
            disabled={amount <= 1}
            onClick={() => setAmount(a => Math.max(1, a - 1))}
            aria-label="减少宰杀数量"
            className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-800/70 text-gray-300 transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            −
          </button>
          <span className="w-10 text-center font-mono tabular-nums text-sm text-gray-100">
            {amount}
          </span>
          <button
            type="button"
            disabled={amount >= maxSlaughter}
            onClick={() => setAmount(a => Math.min(maxSlaughter, a + 1))}
            aria-label="增加宰杀数量"
            className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-800/70 text-gray-300 transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            +
          </button>
          <button
            type="button"
            disabled={headCount <= 0}
            onClick={() => {
              const done = state.slaughter(amount);
              if (done > 0) setAmount(1);
            }}
            title={`宰杀 ${amount} 头，约得 ${(amount * perHead).toFixed(0)} 食物`}
            className="rounded-md bg-orange-500/15 px-4 py-2 text-sm font-semibold text-orange-300 transition-colors hover:bg-orange-500/25 active:bg-orange-500/30 disabled:cursor-not-allowed disabled:text-gray-700"
          >
            宰杀
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 当前是否够付某项资源。
 * 只用于把「不足的那一项」标红；整体可负担性判断交给 canAffordBuilding。
 */
function hasEnough(res: ResourceId, need: number, view: E1State): boolean {
  switch (res) {
    case 'food':
      return view.food >= need;
    case 'wood':
      return view.wood >= need;
    case 'stone':
      return view.stone >= need;
    case 'livestock':
      return view.livestock >= need;
    case 'fabric':
      return view.fabric >= need;
    case 'experience':
      return view.experience >= need;
    default:
      return true;
  }
}

// App.tsx 目前以具名导入引用本组件，这里保留默认导出以兼容两种写法
export default BuildingPanel;
