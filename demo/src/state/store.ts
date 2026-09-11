// E1 远古时代 · 状态管理
// 数值与规则见 design/game/02-tech-eras.md

import { create } from 'zustand';
import { JOBS, type JobId } from '../data/jobs';
import { BUILDINGS, type BuildingId } from '../data/buildings';
import type { EraId } from '../data/era';
import { ERAS } from '../data/era';
import { TECH_MAP } from '../data/techs';
import { INITIAL_STATE, QUEUE, LOOP } from '../data/constants';
import * as engine from '../game/engine';
import { isJobRetired } from '../game/reveal';
import { computeEraTransition } from '../game/transition';
import { saveGame } from '../core/clock/scheduler';

// ─────────────────────────────────────────────
// 类型
// ─────────────────────────────────────────────
export interface Message {
  id: string;
  text: string;
  category: 'all' | 'tech' | 'event' | 'warn';
  timestamp: number;
  important: boolean;
}

/** 玩家设置 */
export interface GameSettings {
  /**
   * 是否显示图标（emoji）。
   * 关闭后进入「纯文字模式」——所有 emoji 都不渲染，界面更素净。
   */
  showIcons: boolean;
  /**
   * 主题：'dark' = 夜间（默认，深色护眼），'light' = 日间。
   * 切换仅设置 document.documentElement 的 data-theme，组件无需改动。
   */
  theme: 'dark' | 'light';
}

export const DEFAULT_SETTINGS: GameSettings = {
  // 用户明确要求：默认关闭图案（纯文字模式）。
  showIcons: false,
  // 默认夜间，与 styles.css 的 :root 默认态对齐。
  theme: 'dark',
};

/**
 * 把主题应用到 <html> 上。
 *
 * styles.css 的契约：`:root` 即夜间（默认），`[data-theme='light']` 才切换到日间。
 * 因此夜间不需要任何属性，日间才显式标注。这样「未设置」与「夜间」语义一致，
 * 避免残留 'dark' 字符串造成的歧义。
 *
 * ⚠️ SSR / Node 防护：项目里有一个在 Node 中跑 renderToString 的回归测试脚本，
 * 那里没有 document；若不判断直接访问 document.documentElement 会直接崩溃。
 * 所以在 typeof document === 'undefined' 时直接 return。
 */
export function applyTheme(theme: GameSettings['theme']): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'light') {
    root.dataset.theme = 'light';
  } else {
    root.removeAttribute('data-theme');
  }
}

export interface GameState {
  running: boolean;
  version: number;
  /** 当前所处时代 */
  era: EraId;

  // 资源
  food: number;
  wood: number;
  stone: number;
  experience: number;

  // ── E2 定居时代资源 ──
  // 注：「谷物」曾是与食物并列的主粮，2026-09-12 用户拍板
  // 「暂时不区分采集所得与农耕收获」，已**合并为单一「食物」**。
  // 旧存档里的 grain 在 loadSnapshot 中折算进 food（见 v5 迁移）。
  /** 活体牲畜：不占储存容量的活体储备，也是畜力来源 */
  livestock: number;
  /** 织物 */
  fabric: number;
  /**
   * 本时代已经过的秒数 —— 季节循环的**唯一驱动源**。
   * 跨时代跃迁时归零，所以每个时代都从春天开始。
   */
  eraElapsedSec: number;

  // 人口与火种
  /** 人口：始终为整数 */
  population: number;
  /** 人口增长的累积进度（0..1）—— 保证人口离散增长，满员时能排满所有岗位 */
  populationProgress: number;
  fire: number;
  autoMaintainFire: boolean;

  // 岗位与建筑
  jobs: Record<string, number>;
  buildings: Record<string, number>;

  // 科技与队列
  techs: Record<string, boolean>;
  queue: string[];
  /** 当前正在研究（队列首位）的已投入进度（0–1），用于进度环 */
  researchProgress: number;

  // 统计
  stats: {
    startTime: number;
    playTime: number;
    totalResearched: number;
  };

  messages: Message[];
  lastActiveAt: number;
  settings: GameSettings;

