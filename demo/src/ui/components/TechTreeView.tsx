// 文明页 · 已学科技树（依赖结构视图）
//
// 与 TechGrid 的「可点方块列表」并存，但视角不同：
//   · TechGrid 强调「现在能研究什么 / 已学了哪些」，是可操作的清单入口。
//   · TechTreeView 强调「依赖结构」——科技如何沿分支、按前置深度层层生长。
//
// 数据口径（与 TechGrid 一致，避免两套揭示逻辑打架）：
//   · 数据源 techsUpToEra(era)：当前及以前所有时代的科技。
//   · 已学（s.techs[id] === true）→ 高亮节点（余烬橙 accent）。
//   · 未学但 isTechRevealed 判定可见 → 灰阶暗节点，显示 🔒 + 名字（渐进揭示）。
//   · 既未学也不可见的 → 不渲染（与 TechGrid 主区口径一致，开局只露出「掌握火」）。
//
// 布局：按分支（BRANCH_INFO / BRANCH_ORDER）分组；组内节点按「依赖深度」分层。
//   深度只在本集合内计算：depth = 0（无本集合内前置）或 1 + max(前置深度)，
//   前置取 requires（AND）与 requiresAny（OR）的并集。
//   层级用 flex 折行 + 左侧发丝线表达依赖（纯 CSS，无第三方库）。
//
// 性能：分支/深度/分组的树形结构用 useMemo 计算（只随时代变化），
//   逐节点的「已学/可见」状态在渲染期按 s.techs 与 isTechRevealed 判定（廉价调用）。

import { useMemo, useState } from 'react';
import { useStore, toEngineState } from '../../state/store';
import { isTechRevealed } from '../../game/reveal';
import { techsUpToEra, BRANCH_INFO, BRANCH_ORDER, type TechDef } from '../../data/techs';
import { Icon } from './Icon';

/** 集合内只算深度的递归（带记忆化，避免重复遍历长链） */
function buildDepths(set: TechDef[]): Map<string, number> {
  const inSet = new Set(set.map(t => t.id));
  const byId = new Map(set.map(t => [t.id, t] as const));
  const cache = new Map<string, number>();

  const depthOf = (id: string): number => {
    const hit = cache.get(id);
    if (hit !== undefined) return hit;
    const def = byId.get(id);
    if (!def) {
      cache.set(id, 0);
      return 0;
    }
    const preds = [...def.requires, ...(def.requiresAny ?? [])].filter(p => inSet.has(p));
    if (preds.length === 0) {
      cache.set(id, 0);
      return 0;
    }
    let d = 0;
    for (const p of preds) d = Math.max(d, depthOf(p) + 1);
    cache.set(id, d);
    return d;
  };

  for (const t of set) depthOf(t.id);
  return cache;
}

export function TechTreeView() {
  const s = useStore();
  const view = toEngineState(s);
  // 默认收起：科技树是 TechGrid 的补充视图，信息量较大，开局不抢占主区注意力
  // （与 TechGrid 的「已学科技」分类区默认收起同一思路）。
  const [open, setOpen] = useState(false);

  // ── 树形结构：分支 → 深度层 → 节点（只随时代变化，记忆化）──
  const branches = useMemo(() => {
    const set = techsUpToEra(s.era);
    const depths = buildDepths(set);

    // 只列本集合实际出现的分支，按 BRANCH_ORDER 全序排（空分支自动剔除）。
    const present = BRANCH_ORDER.filter(b => set.some(t => t.branch === b));

    return present.map(branch => {
      const list = set.filter(t => t.branch === branch);
      const maxDepth = list.reduce((m, t) => Math.max(m, depths.get(t.id) ?? 0), 0);
      // 分层：同层保持 techsUpToEra 的既有顺序（已由 TECHS 定义顺序决定）。
      const levels: { depth: number; nodes: TechDef[] }[] = [];
      for (let d = 0; d <= maxDepth; d++) {
        const ns = list.filter(t => (depths.get(t.id) ?? 0) === d);
        if (ns.length) levels.push({ depth: d, nodes: ns });
      }
      return { branch, info: BRANCH_INFO[branch], levels };
    });
  }, [s.era]);

  // 可见节点总数（折叠态也展示，给玩家一个是否展开的提示）
  const visibleCount = useMemo(() => {
    const set = techsUpToEra(s.era);
    let n = 0;
    for (const t of set) {
      if (s.techs[t.id] || isTechRevealed(t.id, view)) n++;
    }
    return n;
  }, [s.era, s.techs, view]);

  return (
    <section className="space-y-3 rounded-md border border-gray-800 bg-gray-900/30 px-3 py-3">
      {/* 折叠头 */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center gap-2 rounded-md px-1 text-left text-sm text-gray-300 transition-colors hover:bg-gray-800/50 hover:text-gray-100"
      >
        <span className="text-[10px]">{open ? '▼' : '▶'}</span>
        <Icon emoji="🌳" className="text-sm" />
        <span className="font-semibold">科技树</span>
        <span className="text-xs text-gray-500">依赖结构</span>
        <span className="ml-auto text-xs tabular-nums text-gray-600">
          {visibleCount} 节点
        </span>
      </button>

      {open && (
        <div className="space-y-4">
          {branches.map(({ branch, info, levels }) => (
            <div key={branch}>
              {/* 分支标题：用分支色做一条细标记，与 TechGrid 的配色语言一致 */}
              <div className="flex items-center gap-2 px-1">
                <span
                  className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: info.color }}
                  aria-hidden
                />
                <span className="text-[11px] font-medium text-gray-400">{info.name}</span>
                <span className="text-[11px] tabular-nums text-gray-600">{info.role}</span>
              </div>

              {/* 分层：depth 0 不缩进；更深层级用左发丝线 + 缩进表达「依赖上一层」 */}
              <div className="mt-1.5 space-y-1.5">
                {levels.map(lvl => (
                  <div
                    key={lvl.depth}
                    className={
                      lvl.depth === 0
                        ? 'flex flex-wrap gap-1.5'
                        : 'ml-3 flex flex-wrap gap-1.5 border-l border-gray-800 pl-3'
                    }
                  >
                    {lvl.nodes.map(def => {
                      const researched = !!s.techs[def.id];
                      const revealed = isTechRevealed(def.id, view);
                      // 既未学也不可见 → 不渲染（渐进揭示，开局只露「掌握火」）
                      if (!researched && !revealed) return null;

                      return (
                        <div
                          key={def.id}
                          title={def.name}
                          className={[
                            'flex max-w-[10rem] items-center gap-1 rounded-md border px-2 py-1.5 text-xs tabular-nums transition-colors',
                            researched
                              ? 'border-accent/40 bg-accent/10 text-accent'
                              : 'border-gray-800 bg-gray-900/40 text-gray-500',
                          ].join(' ')}
                        >
                          {!researched && <Icon emoji="🔒" className="text-[10px]" />}
                          <span className="truncate">{def.name}</span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// App.tsx 以具名导入引用本组件；保留默认导出以兼容两种写法
export default TechTreeView;
