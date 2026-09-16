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
import { calcExperienceOutput, checkAdvance, CODE_ARTICLE_TECH, getAdminLoad, getGovernanceCoverage, getGovernanceEfficiency, getGovernanceSupply, getLegacyBonus, getStabilityRate, getOrderRegime } from '../../game/engine';
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

function EmpireDashboard() {
  const s = useStore();
  const view = toEngineState(s);
  const load = getAdminLoad(view);
  const coverage = getGovernanceCoverage(view);
  const stability = getStabilityRate(view);
  const legacyBonus = getLegacyBonus(view);
  const regime = getOrderRegime(view);
  const supply = getGovernanceSupply(view);
  const efficiency = getGovernanceEfficiency(view);
  const officialsNeeded = Math.ceil(load / Math.max(0.01, efficiency));
  const n = Math.max(1, s.territory);
  const coinCost = Math.ceil(E4.EXPANSION_COIN_BASE * n ** E4.EXPANSION_COIN_EXP);
  const ironCost = Math.ceil(E4.EXPANSION_IRON_BASE * n ** E4.EXPANSION_IRON_EXP);
  const legionNeed = Math.ceil(0.15 * n ** 1.15);
  const pending = s.expansionPending;
  const advance = checkAdvance(view);
  const polityUnlocked = !!s.techs['provincial_system'];
  const polityNames: Record<NonNullable<typeof s.polity>, string> = { monarchy: '君主制', republic: '共和制', theocracy: '神权制' };
  const articleDefs: [string, string, string][] = [
    ['written_law', '成文法', '治理 +10%，铸币 -10%'],
    ['census', '编户齐民', '治理 +5%，版图承载增强，俸禄 +15%'],
    ['military_merit', '军功爵', '军团配额 +30%，食物 -10%'],
    ['unified_measures', '度量衡统一', '铸币 +20%'],
    ['central_mint', '中央铸币', '铸币 +15%，秩序恢复 +20%'],
    ['faith_tolerance', '信仰宽容', '治理阈值降至 0.65'],
    ['tenant_binding', '佃农绑定', '食物 +15%，人口增长 -10%'],
    ['salt_iron_monopoly', '盐铁专营', '铸币 +15%，秩序 -1/秒'],
    ['merchant_charter', '商路特许', '铸币 +25%，秩序恢复 -15%'],
  ];

  return (
    <section className="space-y-5 border-y border-gray-800 py-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        <span className="font-semibold text-accent">帝国治理</span>
        <StatusValue label="秩序" value={`${Math.round(s.order)} · ${regime.name}`} tone={s.order >= 80 ? 'text-emerald-400' : s.order >= 50 ? 'text-amber-300' : 'text-red-400'} />
        <StatusValue label="覆盖 κ" value={coverage.toFixed(2)} />
        <StatusValue label="维稳 ρ" value={`${(stability * 100).toFixed(0)}%`} />
        <StatusValue label="行政负荷" value={load.toFixed(1)} />
        <StatusValue label="版图" value={`${s.territory}/${E4.MAX_TERRITORY}`} />
        <StatusValue label="铁" value={formatNumber(s.iron, 0)} />
        <StatusValue label="铸币" value={formatNumber(s.coin, 0)} tone="text-amber-300" />
        {s.p1Unlocked && <StatusValue label="遗产" value={`${s.legacyPoints} 点 · ×${legacyBonus.toFixed(2)}`} tone="text-cyan-300" />}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
        <section className="min-w-0">
          <div className="mb-2 flex items-center justify-between text-xs">
            <h3 className="font-semibold text-gray-200">治理供给</h3>
            <span className={coverage >= 1 ? 'text-emerald-400' : 'text-amber-300'}>{Math.floor(supply)} / {Math.ceil(load)} 供给 / 负荷</span>
          </div>
          <div className="mb-2 h-1.5 overflow-hidden bg-gray-800">
            <div className={`h-full ${coverage >= 1 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, coverage * 100)}%` }} />
          </div>
          <div className="grid gap-x-4 gap-y-1 text-xs text-gray-500 sm:grid-cols-2">
            <span>官吏 {s.jobs.official ?? 0} 人 · 效率 ×{efficiency.toFixed(2)}</span>
            <span>{coverage >= 1 ? '治理余量充足' : `还需约 ${Math.max(0, officialsNeeded - (s.jobs.official ?? 0))} 名官吏`}</span>
            <span>军团 {s.jobs.legion ?? 0} 人 · 压制规模负荷</span>
            <span>遗产倍率 ×{legacyBonus.toFixed(2)} · 产出已计入</span>
          </div>
        </section>

        <section className="min-w-0">
          <div className="mb-2 flex items-center justify-between text-xs">
            <h3 className="font-semibold text-gray-200">版图控制</h3>
            <span className="text-gray-500">{s.territory} / {E4.MAX_TERRITORY} 格</span>
          </div>
          <div className="mb-2 grid grid-cols-10 gap-1" aria-label="版图占用">
            {Array.from({ length: E4.MAX_TERRITORY }, (_, i) => (
              <span key={i} className={`h-2 ${i < s.territory ? 'bg-accent' : 'bg-gray-800'}`} title={`版图 ${i + 1}`} />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <StatusValue label="下格铁" value={formatNumber(ironCost, 0)} tone={s.iron >= ironCost ? 'text-emerald-400' : 'text-red-300'} />
            <StatusValue label="下格铸币" value={formatNumber(coinCost, 0)} tone={s.coin >= coinCost ? 'text-emerald-400' : 'text-red-300'} />
            <StatusValue label="军团" value={`${s.jobs.legion ?? 0}/${legionNeed}`} tone={(s.jobs.legion ?? 0) >= legionNeed ? 'text-emerald-400' : 'text-red-300'} />
            <StatusValue label="秩序" value={`${Math.round(s.order)}/50`} tone={s.order >= 50 ? 'text-emerald-400' : 'text-red-300'} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <button type="button" disabled={!!pending || regime.canExpand === false || s.territory >= E4.MAX_TERRITORY} onClick={() => { const reason = s.expandTerritory(); if (reason) s.addMessage(`扩张失败：${reason}`, 'warn'); }} className="rounded bg-accent px-3 py-1.5 font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-800 disabled:text-gray-600">
              {pending ? `平定中（目标 ${pending.targetN}）` : `扩张至 ${s.territory + 1}`}
            </button>
            {pending && <span className="text-gray-500">剩余 {Math.max(0, Math.ceil(pending.until - s.eraElapsedSec))} 秒</span>}
            {s.territory > 1 && <button type="button" disabled={!!pending} onClick={() => s.abandonTerritory()} className="rounded border border-red-900 px-2 py-1 text-red-300 disabled:opacity-40">放弃一格</button>}
          </div>
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="min-w-0 border-t border-gray-800 pt-3">
          <div className="mb-2 flex flex-wrap items-center gap-3 text-xs">
            <h3 className="font-semibold text-gray-200">政体</h3>
            <span className="text-gray-500">当前：{s.polity ? polityNames[s.polity] : '未选择'}</span>
            {s.polityCooldownUntil > 0 && <span className="text-amber-300">冷却 {Math.ceil(s.polityCooldownUntil)} 秒</span>}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {(['monarchy', 'republic', 'theocracy'] as const).map(p => (
              <button key={p} type="button" disabled={!polityUnlocked || s.polity === p || s.polityCooldownUntil > 0 || s.coin < E4.POLITY_SWITCH_COIN_COST} onClick={() => s.switchPolity(p)} className={`min-w-0 border px-2 py-2 text-left text-xs ${s.polity === p ? 'border-accent text-gray-100' : 'border-gray-800 text-gray-500 hover:border-gray-600'} disabled:cursor-not-allowed disabled:opacity-50`} title={!polityUnlocked ? '需先研究「郡县制」' : undefined}>
                <span className="block font-semibold">{polityNames[p]}</span>
                <span className="mt-1 block text-[11px]">切换 -{E4.POLITY_SWITCH_COIN_COST.toLocaleString()} 铸币 / 秩序 -{E4.POLITY_SWITCH_ORDER_COST}</span>
              </button>
            ))}
            {!polityUnlocked && <span className="text-[11px] text-gray-600">研究「郡县制」后解锁政体切换</span>}
          </div>
        </section>

        <section className="min-w-0 border-t border-gray-800 pt-3">
          <div className="mb-2 flex items-center gap-3 text-xs">
            <h3 className="font-semibold text-gray-200">法典</h3>
            <span className="text-gray-500">{s.codeArticles.length} / {Math.min(8, 2 + (s.buildings.code_stele ?? 0))} 槽位</span>
            {s.codeArticlesCooldownSec > 0 && <span className="text-amber-300">冷却 {Math.ceil(s.codeArticlesCooldownSec)} 秒</span>}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {articleDefs.map(([id, name, desc]) => {
              const checked = s.codeArticles.includes(id);
              const available = !!s.techs[CODE_ARTICLE_TECH[id]];
              return <label key={id} className={available ? 'cursor-pointer text-gray-300' : 'cursor-not-allowed text-gray-700'} title={desc}><input type="checkbox" className="mr-1 accent-orange-500" checked={checked} disabled={!available} onChange={event => { const next = event.target.checked ? [...s.codeArticles, id] : s.codeArticles.filter(article => article !== id); s.setCodeArticles(next); }} />{name}</label>;
            })}
          </div>
        </section>
      </div>

      <section className="border-t border-gray-800 pt-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <h3 className="font-semibold text-gray-200">E4 → E5 交接门槛</h3>
          <span className={advance.ok ? 'text-emerald-400' : 'text-gray-500'}>{advance.ok ? '全部满足，可跃迁' : '继续建设帝国'}</span>
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