  // ── Actions ──
  setRunning: (v: boolean) => void;
  addFuel: (wood: number) => void;
  toggleAutoMaintain: () => void;
  setJobCount: (jobId: JobId, count: number) => void;
  assignAllIdle: (jobId: JobId) => void;
  clearJobs: () => void;
  build: (buildingId: BuildingId) => boolean;
  research: (techId: string) => boolean;
  enqueue: (techId: string) => void;
  dequeue: (index: number) => void;
  reorderQueue: (from: number, to: number) => void;
  /** 由 fastLoop 调用 */
  doTick: (dt: number) => void;
  /** 由 longLoop 调用 */
  doLongTick: () => void;
  addMessage: (text: string, category?: Message['category'], important?: boolean) => void;
  clearMessages: () => void;
  /** 切换图标显示（纯文字模式开关） */
  toggleIcons: () => void;
  updateSettings: (patch: Partial<GameSettings>) => void;
  takeSnapshot: () => Partial<GameState>;
  loadSnapshot: (data: Partial<GameState>) => void;
  resetGame: () => void;
  /** 跃迁到下一个时代。返回是否成功 */
  advanceEra: () => boolean;
}

const SAVE_VERSION = 5;

const initialState = () => ({
  running: false,
  version: SAVE_VERSION,
  era: 'E1' as EraId,
  food: INITIAL_STATE.food,
  wood: INITIAL_STATE.wood,
  stone: INITIAL_STATE.stone,
  experience: INITIAL_STATE.experience,
  livestock: 0,
  fabric: 0,
  eraElapsedSec: 0,
  population: INITIAL_STATE.population,
  populationProgress: 0,
  fire: INITIAL_STATE.fire,
  autoMaintainFire: true,
  jobs: Object.fromEntries(JOBS.map(j => [j.id, 0])) as Record<string, number>,
  buildings: Object.fromEntries(BUILDINGS.map(b => [b.id, 0])) as Record<string, number>,
  techs: {} as Record<string, boolean>,
  queue: [] as string[],
  researchProgress: 0,
  stats: { startTime: Date.now(), playTime: 0, totalResearched: 0 },
  messages: [] as Message[],
  lastActiveAt: Date.now(),
  settings: { ...DEFAULT_SETTINGS },
});

/** 从完整 state 中提取引擎需要的只读切片 */
function engineView(s: GameState): engine.EraState {
  return {
    era: s.era,
    food: s.food,
    wood: s.wood,
    stone: s.stone,
    experience: s.experience,
    livestock: s.livestock,
    fabric: s.fabric,
    eraElapsedSec: s.eraElapsedSec,
    population: s.population,
    populationProgress: s.populationProgress,
    fire: s.fire,
    jobs: s.jobs,
    buildings: s.buildings,
    techs: s.techs,
    autoMaintainFire: s.autoMaintainFire,
  };
}

/**
 * 组件里这样用：
 *   const s = useStore();
 *   const view = toEngineState(s);
 * 然后把 view 传给 engine 的各个计算函数。
 */
export const toEngineState = engineView;

