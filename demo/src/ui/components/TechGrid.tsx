// 文明页 · 科技区（可研究方块 + 已学分类）
//
// ─────────────────────────────────────────────
// 交互模型（2026-09-11 按用户要求重定）
// ─────────────────────────────────────────────
//   1. 主区**只列「当前可研究」的科技**（前置已满足、尚未学）。
//      已学的**不进主区**——它们移到下方"已学科技"分类区。这样主区永远清爽：
//      开局 1 个方块（掌握火），中期也就几个，不会变成一大片网格。
//   2. **点击标签 = 只打开详情浮层**；研究由浮层里的「研究」按钮提交（两段式确认）。
//   3. **悬停（桌面）/ 长按 ≥450ms（触屏）= 只看详情**，浮层里有完整说明、
//      可读化效果列表、成本 / 存量 / 状态。
//   4. 触屏没有 hover，所以长按是移动端唯一的"查看"入口；短按仍然是"研究"。
//
// 方块里只放一个极短标签：关图案时是 1–2 字短名（short，如「火」），开图案时是 emoji。
//
// 浮层用 position: fixed + getBoundingClientRect：要跟着方块走，又不能被滚动容器裁切；
// 再按方块在视口里的位置算坐标并做边界收拢，避免在手机屏幕边缘溢出。

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, toEngineState } from '../../state/store';
import { isTechRevealed } from '../../game/reveal';
import { techsOfEra, BRANCH_INFO, type TechDef } from '../../data/techs';
import { describeEffects, TECH_TYPE_LABEL } from './techEffectsText';
import { Icon } from './Icon';
import { formatNumber } from '../../core/format';

/** 浮层在屏幕上的固定坐标（已做过视口边界收拢） */
interface OverlayPos {
  top: number;
  left: number;
}

/** ready = 经验够，点了就研究；short = 前置满足但经验不够，点了只看详情 */
type Status = 'researched' | 'ready' | 'short';

// 触屏长按触发浮层的阈值（毫秒）。太短会和点击混淆，太长用户没耐心。
const LONG_PRESS_MS = 450;
// 鼠标移开后留给用户把指针移进浮层点按钮的缓冲（毫秒）。
const HOVER_CLOSE_DELAY = 150;
// 浮层预估尺寸，仅用于边界收拢；实际高度随内容自适应并允许内部滚动。
const OVERLAY_W = 300;
const OVERLAY_H = 300;

/** 根据方块在视口里的矩形，算出浮层坐标并收拢到视口内，避免边缘溢出 */
function computePos(rect: DOMRect): OverlayPos {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // 先水平居中于方块，再夹紧到 [8, vw - W - 8]
  let left = rect.left + rect.width / 2 - OVERLAY_W / 2;
  left = Math.max(8, Math.min(left, vw - OVERLAY_W - 8));

  // 默认放在方块下方；放不下就改放上方；上方也放不下就贴底并允许内部滚动
  let top = rect.bottom + 8;
  if (top + OVERLAY_H > vh) top = rect.top - OVERLAY_H - 8;
  if (top < 8) top = Math.max(8, vh - OVERLAY_H - 8);

  return { top, left };
}

/** 方块状态 → 浮层里的状态文案与配色 */
// 状态配色改用设计令牌的语义色：text-ok / text-warn / text-gray-500。
// 这两组令牌在 styles.css 里都有深浅双主题变量，浅色下对比度比写死的
// emerald-400 / amber-400 更稳，不必再靠 light 主题的覆盖规则兜底。
const STATUS_META: Record<Status, { text: string; cls: string }> = {
  researched: { text: '已学', cls: 'text-gray-500' },
  ready: { text: '可研究', cls: 'text-ok' },
  short: { text: '经验不足', cls: 'text-warn' },
};

