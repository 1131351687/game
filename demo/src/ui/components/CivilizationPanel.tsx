// 文明页（独立 Tab）· 容器组件
//
// 职责：把与"文明进程"相关的界面聚合成一屏，并提供两种浏览视角。
//   1. 顶栏：进度概览（已学 / 总数）+ 经验存量与产出 + 视图切换
//   2. 跃迁面板：按 reveal 规则渐进出现（放在最上方）
//   3. 视图区：分类视图 / 树状图视图 二选一
//
// 布局约定（配合 App.tsx 的 Tab 结构）：
//   · 外层已由 App.tsx 提供 `mx-auto max-w-4xl`，本组件不再套外层限宽容器
//   · 但树状图需要横向空间，所以**视图区不限宽**，只有跃迁/队列两块收窄到 max-w-4xl
//   · MessageLog 是 `fixed bottom-0`（约 160px），视图区底部 pb-40 防止最后一行被遮挡
//
// 视觉约定（v3 简约化）：
//   · 顶栏去掉边框与实心卡片感，只用一层极淡背景 + 留白
//   · 视图切换做成 segmented control（一个内凹容器 + 两个按钮，选中项 bg-gray-700），不用亮蓝
//   · 所有 emoji 经 <Icon> 渲染（纯文字模式），间距用 gap 建立，不依赖图标宽度

import { useStore, toEngineState } from '../../state/store';
import {
  calcExperienceOutput,
  checkAdvance,
  getArmoryLegionBonus,
  getCoinSpendPerSec,
  getExpansionRequirement,
  getLegacyBonus,
  getLegionPower,
  getTerritoryOutputMultiplier,
} from '../../game/engine';
import { E4 } from '../../data/constants';
import { isModuleUnlocked } from '../../game/reveal';
import { techsUpToEra } from '../../data/techs';
import { formatNumber, formatRate } from '../../core/format';
import { researchCurrencyName } from '../../data/resources';

import { Icon } from './Icon';
import { TechGrid } from './TechGrid';
import { AdvancePanel } from './AdvancePanel';
import { RecordPanel } from './RecordPanel';

function StatusValue({ label, value, tone = 'text-gray-200' }: { label: string; value: string; tone?: string }) {
  return <span className="whitespace-nowrap"><span className="text-gray-500">{label} </span><b className={tone}>{value}</b></span>;
}

function CheckRow({ label, done, detail }: { label: string; done: boolean; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-gray-800/70 py-1.5 last:border-0">
      <span className={done ? 'text-gray-300' : 'text-gray-500'}>{done ? '✓' : '○'} {label}</span>
      <span className={done ? 'shrink-0 text-emerald-400' : 'shrink-0 text-amber-300'}>{detail}</span>
    </div>
  );
}

/**
 * E4 帝国面板：只回答四个问题。
 *   1. 下一块版图需要什么？
 *   2. 军团能不能打，军饷和军粮是否供得上？
 *   3. 版图扩张怎样影响生产与承载？
 *   4. 距离“统一”还差哪几项？
 */
