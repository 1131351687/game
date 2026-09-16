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
import { calcExperienceOutput, CODE_ARTICLE_TECH, getAdminLoad, getGovernanceCoverage, getLegacyBonus, getStabilityRate, getOrderRegime } from '../../game/engine';
import { E4 } from '../../data/constants';
import { isModuleUnlocked } from '../../game/reveal';
import { techsUpToEra } from '../../data/techs';
import { formatNumber, formatRate } from '../../core/format';
import { researchCurrencyName } from '../../data/resources';

import { Icon } from './Icon';
import { TechGrid } from './TechGrid';
import { AdvancePanel } from './AdvancePanel';
import { RecordPanel } from './RecordPanel';

function EmpireDashboard() {
  const s = useStore();
  const view = toEngineState(s);
  const load = getAdminLoad(view);
  const coverage = getGovernanceCoverage(view);
  const stability = getStabilityRate(view);
  const legacyBonus = getLegacyBonus(view);
  const regime = getOrderRegime(view);
  const n = Math.max(1, s.territory);
  const coinCost = Math.ceil(E4.EXPANSION_COIN_BASE * n ** E4.EXPANSION_COIN_EXP);
  const ironCost = Math.ceil(E4.EXPANSION_IRON_BASE * n ** E4.EXPANSION_IRON_EXP);
  const pending = s.expansionPending;
  const polityNames: Record<NonNullable<typeof s.polity>, string> = {
    monarchy: '君主制',
    republic: '共和制',
    theocracy: '神权制',
  };
  return (
    <section className="space-y-3 border-y border-gray-800 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <span className="font-semibold text-accent">帝国治理</span>
        <span>秩序 <b className={s.order >= 80 ? 'text-green-400' : s.order >= 50 ? 'text-amber-300' : 'text-red-400'}>{Math.round(s.order)}</b> · {regime.name}</span>
        <span>覆盖率 κ <b className="text-gray-200">{coverage.toFixed(2)}</b></span>
        <span>维稳率 ρ <b className="text-gray-200">{(stability * 100).toFixed(0)}%</b></span>
        <span>行政负荷 <b className="text-gray-200">{load.toFixed(1)}</b></span>
        <span>版图 <b className="text-gray-200">{s.territory}/{E4.MAX_TERRITORY}</b></span>
        <span>铁 <b className="text-gray-200">{formatNumber(s.iron, 0)}</b></span>
        <span>铸币 <b className="text-amber-300">{formatNumber(s.coin, 0)}</b></span>
        {s.p1Unlocked && <span>遗产 <b className="text-cyan-300">{s.legacyPoints} 点 · ×{legacyBonus.toFixed(2)}</b></span>}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          disabled={!!pending || regime.canExpand === false || s.territory >= E4.MAX_TERRITORY}
          onClick={() => {
            const reason = s.expandTerritory();
            if (reason) s.addMessage(`扩张失败：${reason}`, 'warn');
          }}
          className="rounded bg-accent px-3 py-1.5 font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-800 disabled:text-gray-600"
        >
          {pending ? `平定中（目标版图 ${pending.targetN}）` : `扩张至 ${s.territory + 1}（${formatNumber(coinCost, 0)} 铸币 / ${formatNumber(ironCost, 0)} 铁）`}
        </button>
        {pending && <span className="text-gray-500">预计剩余 {Math.max(0, Math.ceil(pending.until - s.eraElapsedSec))} 秒</span>}
        {s.territory > 1 && (
          <button
            type="button"
            disabled={!!pending}
            onClick={() => s.abandonTerritory()}
            title="放弃一格边缘版图，秩序 -5，不返还扩张成本"
            className="rounded border border-red-900 px-2 py-1 text-red-300 hover:border-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            放弃一格
          </button>
        )}
        <span className="mx-1 text-gray-700">|</span>
        <span className="text-gray-500">政体：{s.polity ? polityNames[s.polity] : '未选择'}</span>
        {(['monarchy', 'republic', 'theocracy'] as const).map(p => (
          <button
            key={p}
            type="button"
            disabled={s.polity === p || s.polityCooldownUntil > 0 || s.coin < E4.POLITY_SWITCH_COIN_COST}
            onClick={() => s.switchPolity(p)}
            className="rounded border border-gray-700 px-2 py-1 text-gray-400 hover:border-gray-500 hover:text-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {polityNames[p]}
          </button>
        ))}
        {s.polityCooldownUntil > 0 && <span className="text-gray-500">切换冷却 {Math.ceil(s.polityCooldownUntil)} 秒</span>}
      </div>
      <div className="border-t border-gray-800 pt-2 text-xs">
        <div className="mb-2 flex items-center gap-3">
          <span className="font-semibold text-gray-300">法典</span>
          <span className="text-gray-500">已用 {s.codeArticles.length} / {Math.min(8, 2 + (s.buildings.code_stele ?? 0))} 槽位</span>
          {s.codeArticlesCooldownSec > 0 && <span className="text-amber-400">冷却 {Math.ceil(s.codeArticlesCooldownSec)}秒</span>}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {[
            ['written_law', '成文法', '治理 +10%，铸币 -10%'],
            ['census', '编户齐民', '治理 +5%，版图承载 +4/格，俸禄 +15%'],
            ['military_merit', '军功爵', '军团配额 +30%，食物 -10%'],
            ['unified_measures', '度量衡统一', '铸币 +20%，需对应科技'],
            ['central_mint', '中央铸币', '铸币 +15%，秩序恢复 +20%'],
            ['faith_tolerance', '信仰宽容', '治理阈值降至 0.65，研究/军团 -10%'],
            ['tenant_binding', '佃农绑定', '食物 +15%，人口增长 -10%'],
            ['salt_iron_monopoly', '盐铁专营', '铸币 +15%，秩序 -1/秒'],
            ['merchant_charter', '商路特许', '铸币 +25%，秩序恢复 -15%'],
          ].map(([id, name, desc]) => {
            const checked = s.codeArticles.includes(id);
            const available = !!s.techs[CODE_ARTICLE_TECH[id]];
            return (
              <label key={id} className={available ? 'cursor-pointer text-gray-300' : 'cursor-not-allowed text-gray-700'} title={desc}>
                <input
                  type="checkbox"
                  className="mr-1 accent-orange-500"
                  checked={checked}
                  disabled={!available}
                  onChange={event => {
                    const next = event.target.checked
                      ? [...s.codeArticles, id]
                      : s.codeArticles.filter(article => article !== id);
                    s.setCodeArticles(next);
                  }}
                />
                {name}
              </label>
            );
          })}
        </div>
      </div>
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