export const useStore = create<GameState>((set, get) => ({
  ...initialState(),

  setRunning: (v) => set({ running: v }),

  addFuel: (wood) => {
    const s = get();
    const r = engine.addFuel(engineView(s), wood);
    set({ fire: r.fire, wood: r.wood });
  },

  toggleAutoMaintain: () => set(s => ({ autoMaintainFire: !s.autoMaintainFire })),

  setJobCount: (jobId, count) => {
    const s = get();
    if (!engine.isJobUnlocked(jobId, engineView(s))) return;
    // 退役岗位（如农耕时代的采集者）不接受分配：
    // UI 已经不再显示它的加减按钮，这里再兜一层，防止旧存档/异常路径往里塞人。
    if (isJobRetired(jobId, engineView(s))) return;

    const others = engine.getAssignedPopulation(engineView(s)) - (s.jobs[jobId] ?? 0);
    const maxAllowed = Math.max(0, Math.floor(s.population - others));
    const clamped = Math.max(0, Math.min(Math.floor(count), maxAllowed));
    set({ jobs: { ...s.jobs, [jobId]: clamped } });
  },

  assignAllIdle: (jobId) => {
    const s = get();
    if (!engine.isJobUnlocked(jobId, engineView(s))) return;
    const idle = engine.getIdlePopulation(engineView(s));
    set({ jobs: { ...s.jobs, [jobId]: (s.jobs[jobId] ?? 0) + Math.floor(idle) } });
  },

  clearJobs: () => {
    const s = get();
    set({ jobs: { ...s.jobs, ...Object.fromEntries(JOBS.map(j => [j.id, 0])) } });
  },

  build: (buildingId) => {
    const s = get();
    const view = engineView(s);
    if (!engine.isBuildingUnlocked(buildingId, view)) return false;
    if (!engine.canAffordBuilding(buildingId, view)) return false;

    const cost = engine.getBuildingCost(buildingId, view);
    const next: Partial<GameState> = {
      buildings: { ...s.buildings, [buildingId]: (s.buildings[buildingId] ?? 0) + 1 },
    };
    // 按成本表逐项扣除。写成资源名驱动而不是 if (res === 'wood')/('stone')/('food')，
    // 否则 E2/E3 一旦出现谷物等新成本的建筑，就会变成"不花资源白拿"。
    for (const [res, amount] of Object.entries(cost)) {
      const key = res as 'food' | 'wood' | 'stone' | 'livestock' | 'fabric';
      const owned = s[key];
      if (typeof owned === 'number') next[key] = owned - (amount as number);
    }
    set(next);
    const def = BUILDINGS.find(b => b.id === buildingId);
    get().addMessage(`建成「${def?.name ?? buildingId}」`, 'event');
    return true;
  },

  research: (techId) => {
    const s = get();
    const check = engine.canResearch(techId, engineView(s));
    if (!check.ok) return false;

    const def = TECH_MAP[techId];
    set({
      experience: s.experience - def.cost,
      techs: { ...s.techs, [techId]: true },
      stats: { ...s.stats, totalResearched: s.stats.totalResearched + 1 },
    });
    get().addMessage(`研究完成：${def.name}`, 'tech', def.type === 'gate');
    return true;
  },

  enqueue: (techId) => {
    const s = get();
    if (s.queue.length >= QUEUE.MAX_LENGTH) return;
    if (s.queue.includes(techId) || s.techs[techId]) return;
    set({ queue: [...s.queue, techId] });
  },

  dequeue: (index) => {
    const s = get();
    set({ queue: s.queue.filter((_, i) => i !== index), researchProgress: 0 });
  },

  reorderQueue: (from, to) => {
    const s = get();
    const q = [...s.queue];
    if (from < 0 || from >= q.length || to < 0 || to >= q.length) return;
    const [item] = q.splice(from, 1);
    q.splice(to, 0, item);
    set({ queue: q });
  },

  // ── 主循环 ──
  doTick: (dt) => {
    const s = get();
    if (!s.running) return;

    const r = engine.tick(engineView(s), dt);
    set({
      food: r.food,
      wood: r.wood,
      stone: r.stone,
      experience: r.experience,
      livestock: r.livestock,
      fabric: r.fabric,
      eraElapsedSec: r.eraElapsedSec,
      population: r.population,
      populationProgress: r.populationProgress,
      fire: r.fire,
    });

    // ── 岗位进阶（采集者 → 农夫 等）──
    //
    // 放在 tick 里逐人推进（每次 1 人），而不是跃迁时一次性转换：
    //   ① 触发条件是"目标岗位已解锁 **且有工位**"，而工位来自建筑
    //      （田地/畜栏）——那是在时代内陆续建起来的；一次性转换会在
    //      "田地还没建"时把人送进闲置岗位，当场断粮。
    //   ② 逐人转换让"职业专职化"这个过程在 UI 上看得见。
    // 消息只在**第一次**转换时提示，避免刷屏。
    const upgraded = engine.applyJobUpgrade(engineView(get()));
    if (upgraded) {
      const fromName = JOBS.find(j => j.id === upgraded.from)?.name ?? upgraded.from;
      const toName = JOBS.find(j => j.id === upgraded.to)?.name ?? upgraded.to;
      const firstTime = (get().jobs[upgraded.to] ?? 0) === 0;
      set({ jobs: upgraded.jobs });
      if (firstTime) {
        get().addMessage(`${fromName}掌握新技艺，开始专职为${toName}`, 'event');
      }
    }

    // 队列首位自动研究
    const after = get();
    if (after.queue.length > 0) {
      const head = after.queue[0];
      const def = TECH_MAP[head];
      if (def && after.experience >= def.cost) {
        // 前置检查
        const check = engine.canResearch(head, engineView({ ...after, experience: after.experience }));
        if (check.ok) {
          after.research(head);
          set({ queue: get().queue.filter((_, i) => i !== 0) });
          set({ researchProgress: 0 });
        }
      }
    }
  },

  doLongTick: () => {
    const s = get();
    set({
      stats: { ...s.stats, playTime: s.stats.playTime + LOOP.AUTOSAVE_SEC },
      lastActiveAt: Date.now(),
    });
  },

  addMessage: (text, category = 'all', important = false) => {
    const msg: Message = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      text,
      category,
      timestamp: Date.now(),
      important,
    };
    set(s => ({ messages: [...s.messages.slice(-79), msg] }));
  },

  clearMessages: () => set({ messages: [] }),

  toggleIcons: () => set(s => ({ settings: { ...s.settings, showIcons: !s.settings.showIcons } })),

  updateSettings: (patch) => {
    set(s => ({ settings: { ...s.settings, ...patch } }));
    // 写入主题后立即应用到 <html>，保证界面实时切换，无需刷新。
    if ('theme' in patch && patch.theme) {
      applyTheme(patch.theme);
    }
  },

  // ── 存档 ──
  takeSnapshot: () => {
    const s = get();
    return {
      version: SAVE_VERSION,
      era: s.era,
      food: s.food,
      wood: s.wood,
      stone: s.stone,
      experience: s.experience,
      livestock: s.livestock,
      fabric: s.fabric,
      eraElapsedSec: s.eraElapsedSec,
      population: s.population,
      populationProgress: s.populationProgress,
      fire: s.fire,
      autoMaintainFire: s.autoMaintainFire,
      jobs: s.jobs,
      buildings: s.buildings,
      techs: s.techs,
      queue: s.queue,
      stats: s.stats,
      lastActiveAt: Date.now(),
      // 设置随存档保存（图标开关等偏好跟着玩家走）
      settings: s.settings,
    };
  },

  loadSnapshot: (data) => {
    // 存档迁移：
    //   v1 及更早 —— 没有 era 字段，按远古时代补上
    //   v2 及更早 —— 没有 E2 的牲畜/织物，也没有季节计时，一律补 0
    //   v4 及更早 —— 有独立的「谷物」资源；v5 起谷物并入食物，
    //                迁移时把存档里的 grain **折算进 food**，不让玩家的存粮凭空消失
    const oldVersion = data.version ?? 0;

    // settings 是嵌套对象，且 loadSnapshot 走的是 set({ ...migrated }) 浅合并——
    // 旧存档的 settings 会整体覆盖默认值，并不会逐字段补全。
    // 所以这里必须显式处理 settings，不能指望「{...默认, ...存档}」式的字段兜底。
    let settings: GameSettings;
    if (oldVersion < 4) {
      // 有意的显示偏好迁移（不是 bug）：
      //   · 旧存档没有 theme 字段 → 必须补一个合法默认值，否则 applyTheme(undefined)
      //     会拿到非法值、且刷新后主题与存档错位。
      //   · 旧存档的 showIcons 强制重置为 false：v4 起「默认关闭图案」，若保留旧存的
      //     true，玩家在设置里看到开关是关的、界面却还有图标，会以为改动没生效。
      settings = { showIcons: false, theme: 'dark' };
    } else {
      // v4+：以玩家存档为准，但仍用默认值兜底缺失字段（防脏数据）。
      settings = { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) };
    }

    // 谷物 → 食物 折算（v<5）：这是「资源合并」，不是资源删除，
    // 所以直接相加（1:1）——谷物本就是食物的一种（见 data/resources.ts）。
    //    旧存档的结构里可能有 grain 字段（类型系统已不认它），故按 unknown 取
    const legacyGrain = oldVersion < 5 ? ((data as Record<string, unknown>).grain as number ?? 0) : 0;

    // 旧跃迁映射的**还原**（v<5）：
    //   早期版本的 advanceEra 会把 E1 的「住所」转换成「村落民居」，并把其余建筑清零。
    //   于是这类存档在 E2 里既没有住所（被清零），却又有村落民居（映射产物），
    //   玩家看到的就是"旧的建筑没有了"。
    //   判据：**村落民居存在，但「定居营造」科技尚未研究** ——
    //   村落民居的建造前提正是该科技，所以这些必是映射产物而非玩家所建。
    //   把它们还原成「住所」：K 数值同为 +4，玩家的人口上限不受影响。
    //   ⚠️ 同期被清零的火塘/作坊无数据可考，无法恢复，只能由玩家重建。
    const legacyBuildings = { ...(data.buildings as Record<string, number> | undefined) };
    if (oldVersion < 5 && (legacyBuildings.village_house ?? 0) > 0) {
      const techs = (data.techs ?? {}) as Record<string, boolean>;
      if (!techs['settled_construction']) {
        legacyBuildings.house = (legacyBuildings.house ?? 0) + (legacyBuildings.village_house ?? 0);
        legacyBuildings.village_house = 0;
      }
    }

    const migrated: Partial<GameState> = {
      ...data,
      era: (data.era as EraId | undefined) ?? 'E1',
      food: (data.food ?? 0) + legacyGrain,
      buildings: legacyBuildings as Record<string, number>,
      livestock: data.livestock ?? 0,
      fabric: data.fabric ?? 0,
      eraElapsedSec: data.eraElapsedSec ?? 0,
      version: SAVE_VERSION,
      settings,
    };
    set({ ...migrated, messages: [], running: false });
  },

  resetGame: () => set({ ...initialState(), running: true }),

  advanceEra: () => {
    const s = get();
    const view = engineView(s);

    // 1. 先检查条件，不满足则原样返回 false，不做任何改动
    const check = engine.checkAdvance(view);
    if (!check.ok) return false;

    const currentMeta = ERAS[s.era];
    const nextIndex = currentMeta.index + 1;

    // 2. 若已是最后一个时代，无法继续跃迁
    const nextEraId = (Object.keys(ERAS) as EraId[]).find(id => ERAS[id].index === nextIndex);
    if (!nextEraId) return false;

    const nextMeta = ERAS[nextEraId];

    // 3. 交接规则统一由 game/transition.ts 的纯函数计算
    //
    //    **时代分界线只决定"新增什么内容"，不改动其它任何状态。**
    //
    //    跃迁后玩家带着原样的资源、人口、建筑、岗位分配与研究队列进入新时代；
    //    唯一被初始化的是新时代季节循环的计时起点（新机制从 0 起算）。
    //
    //    历史教训：更早的实现把木石归零、人口硬编码 15；
    //    上一版仍把食物折算成谷物、建筑清零后只映射住宅、岗位清零——
    //    玩家会发现火塘与作坊不见了、分配好的伐木工全部下岗，
    //    「层层递进」的体感被抹平。本版彻底改为"只新增"。
    //    详见 transition.ts 顶部注释。
    //    入参用完整 state 而不是 engineView：engineView 是"引擎只读切片"
    //    （只含引擎计算需要的字段），而跃迁要带着**队列**过河，
    //    所以这里显式构造交接切片。
    const t = computeEraTransition(
      {
        era: s.era,
        eraElapsedSec: s.eraElapsedSec,
        population: s.population,
        populationProgress: s.populationProgress,
        food: s.food,
        wood: s.wood,
        stone: s.stone,
        livestock: s.livestock,
        fabric: s.fabric,
        experience: s.experience,
        buildings: s.buildings,
        jobs: s.jobs,
        queue: s.queue,
        techs: s.techs,
      },
      nextEraId
    );

    set({
      era: t.era,
      eraElapsedSec: t.eraElapsedSec,
      // 下列字段都是 transition 的原样透传（显式列出 = "到底带着什么过河"）
      food: t.food,
      wood: t.wood,
      stone: t.stone,
      livestock: t.livestock,
      fabric: t.fabric,
      experience: t.experience,
      jobs: t.jobs,
      buildings: t.buildings,
      queue: t.queue,
      population: t.population,
      populationProgress: t.populationProgress,
      // 以下字段不经 transition，直接保持原值：
      // techs / researchProgress / stats / settings / fire / autoMaintainFire
    });

    // 5. 发送时代跃迁消息（重要，置顶显示）
    //
    //    先报"进入了哪个时代"，再报时代带来的岗位变化 —— 因果顺序读起来才对。
    get().addMessage(`进入${nextMeta.name}`, 'event', true);

    // 6. 时代入口的**岗位进阶**：进入农耕（定居）时代时，采集者自动专职为农夫
    //
    //    这是"时代分界线只决定新增什么"的例外吗？不是——
    //    岗位进阶**就是新时代带来的内容**之一：新的生产方式让旧职业专职化。
    //    批量转换（而不是逐 tick）是因为这一刻应当是一个**事件**。
    //
    //    ⚠️ 无田地时农夫产出为 0，所以这里必须把话说清楚，
    //    否则玩家会以为"跃迁把我的食物生产搞没了"。
    const afterJobs = get();
    const upAll = engine.applyJobUpgradeAll(engineView(afterJobs));
    if (upAll) {
      set({ jobs: upAll.jobs });
      for (const m of upAll.moved) {
        const fromName = JOBS.find(j => j.id === m.from)?.name ?? m.from;
        const toName = JOBS.find(j => j.id === m.to)?.name ?? m.to;
        get().addMessage(
          `「${fromName}」这一职业随时代取消 —— ${m.count} 人全部转为${toName}`,
          'event',
          true
        );
      }
      // 目的地产出依赖建筑（农夫 ← 田地）时，给出明确警告
      const noField = (get().buildings.field ?? 0) === 0;
      if (noField && upAll.moved.some(m => m.to === 'farmer')) {
        get().addMessage(
          '农夫需要有田地才能耕作 —— 尽快研究「农业」并开垦田地，否则食物会断供',
          'warn',
          true
        );
      }
    }

    // 7. 立即存档，确保跃迁状态持久化
    saveGame();

    return true;
  },
}));

// ─────────────────────────────────────────────
// 派生量辅助（组件里用 selector 调用，避免重复计算）
// ─────────────────────────────────────────────
export function selectView(): engine.E1State {
  return engineView(useStore.getState());
}

export { engine };