function EmpireDashboard() {
  const s = useStore();
  const view = toEngineState(s);
  const req = getExpansionRequirement(view);
  const pending = s.expansionPending;
  const legions = s.jobs.legion ?? s.legions;
  const advance = checkAdvance(view);
  const legacyBonus = getLegacyBonus(view);
  const territoryOutput = getTerritoryOutputMultiplier(view);
  const legionPower = getLegionPower(view);
  const armoryBonus = getArmoryLegionBonus(view);
  const coinUpkeep = getCoinSpendPerSec(view);
  const foodUpkeep = legions * E4.LEGION_FOOD_PER_SEC;
  const territoryProgress = `${s.territory} / ${E4.MAX_TERRITORY}`;

  const tone = (ok: boolean) => ok ? 'text-emerald-400' : 'text-amber-300';
  const costWidth = (owned: number, needed: number) =>
    `${Math.min(100, needed > 0 ? (owned / needed) * 100 : 100)}%`;

  return (
    <section className="space-y-5 border-y border-gray-800 py-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        <span className="font-semibold text-accent">统一战争</span>
        <StatusValue label="版图" value={territoryProgress} />
        <StatusValue label="物产" value={`×${territoryOutput.toFixed(2)}`} />
        <StatusValue label="军团" value={`${legions} · 战力 ×${legionPower.toFixed(2)}`} tone={legions > 0 ? 'text-emerald-400' : 'text-gray-400'} />
        <StatusValue label="军饷" value={`${formatRate(coinUpkeep)}铸币/秒`} tone={coinUpkeep > 0 ? 'text-amber-300' : 'text-gray-400'} />
        <StatusValue label="军粮" value={`${formatRate(foodUpkeep)}食物/秒`} tone={foodUpkeep > 0 ? 'text-amber-300' : 'text-gray-400'} />
        {s.p1Unlocked && <StatusValue label="遗产" value={`${s.legacyPoints} 点 · ×${legacyBonus.toFixed(2)}`} tone="text-cyan-300" />}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
        <section className="min-w-0">
          <div className="mb-2 flex items-center justify-between text-xs">
            <h3 className="font-semibold text-gray-200">下一块版图</h3>
            <span className="text-gray-500">{req ? `目标 ${req.targetN} / ${E4.MAX_TERRITORY}` : '已推进到当前上限'}</span>
          </div>

          <div className="mb-3 grid grid-cols-10 gap-1" aria-label="版图占用">
            {Array.from({ length: E4.MAX_TERRITORY }, (_, i) => (
              <span key={i} className={`h-2 ${i < s.territory ? 'bg-accent' : 'bg-gray-800'}`} title={`版图 ${i + 1}`} />
            ))}
          </div>

          {req ? (
            <div className="space-y-2 text-xs">
              <div>
                <div className="mb-1 flex items-center justify-between gap-3">
                  <span className="text-gray-500">军团兵力</span>
                  <span className={tone(legions >= req.legionNeed)}>{legions} / {req.legionNeed}</span>
                </div>
                <div className="h-1.5 overflow-hidden bg-gray-800">
                  <div className={legions >= req.legionNeed ? 'h-full bg-emerald-500' : 'h-full bg-amber-500'} style={{ width: costWidth(legions, req.legionNeed) }} />
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between gap-3">
                  <span className="text-gray-500">铸币</span>
                  <span className={tone(s.coin >= req.coinCost)}>{formatNumber(s.coin, 0)} / {formatNumber(req.coinCost, 0)}</span>
                </div>
                <div className="h-1.5 overflow-hidden bg-gray-800">
                  <div className={s.coin >= req.coinCost ? 'h-full bg-emerald-500' : 'h-full bg-amber-500'} style={{ width: costWidth(s.coin, req.coinCost) }} />
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between gap-3">
                  <span className="text-gray-500">铁</span>
                  <span className={tone(s.iron >= req.ironCost)}>{formatNumber(s.iron, 0)} / {formatNumber(req.ironCost, 0)}</span>
                </div>
                <div className="h-1.5 overflow-hidden bg-gray-800">
                  <div className={s.iron >= req.ironCost ? 'h-full bg-emerald-500' : 'h-full bg-amber-500'} style={{ width: costWidth(s.iron, req.ironCost) }} />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={!!pending}
                  onClick={() => {
                    const reason = s.expandTerritory();
                    if (reason) s.addMessage(`扩张失败：${reason}`, 'warn');
                  }}
                  className="rounded bg-accent px-3 py-1.5 font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-800 disabled:text-gray-600"
                >
                  {pending ? `平定中（目标 ${pending.targetN}）` : `出兵夺取第 ${req.targetN} 块版图`}
                </button>
                {pending && <span className="text-gray-500">剩余 {Math.max(0, Math.ceil(pending.until - s.eraElapsedSec))} 秒</span>}
                <span className="text-gray-500">预计平定 {req.flatSec} 秒</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="text-emerald-400">版图扩张已完成。</span>
              {s.territory > 1 && <button type="button" disabled={!!pending} onClick={() => s.abandonTerritory()} className="rounded border border-red-900 px-2 py-1 text-red-300 disabled:opacity-40">放弃一格</button>}
            </div>
          )}
        </section>

        <section className="min-w-0">
          <div className="mb-2 flex items-center justify-between text-xs">
            <h3 className="font-semibold text-gray-200">军团与军需</h3>
            <span className="text-gray-500">营垒编制与人口配额共同限制兵力</span>
          </div>
          <div className="grid gap-x-4 gap-y-1 text-xs text-gray-500 sm:grid-cols-2">
            <span>军团兵 {legions} 人</span>
            <span>军团营垒 {s.buildings.legion_camp ?? 0} 座</span>
            <span>武库 {s.buildings.armory ?? 0} 座 · 战力 +{(armoryBonus * 100).toFixed(0)}%</span>
            <span>武库军饷折扣 {s.buildings.armory ? `-${Math.min(15, (s.buildings.armory ?? 0) * 3)}%` : '0%'}</span>
            <span>总战力倍率 ×{legionPower.toFixed(2)}</span>
            <span>军粮 {formatRate(foodUpkeep)}/秒 · 军饷 {formatRate(coinUpkeep)}/秒</span>
          </div>
          {req && (
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <StatusValue label="所需兵力" value={String(req.legionNeed)} tone={tone(legions >= req.legionNeed)} />
              <StatusValue label="战力抵兵" value={`${Math.max(0, Math.round((1 - 1 / Math.max(1, legionPower)) * 100))}%`} tone="text-cyan-300" />
              <StatusValue label="营垒影响" value="编制上限" />
              <StatusValue label="武库影响" value="战力 / 铁储 / 军饷" />
            </div>
          )}
          {s.territory > 1 && <button type="button" disabled={!!pending} onClick={() => s.abandonTerritory()} className="mt-3 rounded border border-red-900 px-2 py-1 text-xs text-red-300 disabled:opacity-40">放弃一格边缘版图</button>}
        </section>
      </div>

      <section className="border-t border-gray-800 pt-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <h3 className="font-semibold text-gray-200">统一天下</h3>
          <span className={advance.ok ? 'text-emerald-400' : 'text-gray-500'}>{advance.ok ? '全部满足，可以完成 E4' : '继续征战与整备'}</span>
        </div>
        <div className="grid gap-x-5 sm:grid-cols-2">
          {advance.items.map(item => <CheckRow key={item.label} label={item.label} done={item.done} detail={item.detail} />)}
        </div>
      </section>
    </section>
  );
}

