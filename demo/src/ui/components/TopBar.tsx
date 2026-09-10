// 顶部资源条 —— 常驻页面最上方（h-screen 布局的第 ① 层）
//
// 布局约束：本组件是 shrink-0 的固定高度区域，整体页面不出现 body 滚动条，
// 因此这里必须**单行、紧凑**（目标高度 ≤ 40px：py-1.5 + text-sm/leading-none）。
// 资源变多时横向滚动（overflow-x-auto + flex-nowrap），绝不换行把下面挤扁。
//
// 只显示已解锁的资源（渐进解锁），人口单独显示「数量 / 上限」与增长速率。

import { useStore, toEngineState } from '../../state/store';
import { MATERIAL_RESOURCES, RESOURCE_MAP } from '../../data/resources';
import { isResourceRevealed } from '../../game/reveal';
import {
  calcResourceOutput,
  calcExperienceOutput,
  getResourceStorage,
  getCapacity,
  getPopulationGrowth,
} from '../../game/engine';
import { formatNumber, formatRate } from '../../core/format';

/** 数值列固定宽度 + 右对齐，避免数字位数变化时整行抖动 */
const VALUE_COL = 'min-w-[3.5rem] text-right';
/** 速率列同理 */
const RATE_COL = 'min-w-[3rem] text-right';

export function TopBar() {
  const s = useStore();
  const view = toEngineState(s);

  const shown = MATERIAL_RESOURCES.filter(id => isResourceRevealed(id, view));
  const popGrowth = getPopulationGrowth(view);
  const capacity = getCapacity(view);

  return (
    <div className="flex shrink-0 flex-nowrap items-center gap-4 overflow-x-auto border-b border-gray-700 bg-gray-800 px-4 py-1.5 text-sm leading-tight">
      {shown.map(id => {
        const def = RESOURCE_MAP[id];
        const rate = id === 'experience' ? calcExperienceOutput(view) : calcResourceOutput(id, view);
        const cap = getResourceStorage(id, view);
        const amount = id === 'experience' ? s.experience : s[id as 'food' | 'wood' | 'stone'];

        return (
          <span key={id} className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
            <span className="text-sm">{def.icon}</span>
            <span className="text-gray-400">{def.name}</span>
            {/* 主数值：等宽字体 + 右对齐，位数变化不影响其他项的位置 */}
            <span className={`${VALUE_COL} font-mono tabular-nums text-white`}>
              {formatNumber(amount)}
            </span>
            {Number.isFinite(cap) && (
              <span className="text-xs text-gray-500">/ {formatNumber(cap)}</span>
            )}
            <span
              className={`${RATE_COL} font-mono text-xs tabular-nums ${
                rate > 0 ? 'text-green-400' : 'text-gray-500'
              }`}
            >
              {formatRate(rate)}
            </span>
          </span>
        );
      })}

      {/* 人口：单独显示上限与增长速率 */}
      <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
        <span className="text-sm">{RESOURCE_MAP.population.icon}</span>
        <span className="text-gray-400">人口</span>
        <span className={`${VALUE_COL} font-mono tabular-nums text-white`}>
          {Math.floor(s.population)}
          <span className="text-gray-500"> / {capacity}</span>
        </span>
        <span
          className={`${RATE_COL} font-mono text-xs tabular-nums ${
            popGrowth > 0 ? 'text-green-400' : popGrowth < 0 ? 'text-red-400' : 'text-gray-500'
          }`}
        >
          {formatRate(popGrowth)}
        </span>
      </span>
    </div>
  );
}
