// E1 远古时代 · 状态管理
// 数值与规则见 design/game/02-tech-eras.md

import { create } from 'zustand';
import { JOBS, type JobId } from '../data/jobs';
import { BUILDINGS, type BuildingId } from '../data/buildings';
import type { EraId } from '../data/era';
import { ERAS } from '../data/era';
import { TECH_MAP } from '../data/techs';
import { INITIAL_STATE, LOOP, E2, E3 } from '../data/constants';
import * as engine from '../game/engine';
import * as engineRecord from '../game/record';
import { isJobRetired } from '../game/reveal';
import { computeEraTransition } from '../game/transition';
import { saveGame } from '../core/clock/scheduler';
import { NEIGHBOR_MAP } from '../game/trade';
import { createRngState, nextRandom, type RngState } from '../core/rng/seeded';
import { simulateStep } from '../game/simulation/simulate';
import type { GameEvent } from '../game/model/events';

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

/** 将规则事件翻译为玩家可读消息；规则层不依赖 UI 文案。 */
function eventMessage(event: GameEvent): { text: string; category: Message['category']; important?: boolean } | null {
  switch (event.type) {
    case 'era.advanced':
      return { text: `进入${ERAS[event.to].name}`, category: 'event', important: true };
    case 'simulation.offline':
      return { text: '离线模拟已完成，资源与随机状态已同步', category: 'all' };
    case 'trade.warning':
      return { text: '贸易告警：请检查商路与书吏配置', category: 'warn', important: true };
    default:
      return null;
  }
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
  /** 随机源状态，随存档保存以保证玩法结果可复现 */
  rng: RngState;
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

  // ── E3 城邦时代资源 ──
  // 研究货币：用户拍板「改名即可」——E3 继续用 experience 字段，显示名变「知识」
  /** 铜：青铜原料之一；仅本地矿藏为铜矿时可开采 */
  copper: number;
  /** 锡：普通地形只能贸易进口；锡矿带可少量本地开采 */
  tin: number;
  /** 青铜：冶炼工以铜+锡炼出 */
  bronze: number;
  /** 青金石：远方贸易品（需「青金石商路」解锁） */
  lapis: number;

  // ── E3 记录系统 ──
  /** 已刻录科技 id（槽位占用 = recorded.length；刻录不可撤销） */
  recorded: string[];
  /** 历史上刻录过的科技 id（供档案库加成计数） */
  recordedOnce: string[];

  // ── E3 贸易系统 ──
  /** 本地矿藏（开局随机，用户拍板：铜矿/锡矿/冲积平原） */
  localOre: 'copper' | 'tin' | 'alluvial';
  /** 已建立的贸易路线 */
  tradeRoutes: engine.TradeRoute[];
  /** 声望 0–100，初始 50 */
  reputation: number;

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

  // 科技
  techs: Record<string, boolean>;

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
  /**
   * 刻录一项已研究的科技到泥板。
   * 不可撤销；调用方应先以 canRecord 校验。返回是否成功。
   * 扣知识 cost×10%，占用一个记录槽位。
   */
  recordTech: (techId: string) => boolean;
  /**
   * 宰杀牲畜换粮。
   * 每头按牲畜世代给 30（世代 ≥3 为 38）食物，受食物储存上限约束。
   * 返回实际宰杀头数（0 = 参数非法或牲畜不足）。
   */
  slaughter: (count: number) => number;
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
  /**
   * 开通/关闭与某邻邦的贸易路线。
   *
   * 不动引擎结算逻辑：仅改 tradeRoutes 切片——
   *   · 已存在该邻邦的路线 → 移除（关闭）
   *   · 不存在 → 按 NEIGHBOR_MAP 定义新增一条（distance/demand/supply 全部从数据定义来，
   *     公式与价格由 trade.ts 在结算时算，不在 store 里重复实现）
   * 青金石路线需 lapis_route 科技；未研究时拒绝开通。
   */
  toggleRoute: (neighborId: string) => void;
  signContract: (neighborId: string) => boolean;
  breachContract: (neighborId: string) => boolean;
}

const SAVE_VERSION = 6;

