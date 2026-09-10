// 卡点提示条：引擎判定玩家当前卡在哪一步，直接给一条可执行的建议。
// 没有卡点时整个组件不渲染（返回 null），不占版面。

import { useStore, toEngineState } from '../../state/store';
import { getBottleneck, getCapacity, getFireFactor, getFoodFactor } from '../../game/engine';
import { formatNumber, formatPercent } from '../../core/format';

export function HintBar() {
  const s = useStore();
  const view = toEngineState(s);

  const bottleneck = getBottleneck(view);

  // 没有卡点 → 什么都不渲染
  if (bottleneck === null) return null;

  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded border border-yellow-600/60 bg-yellow-900/40 px-3 py-2 text-xs text-yellow-200"
    >
      <span className="shrink-0 text-base leading-none">⚠️</span>
      <span className="font-medium">{bottleneck}</span>

      {/* 末尾附上当前最大限制的速览，方便判断该调哪一项 */}
      <span className="ml-auto shrink-0 text-yellow-300/70">
        火种 ×{getFireFactor(view).toFixed(2)} · 食物 ×{formatPercent(getFoodFactor(view))} ·
        人口容量 {formatNumber(getCapacity(view))}
      </span>
    </div>
  );
}
