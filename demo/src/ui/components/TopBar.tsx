// 顶部资源条 —— 常驻页面最上方（h-screen 布局的第 ① 层）
//
// 布局约束：本组件是 shrink-0 的固定高度区域，整体页面不出现 body 滚动条，
// 因此这里必须**单行、紧凑**（目标高度 ≤ 40px：py-1.5 + text-sm/leading-none）。
// 资源变多时横向滚动（overflow-x-auto + flex-nowrap），绝不换行把下面挤扁。
//
// 只显示已解锁的资源（渐进解锁），人口单独显示「数量 / 上限」与增长速率。
//
// 视觉简约化：去掉卡片化外观，仅用一条极淡分隔线（border-gray-800）与内容区分界；
// 层级靠字重与灰阶建立（数值白、标签灰、速率弱化），不再使用色块背景。
//
// 纯文字模式：所有 emoji 走 <Icon>，关闭图标时该节点不渲染 ——
// 外层容器一律使用 flex + gap 排布，因此不依赖图标宽度，不会塌陷错位。

import { useStore, toEngineState } from '../../state/store';
import { MATERIAL_RESOURCES, RESOURCE_MAP, type ResourceId } from '../../data/resources';
import { isResourceRevealed } from '../../game/reveal';
import {
  calcResourceOutput,
  calcExperienceOutput,
  getResourceStorage,
  getCapacity,
  getPopulationGrowth,
} from '../../game/engine';
import { formatNumber, formatRate } from '../../core/format';
import { Icon } from './Icon';

/** 数值列固定宽度 + 右对齐，避免数字位数变化时整行抖动 */
const VALUE_COL = 'min-w-[3.5rem] text-right';
/** 速率列同理 */
const RATE_COL = 'min-w-[3rem] text-right';

/**
 * E2 定居时代的资源排列顺序。
 *
 * 谷物是本时代的核心仪表盘数值（同 E1 的火种），必须排在最前；
 * 接下来是另外两项本时代资源（牲畜 / 织物）。
 * 木材 / 石头仍显示 —— E2 的建筑（村落民居、田地、粮仓…）照样消耗它们。
 * 经验沿用 E1。
 *
 * ⚠️ food 暂列末位：设计文档 §6 的 E2 资源集里没有食物，
 * 但 §7 又保留了采集者 / 猎人（"冬季蛋白补充"），二者存在冲突，
 * 且"E2 是否还该让 food 可见可产"尚未拍板 —— 因此这里保留显示，
 * 只把它降级到末位，不做静默删除。
 */
const E2_RESOURCE_ORDER: ResourceId[] = [
  'grain',
  'livestock',
  'fabric',
  'wood',
  'stone',
  'experience',
  'food',
];

export function TopBar() {
  const s = useStore();
  const view = toEngineState(s);

  const order = s.era === 'E1' ? MATERIAL_RESOURCES : E2_RESOURCE_ORDER;
  const shown = order.filter(id => isResourceRevealed(id, view));
  const popGrowth = getPopulationGrowth(view);
  const capacity = getCapacity(view);

  return (
    <div className="flex shrink-0 flex-nowrap items-center gap-5 overflow-x-auto border-b border-gray-800 bg-gray-900/40 px-4 py-1.5 text-sm leading-tight">
      {shown.map(id => {
        const def = RESOURCE_MAP[id];
        const rate = id === 'experience' ? calcExperienceOutput(view) : calcResourceOutput(id, view);
        const cap = getResourceStorage(id, view);
        const amount =
          id === 'experience'
            ? s.experience
            : (s[id as 'food' | 'wood' | 'stone' | 'grain' | 'livestock' | 'fabric'] as number);

        return (
          // gap 负责间距：图标被隐藏（Icon → null）时不会留下空洞
          <span key={id} className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
            <Icon emoji={def.icon} className="text-sm" />
            <span className="text-gray-500">{def.name}</span>
            {/* 主数值：等宽字体 + 右对齐，位数变化不影响其他项的位置 */}
            <span className={`${VALUE_COL} font-mono tabular-nums text-gray-100`}>
              {formatNumber(amount)}
            </span>
            {Number.isFinite(cap) && (
              // 容量分母同属数字，一并等宽对齐，避免位数变化抖动
              <span className="font-mono tabular-nums text-xs text-gray-600">/ {formatNumber(cap)}</span>
            )}
            <span
              className={`${RATE_COL} font-mono text-xs tabular-nums ${
                rate > 0 ? 'text-emerald-400/80' : 'text-gray-600'
              }`}
            >
              {formatRate(rate)}
            </span>
          </span>
        );
      })}

      {/* 人口：单独显示上限与增长速率（增长/衰减按正负着色，其余保持灰阶） */}
      <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
        <Icon emoji={RESOURCE_MAP.population.icon} className="text-sm" />
        <span className="text-gray-500">人口</span>
        <span className={`${VALUE_COL} font-mono tabular-nums text-gray-100`}>
          {Math.floor(s.population)}
          {/* 人口上限同属数字，等宽对齐 */}
          <span className="font-mono tabular-nums text-gray-600"> / {capacity}</span>
        </span>
        <span
          className={`${RATE_COL} font-mono text-xs tabular-nums ${
            popGrowth > 0
              ? 'text-emerald-400/80'
              : popGrowth < 0
                ? 'text-red-400/80'
                : 'text-gray-600'
          }`}
        >
          {formatRate(popGrowth)}
        </span>
      </span>
    </div>
  );
}
