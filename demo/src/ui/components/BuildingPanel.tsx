// 建筑页（独立 Tab）· 建筑建造
//
// 布局约定（配合 App.tsx 的 Tab 结构）：
//   1. 外层已由 App.tsx 提供 `mx-auto max-w-4xl`，本组件不再套外层容器
//   2. 资源存量常驻顶部 TopBar —— 这里**只显示成本数字**（不足标红），不重复显示存量
//   3. MessageLog 是 `fixed bottom-0`（约 160px），最外层 pb-40 防止最后一张卡片被遮挡
//
// 渐进解锁：未满足解锁条件的建筑不显示（getRevealedBuildings 过滤）。
//
// 视觉简约化：卡片去掉边框，改用极淡背景色差 + hover:bg-gray-800/50 区分；
// 成本不足时**只把该项数字标红**，不给整行染色。
// 间距统一：区块间 space-y-4，区块内 space-y-2。
//
// 纯文字模式：所有 emoji 走 <Icon>；图标可能渲染为 null，
// 因此所有含图标的行都用 flex + gap 排布，不依赖图标宽度。

import { useStore, toEngineState } from '../../state/store';
import type { BuildingDef } from '../../data/buildings';
import { RESOURCE_MAP, type ResourceId } from '../../data/resources';
import { TECH_MAP } from '../../data/techs';
import { canAffordBuilding, getBuildingCost, isBuildingUnlocked } from '../../game/engine';
import { getRevealedBuildings } from '../../game/reveal';
import { formatNumber } from '../../core/format';
import { Icon } from './Icon';

/** 建筑对应的人口的哪一种限制（BUILDINGS[].limit） */
const LIMIT_LABEL: Record<BuildingDef['limit'], string> = {
  population: '提升人口上限',
  environment: '强化火源',
  output: '提升产出',
};

/**
 * limit 徽章样式：徽章属于「分类标签」，简约化后统一为灰阶，
 * 不再给每类一个彩色底 —— 颜色留给真正需要提示的状态（资源不足、可建造）。
 */
const LIMIT_STYLE = 'bg-gray-800/60 text-gray-400';

/** 每座建筑的效果图标（用于卡片左侧视觉锚点） */
const LIMIT_ICON: Record<BuildingDef['limit'], string> = {
  population: '👥',
  environment: '🔥',
  output: '⚙️',
};

/** 小号区块标题：小号化 + 灰淡化 */
const SECTION_TITLE = 'text-xs uppercase tracking-wide text-gray-500';