export function TechGrid() {
  const s = useStore();
  const view = toEngineState(s);
  const research = s.research;

  const [overlay, setOverlay] = useState<{ def: TechDef; status: Status; pos: OverlayPos; armed: boolean } | null>(null);
  /** 「已学科技」分类区默认收起——它只是存档展示，不该抢占主区注意力 */
  const [showLearned, setShowLearned] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const pressTimer = useRef<number | null>(null);

  // 组件卸载时清掉可能还在跑的定时器，避免对已卸载节点 setState
  useEffect(() => {
    return () => {
      if (closeTimer.current !== null) clearTimeout(closeTimer.current);
      if (pressTimer.current !== null) clearTimeout(pressTimer.current);
    };
  }, []);

  // ── 主区：只收「前置已满足且尚未学」的科技 ──
  // 已学的**刻意排除**：它们进下方的分类区，主区保持"待办清单"的语义。
  const available: { def: TechDef; status: Status }[] = [];
  for (const def of techsOfEra(s.era)) {
    if (s.techs[def.id]) continue; // 已学 → 归分类区
    if (!isTechRevealed(def.id, view)) continue; // 前置未满足 → 还不到登场的时候
    available.push({ def, status: view.experience >= def.cost ? 'ready' : 'short' });
  }

  // ── 分类区：已学科技按分支归组，按 BRANCH_INFO.order 排序 ──
  const learnedGroups = useMemo(() => {
    const groups = new Map<string, TechDef[]>();
    for (const def of techsOfEra(s.era)) {
      if (!s.techs[def.id]) continue;
      const list = groups.get(def.branch) ?? [];
      list.push(def);
      groups.set(def.branch, list);
    }
    return [...groups.entries()].sort(
      (a, b) => (BRANCH_INFO[a[0] as TechDef['branch']].order ?? 99) - (BRANCH_INFO[b[0] as TechDef['branch']].order ?? 99)
    );
  }, [s.era, s.techs]);

  const learnedCount = learnedGroups.reduce((n, [, list]) => n + list.length, 0);

  // ── 浮层开关（带延迟，让鼠标能从方块移到浮层上） ──
  const cancelClose = () => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOverlay(null), HOVER_CLOSE_DELAY);
  };
  const closeNow = () => {
    cancelClose();
    if (pressTimer.current !== null) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    setOverlay(null);
  };
  const activate = (def: TechDef, status: Status, el: HTMLElement, armed: boolean) => {
    cancelClose();
    setOverlay({ def, status, pos: computePos(el.getBoundingClientRect()), armed });
  };

  // 触屏：手指按下开始计时，≥450ms 仍未抬起/移动才算长按 → 弹出浮层
  const onTouchStart = (def: TechDef, status: Status, el: HTMLElement) => {
    cancelClose();
    if (pressTimer.current !== null) clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => activate(def, status, el, true), LONG_PRESS_MS);
  };
  // 手指抬起或滑动 → 取消长按计时（避免与滚动/点击混淆）
  const cancelPress = () => {
    if (pressTimer.current !== null) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  /**
   * 点击标签 —— **两段式**：
   *   第一下 → 打开详情浮层（进入"待确认"态）
   *   第二下（同一个标签）→ 真正研究
   *
   * 为什么不做"点一下就研究"：研究是不可撤销的花费，直接扣经验太冒进；
   * 也不做"去点浮层里的按钮"——瞄准一个小按钮很费劲。
   * 让**同一个标签**承担"看 → 确认"两步，桌面与手机手势完全一致。
   *
   * 注意：桌面 hover 也会打开浮层，但那是**预览**（armed=false）——
   * 不计入"第一下"。所以桌面的完整序列是：悬停预览 → 点一下 → 再点一下确认。
   */
  const onTileClick = (def: TechDef, status: Status, el: HTMLElement) => {
    const armed = !!overlay && overlay.def.id === def.id && overlay.armed;

    // 第二下：真正研究（只有"可研究"态允许）
    if (armed) {
      if (status !== 'ready') {
        // 经验不足 / 已学：没有可确认的动作，回到"只看详情"态
        activate(def, status, el, false);
        return;
      }
      if (research(def.id)) {
        closeNow();
        return;
      }
      // canResearch 兜底失败：不静默，回到待确认态让玩家再试
      activate(def, status, el, true);
      return;
    }

    // 第一下：打开详情并进入待确认态
    activate(def, status, el, true);
  };

  // ── 方块视觉 ──
  // **长方形标签**：宽 6 字（桌面）/ 4 字（手机），高度自适应（一行文字 + 上下留白）。
  //   · 宽度用 em 而不是 px：随字号缩放，"6 个汉字宽"在哪个字号下都成立
  //   · 里面放**完整科技名**——宽度既然给到 6 字，塞 1–2 字短名就太空了；
  //     名字直接可见，玩家不用悬停也知道自己在研究什么
  //   · 超出宽度的长名（如「谷仓通风系统」在手机 4 字宽下）截断省略，
  //     完整信息在悬停/长按浮层里
  // **不画框**：状态用文字颜色表达，不套描边。
  const tileClass = (status: Status): string => {
    const base =
      'flex w-[4em] shrink-0 items-center justify-center rounded-md px-1 py-2 text-center text-sm select-none transition-colors sm:w-[6em]';
    switch (status) {
      case 'researched':
        return `${base} text-gray-600`;
      case 'ready':
        // 可研究=正向语义，用 ok（绿）而不是品牌橙：余烬橙每屏只该出现一处
        return `${base} cursor-pointer bg-ok/10 text-ok hover:bg-ok/20`;
      case 'short':
        return `${base} cursor-pointer text-gray-500 hover:text-gray-200`;
    }
  };

  const tileLabel = (def: TechDef) => (
    // 颜色交给外层（ready=绿 / short=灰 / researched=更弱灰），这里只负责排版。
    <span className="truncate leading-none">{def.name}</span>
  );

  return (
    <div>
      {/* ── 提示语：把两个手势一次说清 ── */}
      {/* 用 text-gray-500（双主题都定义为"次要文字"），浅色下也比 gray-600 更够对比 */}
      <p className="mb-2 text-xs text-gray-500">
        点一下看详情 · 再点一下研究（悬停可预览）
      </p>

      {/* ── 主区：可研究的科技 ── */}
      {/* 固定尺寸方块 + flex 换行：不再随容器膨胀，手机/桌面都是同一个紧凑大小 */}
      {available.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {available.map(({ def, status }) => (
            <button
              key={def.id}
              type="button"
              className={tileClass(status)}
              aria-label={`${def.name}（${STATUS_META[status].text}）`}
              // 桌面：悬停只看详情，移开延迟关
              onMouseEnter={(e) => activate(def, status, e.currentTarget, false)}
              onMouseLeave={scheduleClose}
              // 触屏：长按只看详情（不研究）；短按走 onClick = 研究
              onTouchStart={(e) => onTouchStart(def, status, e.currentTarget)}
              onTouchEnd={cancelPress}
              onTouchMove={cancelPress}
              onClick={(e) => onTileClick(def, status, e.currentTarget)}
            >
              {tileLabel(def)}
            </button>
          ))}
        </div>
      ) : (
        /* 空态：没有可研究的科技时给出原因，而不是留一片空白。
           字号提到 text-sm 并保住 gray-500，浅色下也读得清 */
        <p className="rounded-md bg-gray-800/40 px-3 py-2 text-sm text-gray-500">
          暂时没有可研究的科技 —— 攒够经验，或先完成前置科技。
        </p>
      )}

      {/* ── 分类区：已学科技（默认收起，不抢主区注意力） ── */}
      {learnedCount > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowLearned(v => !v)}
            aria-expanded={showLearned}
            className="flex min-h-[44px] w-full items-center gap-2 rounded-md px-2 text-left text-xs text-gray-500 transition-colors hover:bg-gray-800/60 hover:text-gray-300"
          >
            <span className="text-[10px]">{showLearned ? '▼' : '▶'}</span>
            <span>已学科技</span>
            <span className="tabular-nums text-gray-500">
              {learnedCount} / {techsOfEra(s.era).length}
            </span>
          </button>

          {showLearned && (
            <div className="mt-2 space-y-3">
              {learnedGroups.map(([branch, list]) => {
                const info = BRANCH_INFO[branch as TechDef['branch']];
                return (
                  <div key={branch}>
                    {/* 分支标题：用分支色做一条细标记，与科技树的配色语言一致 */}
                    <div className="flex items-center gap-2 px-1">
                      <span
                        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: info.color }}
                        aria-hidden
                      />
                      <span className="text-[11px] font-medium text-gray-400">{info.name}</span>
                      <span className="text-[11px] tabular-nums text-gray-500">{list.length}</span>
                    </div>
                    {/* 已学方块比主区更弱：纯文字、无底无框，靠颜色分层；
                       仍是可点的"查看详情"入口，触控目标 ≥44px（min-h/min-w） */}
                    <div className="mt-1 flex flex-wrap gap-x-1 gap-y-1">
                      {list.map(def => (
                        <button
                          key={def.id}
                          type="button"
                          className="flex w-[4em] shrink-0 items-center justify-center rounded-md px-1 py-2 text-center text-sm text-gray-600 transition-colors hover:text-gray-200 sm:w-[6em]"
                          aria-label={def.name}
                          onMouseEnter={(e) => activate(def, 'researched', e.currentTarget, false)}
                          onMouseLeave={scheduleClose}
                          onTouchStart={(e) => onTouchStart(def, 'researched', e.currentTarget)}
                          onTouchEnd={cancelPress}
                          onTouchMove={cancelPress}
                        >
                          <span className="truncate leading-none">{def.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 浮层：点击/触摸其外区域即关闭（z-40 位于浮层之下、方块之上） */}
      {overlay && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeNow} onTouchStart={closeNow} aria-hidden />
          <div
            className="fixed z-50 max-h-[70vh] w-[300px] overflow-y-auto rounded-lg border border-gray-700 bg-gray-800 p-3 text-left shadow-xl"
            style={{ top: overlay.pos.top, left: overlay.pos.left }}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            role="dialog"
            aria-label={overlay.def.name}
          >
            {/* 头部：图标 + 全名 + 分支·类型 */}
            <div className="flex items-start gap-2">
              <Icon emoji={overlay.def.icon} className="mt-0.5 text-2xl leading-none" />
              <div className="min-w-0">
                {/* 浮层标题用宋体展示字（font-display）并加大——这是"深读"入口，值得给展示字 */}
                <div className="font-display text-lg font-semibold text-gray-100">{overlay.def.name}</div>
                <div className="text-[11px] text-gray-500">
                  {BRANCH_INFO[overlay.def.branch].name} · {TECH_TYPE_LABEL[overlay.def.type]}
                </div>
              </div>
            </div>

            {/* 描述 */}
            <p className="mt-2 text-xs leading-relaxed text-gray-300">{overlay.def.desc}</p>

            {/* 效果（复用共享的中文渲染，单一来源） */}
            {(() => {
              const lines = describeEffects(overlay.def.effects);
              if (lines.length === 0) return null;
              return (
                <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-gray-400">
                  {lines.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              );
            })()}

            {/* 成本 / 当前经验：数字加 font-mono + tabular-nums，等宽对齐像测量记录 */}
            <div className="mt-2 flex items-center justify-between font-mono text-xs tabular-nums text-gray-500">
              <span>
                成本 <span className="font-mono text-gray-200">{formatNumber(overlay.def.cost, 0)}</span> 经验
              </span>
              <span>
                存量 <span className="font-mono text-gray-200">{formatNumber(view.experience, 0)}</span>
              </span>
            </div>

            {/* 状态 + 研究按钮（触屏主要靠这个按钮提交，因为长按只负责看） */}
            <div className="mt-2 flex items-center justify-between">
              <span
                className={`text-xs font-medium ${
                  overlay.armed && overlay.status === 'ready'
                    ? 'text-ok' // 已进入待确认态：提示第二下会真的研究
                    : STATUS_META[overlay.status].cls
                }`}
              >
                {overlay.armed && overlay.status === 'ready'
                  ? '再点一下标签确认研究'
                  : STATUS_META[overlay.status].text}
              </span>
              {overlay.status === 'ready' && (
                <button
                  type="button"
                  // 研究按钮是浮层里的"当前焦点"动作，正好用品牌橙 bg-accent；
                  // 触控目标补到 44px（min-h-[44px]）
                  className="min-h-[44px] rounded-md bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent-strong"
                  onClick={() => {
                    research(overlay.def.id);
                    closeNow();
                  }}
                >
                  研究
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// App.tsx 目前以具名导入引用本组件，这里保留默认导出以兼容两种写法
export default TechGrid;
