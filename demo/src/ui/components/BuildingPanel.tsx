// 建筑建造：每座建筑一张卡片，显示已建数量 / 效果 / 成本 / 建造按钮
import { useStore, toEngineState } from '../../state/store';
import { BUILDINGS, type BuildingDef } from '../../data/buildings';
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

/** 当前持有的资源量（成本可负担性判断用） */
function ownedAmount(view: ReturnType<typeof toEngineState>, res: ResourceId): number {
  switch (res) {
    case 'food':
      return view.food;
    case 'wood':
      return view.wood;
    case 'stone':
      return view.stone;
    case 'experience':
      return view.experience;
    default:
      return Number.POSITIVE_INFINITY;
  }
}

export function BuildingPanel() {
  const state = useStore();
  const view = toEngineState(state);
  const { build } = state;

  const totalBuilt = BUILDINGS.reduce((sum, b) => sum + (state.buildings[b.id] ?? 0), 0);

  return (
    <section className="space-y-2">
      <header className="flex items-baseline justify-between">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">🏗️ 建筑</h2>
        <span className="text-xs tabular-nums text-gray-500">已建 {totalBuilt} 座</span>
      </header>

      {getRevealedBuildings(view).map(b => {
        const unlocked = isBuildingUnlocked(b.id, view);
        const owned = state.buildings[b.id] ?? 0;
        const cost = getBuildingCost(b.id, view);
        const affordable = canAffordBuilding(b.id, view);

        // 成本条目（跳过空值）
        const entries = (Object.keys(cost) as ResourceId[]).map(res => ({
          res,
          amount: cost[res] ?? 0,
        }));

        return (
          <div
            key={b.id}
            className={`rounded-lg border px-3 py-2.5 ${
              unlocked ? 'border-gray-700 bg-gray-800' : 'border-gray-800 bg-gray-800/40'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className={`flex min-w-0 items-start gap-2 ${unlocked ? '' : 'opacity-50'}`}>
                <span className="text-2xl leading-none">{b.icon}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-gray-200">{b.name}</span>
                    <span className="rounded bg-gray-900 px-1.5 py-0.5 text-[11px] tabular-nums text-gray-400">
                      已建 {owned} 座
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] ${LIMIT_STYLE[b.limit]}`}
                    >
                      {LIMIT_LABEL[b.limit]}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-gray-500">{b.desc}</p>
                </div>
              </div>
            </div>

            {!unlocked ? (
              // 未解锁：显示解锁条件
              <div className="mt-2 rounded bg-gray-900/60 px-2 py-1 text-[11px] text-gray-500">
                🔒 需要科技：{TECH_MAP[b.requires.tech ?? '']?.name ?? b.requires.tech ?? '未知'}
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                {/* 成本：资源不足时标红 */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-gray-500">成本</span>
                  {entries.map(({ res, amount }) => {
                    const short = ownedAmount(view, res) < amount;
                    return (
                      <span
                        key={res}
                        title={RESOURCE_MAP[res].name}
                        className={`rounded bg-gray-900 px-1.5 py-0.5 text-xs tabular-nums ${
                          short ? 'text-red-400' : 'text-gray-300'
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
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    affordable
                      ? 'bg-blue-600 text-white hover:bg-blue-500 active:bg-blue-700'
                      : 'cursor-not-allowed bg-gray-700 text-gray-500'
                  }`}
                >
                  {affordable ? `建造（第 ${owned + 1} 座）` : '资源不足'}
                </button>
              </div>
            )}
          </div>
        );
      })}

      <p className="text-[11px] leading-relaxed text-gray-500">
        每建一座，同种建筑的成本按倍率递增；三座建筑恰好对应人口上限、火源强度与产出效率三大限制。
      </p>
    </section>
  );
}

// App.tsx 目前以默认导入引用本组件，这里保留默认导出以兼容两种写法
export default BuildingPanel;