export function BuildingPanel() {
  const state = useStore();
  const view = toEngineState(state);
  const { build } = state;

  const revealed = getRevealedBuildings(view);
  // 顶部「已建总数」只统计可见建筑
  const totalBuilt = revealed.reduce((sum, b) => sum + (state.buildings[b.id] ?? 0), 0);

  return (
    // pb-40：给 fixed bottom-0 的 MessageLog 让位
    <section className="space-y-4 pb-40">
      {/* 页头：标题 + 已建总数 */}
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={`flex items-center gap-1.5 ${SECTION_TITLE}`}>
          <Icon emoji="🏗️" className="text-xs" />
          <span>建筑</span>
        </h2>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-gray-600">
          <span className="tabular-nums">
            已建总数 <span className="font-semibold text-gray-300">{totalBuilt}</span> 座
          </span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums">
            {revealed.map(b => (
              <span key={b.id} className="flex items-center gap-1" title={b.name}>
                <Icon emoji={b.icon} className="text-xs" />
                <span>{state.buildings[b.id] ?? 0}</span>
              </span>
            ))}
          </span>
        </div>
      </header>

      {/* ── 建筑列表（无边框，用背景色差与 hover 区分）── */}
      <div className="space-y-2">
        {revealed.length === 0 ? (
          // 兜底：Tab 本身在任一建筑可见后才出现，正常不会走到这里
          <div className="rounded-md bg-gray-800/40 px-4 py-8 text-center text-sm text-gray-500">
            尚未解锁任何建筑 —— 先研究相关科技。
          </div>
        ) : (
          revealed.map(b => {
            const unlocked = isBuildingUnlocked(b.id, view);
            const owned = state.buildings[b.id] ?? 0;
            const cost = getBuildingCost(b.id, view);
            const affordable = canAffordBuilding(b.id, view);

            // 成本条目（跳过空值）
            const entries = (Object.keys(cost) as ResourceId[])
              .map(res => ({ res, amount: cost[res] ?? 0 }))
              .filter(e => e.amount > 0);

            return (
              <div
                key={b.id}
                className={`rounded-md px-4 py-3.5 transition-colors ${
                  unlocked ? 'hover:bg-gray-800/50' : 'bg-gray-800/20'
                }`}
              >
                {!unlocked ? (
                  // ── 未解锁：只显示名称 + 解锁条件 ──
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 opacity-60">
                      <Icon emoji={b.icon} className="text-xl leading-none" />
                      <span className="text-sm font-medium text-gray-200">{b.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-600">
                      <Icon emoji="🔒" className="text-xs" />
                      <span>
                        需要科技：
                        {TECH_MAP[b.requires.tech ?? '']?.name ?? b.requires.tech ?? '未知'}
                      </span>
                    </div>
                  </div>
                ) : (
                  // ── 已解锁：左信息 / 右成本+按钮（独立页横向空间充足）──
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
                    {/* 左：图标 + 名称 + 徽章 + 效果说明 + 已建数量 */}
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <Icon emoji={b.icon} className="text-2xl leading-none" />
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-semibold text-gray-100">{b.name}</span>
                          <span className="rounded-md bg-gray-800/60 px-1.5 py-0.5 text-xs tabular-nums text-gray-400">
                            已建 {owned} 座
                          </span>
                          {/* limit 徽章：说明这座建筑对应哪一条限制 */}
                          <span
                            className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs ${LIMIT_STYLE}`}
                            title="该建筑影响的核心限制"
                          >
                            <Icon emoji={LIMIT_ICON[b.limit]} className="text-xs" />
                            <span>{LIMIT_LABEL[b.limit]}</span>
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed text-gray-400">{b.desc}</p>
                        <p className="text-xs tabular-nums text-gray-600">
                          每建一座，成本 ×{b.costMultiplier}
                          {owned > 0 && ' （已随数量递增）'}
                        </p>
                      </div>
                    </div>

                    {/* 右：成本 + 建造按钮 */}
                    <div className="shrink-0 space-y-2 lg:w-64 lg:text-right">
                      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        <span className="text-xs text-gray-600">成本</span>
                        {entries.map(({ res, amount }) => {
                          // 资源不足时标红（存量在 TopBar 显示，这里只比数字）
                          const short = !hasEnough(res, amount, view);
                          return (
                            <span
                              key={res}
                              title={`${RESOURCE_MAP[res].name} ${formatNumber(amount, 0)}`}
                              className={`flex items-center gap-1 text-xs tabular-nums ${
                                short ? 'font-semibold text-red-400' : 'text-gray-400'
                              }`}
                            >
                              <Icon emoji={RESOURCE_MAP[res].icon} className="text-xs" />
                              <span>{formatNumber(amount, 0)}</span>
                            </span>
                          );
                        })}
                      </div>

                      {/* 可建造是唯一的「可点击」主操作，保留颜色 */}
                      <button
                        type="button"
                        disabled={!affordable}
                        onClick={() => {
                          build(b.id);
                        }}
                        className={`w-full rounded-md px-4 py-2 text-sm font-semibold transition-colors lg:w-auto ${
                          affordable
                            ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 active:bg-emerald-500/30'
                            : 'cursor-not-allowed text-gray-700'
                        }`}
                      >
                        {affordable ? `建造（第 ${owned + 1} 座）` : '资源不足'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <p className="text-xs leading-relaxed text-gray-600">
        同种建筑每建一座，成本按倍率递增；三座建筑恰好对应人口上限、火源强度与产出效率三大限制。
      </p>
    </section>
  );
}

/**
 * 当前是否够付某项资源。
 * 只用于把「不足的那一项」标红；整体可负担性判断交给 canAffordBuilding。
 */
function hasEnough(
  res: ResourceId,
  need: number,
  view: ReturnType<typeof toEngineState>
): boolean {
  switch (res) {
    case 'food':
      return view.food >= need;
    case 'wood':
      return view.wood >= need;
    case 'stone':
      return view.stone >= need;
    case 'grain':
      return view.grain >= need;
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
