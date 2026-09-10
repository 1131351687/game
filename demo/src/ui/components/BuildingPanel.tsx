// 建筑页（独立 Tab）· 建筑建造
//
// 布局约定（配合 App.tsx 的 Tab 结构）：
//   1. 外层已由 App.tsx 提供 `mx-auto max-w-4xl`，本组件不再套外层容器
//   2. 资源存量常驻顶部 TopBar —— 这里**只显示成本数字**（不足标红），不重复显示存量
//   3. MessageLog 是 `fixed bottom-0`（约 160px），最外层 pb-40 防止最后一张卡片被遮挡
//
// 渐进解锁：未满足解锁条件的建筑不显示（getRevealedBuildings 过滤）。

import { useStore, toEngineState } from '../../state/store';
import type { BuildingDef } from '../../data/buildings';
import { RESOURCE_MAP, type ResourceId } from '../../data/resources';
import { TECH_MAP } from '../../data/techs';
import { canAffordBuilding, getBuildingCost, isBuildingUnlocked } from '../../game/engine';
import { getRevealedBuildings } from '../../game/reveal';
import { formatNumber } from '../../core/format';

/** 建筑对应的人口的哪一种限制（BUILDINGS[].limit） */
const LIMIT_LABEL: Record<BuildingDef['limit'], string> = {
  population: '提升人口上限',
  environment: '强化火源',
  output: '提升产出',
};

const LIMIT_STYLE: Record<BuildingDef['limit'], string> = {
  population: 'bg-emerald-900/60 text-emerald-300',
  environment: 'bg-orange-900/60 text-orange-300',
  output: 'bg-blue-900/60 text-blue-300',
};

/** 每座建筑的效果图标（用于卡片左侧视觉锚点） */
const LIMIT_ICON: Record<BuildingDef['limit'], string> = {
  population: '👥',
  environment: '🔥',
  output: '⚙️',
};

export function BuildingPanel() {
  const state = useStore();
  const view = toEngineState(state);
  const { build } = state;

  const revealed = getRevealedBuildings(view);
  // 顶部「已建总数」只统计可见建筑
  const totalBuilt = revealed.reduce((sum, b) => sum + (state.buildings[b.id] ?? 0), 0);

  return (
    // pb-40：给 fixed bottom-0 的 MessageLog 让位
    <section className="space-y-3 pb-40">
      {/* 页头：标题 + 已建总数 */}
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">🏗️ 建筑</h2>
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
          <span className="tabular-nums">
            已建总数 <span className="font-semibold text-gray-300">{totalBuilt}</span> 座
          </span>
          <span className="tabular-nums">
            {revealed.map(b => (
              <span key={b.id} className="ml-3" title={b.name}>
                {b.icon} {state.buildings[b.id] ?? 0}
              </span>
            ))}
          </span>
        </div>
      </header>

      {revealed.length === 0 ? (
        // 兜底：Tab 本身在任一建筑可见后才出现，正常不会走到这里
        <div className="rounded-lg border border-dashed border-gray-700 bg-gray-800/50 px-4 py-8 text-center text-sm text-gray-500">
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
              className={`rounded-lg border px-4 py-3.5 ${
                unlocked ? 'border-gray-700 bg-gray-800' : 'border-gray-800 bg-gray-800/40'
              }`}
            >
              {!unlocked ? (
                // ── 未解锁：只显示名称 + 解锁条件 ──
                <div>
                  <div className="flex items-center gap-3 opacity-60">
                    <span className="text-2xl leading-none">{b.icon}</span>
                    <span className="text-sm font-semibold text-gray-200">{b.name}</span>
                  </div>
                  <div className="mt-2 rounded bg-gray-900/60 px-2.5 py-1.5 text-[11px] text-gray-500">
                    🔒 需要科技：
                    {TECH_MAP[b.requires.tech ?? '']?.name ?? b.requires.tech ?? '未知'}
                  </div>
                </div>
              ) : (
                // ── 已解锁：左信息 / 右成本+按钮（独立页横向空间充足）──
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
                  {/* 左：图标 + 名称 + 徽章 + 效果说明 + 已建数量 */}
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className="text-3xl leading-none">{b.icon}</span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-semibold text-gray-100">{b.name}</span>
                        <span className="rounded bg-gray-900 px-1.5 py-0.5 text-[11px] tabular-nums text-gray-300">
                          已建 {owned} 座
                        </span>
                        {/* limit 徽章：说明这座建筑对应哪一条限制 */}
                        <span
                          className={`rounded px-1.5 py-0.5 text-[11px] ${LIMIT_STYLE[b.limit]}`}
                          title="该建筑影响的核心限制"
                        >
                          {LIMIT_ICON[b.limit]} {LIMIT_LABEL[b.limit]}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-gray-400">{b.desc}</p>
                      <p className="mt-1 text-[11px] tabular-nums text-gray-500">
                        每建一座，成本 ×{b.costMultiplier}
                        {owned > 0 && ' （已随数量递增）'}
                      </p>
                    </div>
                  </div>

                  {/* 右：成本 + 建造按钮 */}
                  <div className="shrink-0 lg:w-64 lg:text-right">
                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                      <span className="text-[11px] text-gray-500">成本</span>
                      {entries.map(({ res, amount }) => {
                        // 资源不足时标红（存量在 TopBar 显示，这里只比数字）
                        const short = !hasEnough(res, amount, view);
                        return (
                          <span
                            key={res}
                            title={`${RESOURCE_MAP[res].name} ${formatNumber(amount, 0)}`}
                            className={`rounded bg-gray-900 px-2 py-0.5 text-xs tabular-nums ${
                              short ? 'font-semibold text-red-400' : 'text-gray-300'
                            }`}
                          >
                            {RESOURCE_MAP[res].icon} {formatNumber(amount, 0)}
                          </span>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      disabled={!affordable}
                      onClick={() => {
                        build(b.id);
                      }}
                      className={`mt-2 w-full rounded-md px-4 py-2 text-sm font-semibold transition-colors lg:w-auto ${
                        affordable
                          ? 'bg-blue-600 text-white hover:bg-blue-500 active:bg-blue-700'
                          : 'cursor-not-allowed bg-gray-700 text-gray-500'
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

      <p className="text-[11px] leading-relaxed text-gray-500">
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
    case 'experience':
      return view.experience >= need;
    default:
      return true;
  }
}

// App.tsx 目前以具名导入引用本组件，这里保留默认导出以兼容两种写法
export default BuildingPanel;