const initialState = () => ({
  running: false,
  version: SAVE_VERSION,
  rng: createRngState(),
  era: 'E1' as EraId,
  food: INITIAL_STATE.food,
  wood: INITIAL_STATE.wood,
  stone: INITIAL_STATE.stone,
  experience: INITIAL_STATE.experience,
  livestock: 0,
  fabric: 0,
  eraElapsedSec: 0,
  // ── E3 城邦时代 ──
  copper: 0,
  tin: 0,
  bronze: 0,
  lapis: 0,
  recorded: [] as string[],
  recordedOnce: [] as string[],
  localOre: 'alluvial' as 'copper' | 'tin' | 'alluvial',
  tradeRoutes: [] as engine.TradeRoute[],
  reputation: 50,
  population: INITIAL_STATE.population,
  populationProgress: 0,
  fire: INITIAL_STATE.fire,
  autoMaintainFire: true,
  jobs: Object.fromEntries(JOBS.map(j => [j.id, 0])) as Record<string, number>,
  buildings: Object.fromEntries(BUILDINGS.map(b => [b.id, 0])) as Record<string, number>,
  techs: {} as Record<string, boolean>,
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
    copper: s.copper,
    tin: s.tin,
    bronze: s.bronze,
    lapis: s.lapis,
    recorded: s.recorded,
    recordedOnce: s.recordedOnce,
    localOre: s.localOre,
    tradeRoutes: s.tradeRoutes,
    reputation: s.reputation,
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

/**
 * 上一次 doTick 计算出的卡点文案（模块级，不进 zustand state）。
 *
 * 放模块级而非 state 的原因：doTick 每帧调用，若把"上一次文案"存进 state，
 * 每次变化都会触发一次全量重渲染，毫无必要。这里只在"文案变化"或
 * "非空↔空"切换时发消息，频率天然受变化驱动，无需额外节流。
 */
let lastBottleneckText: string | null = null;

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

  recordTech: (techId) => {
    const s = get();
    const view = engineView(s);
    // record.ts 的 recordTech 做纯计算 + canRecord 校验，返回状态切片或 null
    const slice = engineRecord.recordTech(techId, view);
    if (!slice) {
      // 校验失败：把原因报给玩家（canRecord 已给出可读 reason）
      const check = engineRecord.canRecord(techId, view);
      get().addMessage(`刻录失败：${check.reason ?? '未知原因'}`, 'warn');
      return false;
    }
    const def = TECH_MAP[techId];
    set({
      experience: slice.experience,
      recorded: slice.recorded,
      recordedOnce: slice.recordedOnce,
    });
    get().addMessage(`刻录完成：${def.name} 永载泥板`, 'event');
    return true;
  },

  slaughter: (count) => {
    const s = get();
    const n = Math.floor(count);
    if (n <= 0 || s.livestock < n) return 0;

    const view = engineView(s);
    // 牲畜世代 ≥3（犁耕）宰杀产量更高（猪 → 38）
    const perHead =
      engine.aggregateEffects(view).livestockTier >= 3
        ? E2.SLAUGHTER_YIELD_TIER3
        : E2.SLAUGHTER_YIELD;
    const gained = n * perHead;

    // 食物是"活体储备"的兑现：仍受粮仓容量约束（否则屠宰=无限粮仓，破坏"秋天必须攒够"核心循环）
    const cap = engine.getResourceStorage('food', view);
    const food = Math.min(s.food + gained, cap);
    const realGain = food - s.food;

    set({ livestock: s.livestock - n, food });
    get().addMessage(
      realGain > 0
        ? `宰杀 ${n} 头牲畜，获得 ${realGain} 食物`
        : `粮仓已满，宰杀 ${n} 头牲畜换不到存粮`,
      'event',
      realGain <= 0
    );
    return n;
  },

  // ── 主循环 ──
  doTick: (dt) => {
    const s = get();
    if (!s.running) return;

    const step = simulateStep(engineView(s), dt, s.rng);
    const r = step.result;
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
      copper: r.copper,
      tin: r.tin,
      bronze: r.bronze,
      lapis: r.lapis,
      tradeRoutes: r.tradeRoutes,
      reputation: r.reputation,
      rng: step.rng,
    });

    for (const note of r.tradeNotes) {
      const text = '贸易：' + note;
      const messages = get().messages;
      const latest = messages[messages.length - 1];
      if (!latest || latest.text !== text) {
        get().addMessage(text, note.includes('中断') || note.includes('拒') ? 'warn' : 'event');
      }
    }

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

    // ── 卡点提示进消息栏 ──
    // 左栏 HintBar 已显示 getBottleneck 文案；这里同步进右侧消息流，
    // 让"告急"与"危机解除"在消息栏也可见（warning 样式）。
    // 比较状态用模块级 lastBottleneckText（不进 state，避免每帧重渲染）：
    // 仅在"文案变化"或"非空↔空"切换时发消息，天然去抖。
    const bottleneck = engine.getBottleneck(engineView(get()));
    if (bottleneck !== lastBottleneckText) {
      if (bottleneck !== null) {
        get().addMessage(bottleneck, 'warn', true);
      } else if (lastBottleneckText !== null) {
        get().addMessage(`危机解除：${lastBottleneckText}`, 'event');
      }
      lastBottleneckText = bottleneck;
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
      rng: s.rng,
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
      stats: s.stats,
      lastActiveAt: Date.now(),
      // 设置随存档保存（图标开关等偏好跟着玩家走）
      settings: s.settings,
      copper: s.copper,
      tin: s.tin,
      bronze: s.bronze,
      lapis: s.lapis,
      recorded: s.recorded,
      recordedOnce: s.recordedOnce,
      localOre: s.localOre,
      tradeRoutes: s.tradeRoutes,
      reputation: s.reputation,
    };
  },

  loadSnapshot: (data) => {
    // 存档迁移：
    //   v1 及更早 —— 没有 era 字段，按远古时代补上
    //   v2 及更早 —— 没有 E2 的牲畜/织物，也没有季节计时，一律补 0
    //   v4 及更早 —— 有独立的「谷物」资源；v5 起谷物并入食物，
    //                迁移时把存档里的 grain **折算进 food**，不让玩家的存粮凭空消失
    //   v6 起 —— 新增 E3 状态字段（copper/tin/bronze/lapis/recorded/recordedOnce/localOre/tradeRoutes/reputation），一律补默认值
    const oldVersion = data.version ?? 0;
    const savedRng = data.rng as Partial<RngState> | undefined;
    const rng: RngState = {
      seed: savedRng?.seed ?? createRngState().seed,
      cursor: savedRng?.cursor ?? 0,
    };

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
      rng,
      settings,
      copper: data.copper ?? 0,
      tin: data.tin ?? 0,
      bronze: data.bronze ?? 0,
      lapis: data.lapis ?? 0,
      recorded: data.recorded ?? [],
      recordedOnce: data.recordedOnce ?? [],
      localOre: data.localOre ?? 'alluvial',
      tradeRoutes: Array.isArray(data.tradeRoutes)
        ? data.tradeRoutes
            .filter(route => route && typeof route.partnerId === 'string')
            .map(route => ({
              ...route,
              cycleAccum: Number.isFinite(route.cycleAccum) ? route.cycleAccum : 0,
              priceHistory: Array.isArray(route.priceHistory) ? route.priceHistory : [],
              transport: route.transport ?? (route.distance >= 3 ? 'water' : 'land'),
              lastStatus: route.lastStatus,
            }))
        : [],
      reputation: data.reputation ?? 50,
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
    let rng = s.rng;
    const random = (): number => {
      const result = nextRandom(rng);
      rng = result.state;
      return result.value;
    };
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
        techs: s.techs,
        localOre: s.localOre,
      },
      nextEraId,
      random
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
      population: t.population,
      populationProgress: t.populationProgress,
      // 以下字段不经 transition，直接保持原值：
      // techs / stats / settings / fire / autoMaintainFire
      // E3 字段重置（E1→E2 交接时置空；E2→E3 交接由 transition 处理 localOre 等）
      copper: 0,
      tin: 0,
      bronze: 0,
      lapis: 0,
      recorded: [],
      recordedOnce: [],
      localOre: t.localOre,
      rng,
      tradeRoutes: [],
      reputation: 50,
    });

    // 5. 先产生结构化事件，再由消息层翻译（重要，置顶显示）
    //
    //    先报"进入了哪个时代"，再报时代带来的岗位变化 —— 因果顺序读起来才对。
    const eraEvent: GameEvent = { type: 'era.advanced', from: s.era, to: nextEraId };
    const eraMessage = eventMessage(eraEvent);
    if (eraMessage) get().addMessage(eraMessage.text, eraMessage.category, eraMessage.important);

    // 5.5 E3 矿脉公告：本地矿藏决定铜/锡的自给路径（transition 里已随机抽定）。
    //     不公告的话，抽到锡矿带/冲积平原的玩家雇了铜矿工却见不到铜，
    //     只会当成"矿工坏了"来报 bug（2026-09-13 实例）。
    if (nextEraId === 'E3') {
      const oreMsg =
        t.localOre === 'copper'
          ? '本地矿藏：铜矿带 —— 铜矿工可自采铜；锡需贸易进口'
          : t.localOre === 'tin'
            ? '本地矿藏：锡矿带 —— 铜矿工转采锡（半效）；铜需贸易进口'
            : '本地矿藏：冲积平原 —— 无本地金属矿，铜/锡均需贸易进口（矿工岗位不开放）';
      get().addMessage(oreMsg, 'event', true);
    }

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

  toggleRoute: (neighborId) => {
    const s = get();
    const def = NEIGHBOR_MAP[neighborId];
    if (!def) return; // 未知邻邦 id：静默拒绝

    const existing = s.tradeRoutes.find(r => r.partnerId === neighborId);
    if (existing) {
      const nowSec = Date.now() / 1000;
      if (existing.contractUntil !== undefined && existing.contractUntil > nowSec) {
        get().addMessage('关闭失败：请先毁约，不能绕过契约惩罚', 'warn');
        return;
      }
      // 已存在 → 关闭（移除该路线）
      set({ tradeRoutes: s.tradeRoutes.filter(r => r.partnerId !== neighborId) });
      get().addMessage(`关闭与「${def.name}」的贸易路线`, 'event');
      return;
    }

    // 不存在 → 开通。
    // 青金石路线需 lapis_route 科技（与 settleTradeCycle 的 gating 一致）。
    if (def.sell === 'lapis' && !s.techs['lapis_route']) {
      get().addMessage(`开通失败：与「${def.name}」的青金石商路需先研究「青金石商路」`, 'warn');
      return;
    }

    // 新增路线：distance/demand/supply 全部来自数据定义，价格/运力由 trade.ts 结算时算。
    const route: engine.TradeRoute = {
      partnerId: def.id,
      demand: def.accept,
      supply: def.sell,
      distance: def.distance,
      transport: def.transport,
      cycleAccum: 0,
      priceHistory: [],
    };
    set({ tradeRoutes: [...s.tradeRoutes, route] });
    get().addMessage(`开通与「${def.name}」的贸易路线`, 'event');
  },
  signContract: (neighborId) => {
    const s = get();
    const route = s.tradeRoutes.find(r => r.partnerId === neighborId);
    const def = NEIGHBOR_MAP[neighborId];
    if (!route || !def) return false;
    const nowSec = Date.now() / 1000;
    if (route.contractUntil !== undefined && route.contractUntil > nowSec) return false;
    const effects = engine.aggregateEffects(engineView(s));
    const activeContracts = s.tradeRoutes.filter(r => r.contractUntil !== undefined && r.contractUntil > nowSec).length;
    if (activeContracts >= effects.contractSlots) {
      get().addMessage('签约失败：契约槽位已满', 'warn');
      return false;
    }
    const duration = E3.CONTRACT_BASE_SEC * effects.contractDurationMul;
    const routes = s.tradeRoutes.map(r => r.partnerId === neighborId
      ? { ...r, contractUntil: nowSec + duration, breachPenaltyUntil: undefined }
      : r);
    set({ tradeRoutes: routes, reputation: Math.min(100, s.reputation + E3.CONTRACT_REP_GAIN) });
    get().addMessage(`已与「${def.name}」签订锁价契约`, 'event');
    return true;
  },
  breachContract: (neighborId) => {
    const s = get();
    const route = s.tradeRoutes.find(r => r.partnerId === neighborId);
    const def = NEIGHBOR_MAP[neighborId];
    const nowSec = Date.now() / 1000;
    if (!route || !def || route.contractUntil === undefined || route.contractUntil <= nowSec) return false;
    const effects = engine.aggregateEffects(engineView(s));
    const routes = s.tradeRoutes.map(r => r.partnerId === neighborId
      ? { ...r, contractUntil: undefined, breachPenaltyUntil: nowSec + E3.BREACH_PENALTY_SEC }
      : r);
    set({
      tradeRoutes: routes,
      reputation: Math.max(0, s.reputation - Math.round(E3.BREACH_REP_LOSS * effects.contractBreachPenalty)),
    });
    get().addMessage(`已毁约「${def.name}」，该路线短期报价上浮`, 'warn', true);
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