export function CivilizationPanel() {
  const s = useStore();
  const view = toEngineState(s);

  // 已学 / 总数按**当前及以前所有时代**统计（techsUpToEra）。
  // 跃迁原则：新时代是叠加开放，不是换版本——E1 的知识积累是 E2 进度的一部分。
  // 进 E2 时读数从「12 / 20」变为「12 / 50」而不是归零重计；
  // 与 TechGrid 已学区的口径保持一致。
  const eraTechs = techsUpToEra(s.era);
  const researched = eraTechs.filter(t => s.techs[t.id]).length;
  const total = eraTechs.length;
  const expOutput = calcExperienceOutput(view);
  const knowledgeHint = s.era === 'E3' && expOutput <= 0
    ? '知识暂无产出：请在“工作”中分配书吏。'
    : s.era === 'E3' && !s.techs.cuneiform
      ? '楔形文字完成前，知识由文明积累缓慢增长；研究后请分配书吏。'
      : null;

  // 渐进解锁：条件未达成时整块面板不渲染（避免开局信息过载）
  const showAdvance = isModuleUnlocked('advance', view);

  const progress = total > 0 ? Math.min(1, researched / total) : 0;

  return (
    <div className="mx-auto min-w-0 max-w-[76rem] space-y-5 xl:space-y-6">
      {/* ── 顶栏：左侧进度 / 中间经验 / 右侧视图切换（无边框，仅极淡底色） ── */}
      <header className="space-y-2 border-b border-gray-800 px-4 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          {/* 左：已学科技数（数字等宽对齐） */}
          <div className="text-xs font-mono tabular-nums text-gray-400">
            已学 <span className="text-sm font-semibold text-gray-100">{researched}</span>
            <span className="text-gray-600"> / {total}</span>
          </div>

          {/* 中：经验存量 + 每秒产出（数字等宽对齐） */}
          <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-gray-400">
            <span className="inline-flex items-center gap-1">
              {researchCurrencyName(s.era)}{' '}
              <span className="text-sm font-semibold text-gray-100">
                {formatNumber(view.experience, 0)}
              </span>
              <Icon emoji="💡" className="text-[10px]" />
            </span>
            {/* 产出速率 > 0 时给一点点颜色（关键状态），否则纯灰 */}
            <span
              title={researchCurrencyName(s.era) + '产出速率'}
              className={expOutput > 0 ? 'text-ok' : 'text-gray-600'}
            >
              {formatRate(expOutput)}/秒
            </span>
          </div>
        </div>

        {knowledgeHint && (
          <div className="border-l-2 border-warn/70 pl-2 text-xs text-warn">
            {knowledgeHint}
          </div>
        )}

        {/* 细进度条：把"已学 / 总数"视觉化。
            这是"文明推进了多少"的度量，正是余烬橙该出现的地方（强调色，非中性灰）。 */}
        <div className="h-0.5 overflow-hidden rounded-full bg-gray-800">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </header>

      {/* ── 跃迁面板：渐进解锁，收窄到与其它 Tab 一致的阅读宽度 ── */}
      {showAdvance && (
        <div className="mx-auto max-w-4xl space-y-6">
          <AdvancePanel />
        </div>
      )}

      {s.era === 'E4' && <EmpireDashboard />}

      {/* ── 刻录 · 泥板档案（E3 记录系统；由左侧状态栏移入文明板块）──
          RecordPanel 自带可折叠外壳：未研究「楔形文字」时整节不渲染。 */}
      <RecordPanel className="mx-auto max-w-4xl" />

      {/* ── 视图区：科技网格 —— 已学科技区内置「列表 | 图谱」双形态切换
          （2026-09-13：外置的独立科技树已删除，依赖结构收进图谱模式） ── */}
      <div className="pb-40">
        <TechGrid />
      </div>
    </div>
  );
}

// App.tsx 目前以具名导入引用本组件，这里保留默认导出以兼容两种写法
export default CivilizationPanel;
