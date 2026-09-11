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
}

export const DEFAULT_SETTINGS: GameSettings = {
  showIcons: true,
};

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
  /** 谷物：定居时代的主粮，受粮仓容量**硬限制** */
  grain: number;
  /** 活体牲畜：不占粮仓容量的活体储备，也是畜力来源 */
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

const SAVE_VERSION = 3;

const initialState = () => ({
  running: false,
  version: SAVE_VERSION,
  era: 'E1' as EraId,
  food: INITIAL_STATE.food,
  wood: INITIAL_STATE.wood,
  stone: INITIAL_STATE.stone,
  experience: INITIAL_STATE.experience,
  grain: 0,
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
    grain: s.grain,
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
      const key = res as 'food' | 'wood' | 'stone' | 'grain' | 'livestock' | 'fabric';
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
      grain: r.grain,
      livestock: r.livestock,
      fabric: r.fabric,
      eraElapsedSec: r.eraElapsedSec,
      population: r.population,
      populationProgress: r.populationProgress,
      fire: r.fire,
    });

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

  updateSettings: (patch) => set(s => ({ settings: { ...s.settings, ...patch } })),

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
      grain: s.grain,
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
    //   v2 及更早 —— 没有 E2 的谷物/牲畜/织物，也没有季节计时，一律补 0
    const migrated: Partial<GameState> = {
      ...data,
      era: (data.era as EraId | undefined) ?? 'E1',
      grain: data.grain ?? 0,
      livestock: data.livestock ?? 0,
      fabric: data.fabric ?? 0,
      eraElapsedSec: data.eraElapsedSec ?? 0,
      version: SAVE_VERSION,
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
    //    **跃迁 = 继承 + 降权 + 新增，绝不是清零。**（铁律 3）
    //
    //    旧实现在这里把木材/石头归零、人口硬编码 15，与设计文档
    //    E2-sedentary.md §11.1 直接冲突（文档写明"木材/石头 保留 E1 结余/继承"，
    //    人口 15 是"E1 跃迁条件要求 ≥15"的**下限**而非固定值）。
    //    结果是玩家在 E1 攒的 1000 食物 / 20 人 / 300 木材跃迁后全部蒸发，
    //    「层层递进」的体感被抹平。
    //
    //    现在的规则（详见 transition.ts）：
    //      · 人口   → 继承真实值，不低于 15（文档下限）
    //      · 木材/石头 → **继承结余**
    //      · 食物   → 按 50% 折算为谷物（采集食物易腐，入仓打对折）
    //      · 建筑   → 按等值升级映射继承（住所 K+4 → 村落民居 K+4，保持 K 连续）
    //      · 岗位   → 清零（新时代的岗位体系不同，这是"新动词"的体现）
    //      · 科技/经验 → 保留（文明积累不清零，效果按 eraDecay 自动衰减）
    const t = computeEraTransition(engineView(s), nextEraId);

    set({
      era: t.era,
      food: t.food,
      wood: t.wood,
      stone: t.stone,
      grain: t.grain,
      livestock: t.livestock,
      fabric: t.fabric,
      experience: t.experience,
      eraElapsedSec: t.eraElapsedSec,
      jobs: t.jobs,
      buildings: t.buildings,
      queue: [] as string[],
      population: t.population,
      populationProgress: t.populationProgress,
      // researchProgress 也归零——新队列开头无正在进行的研究
      researchProgress: 0,
      // 以下字段显式保留（与 set patch 合并后等价于不改动）：
      // techs / stats / settings / fire / autoMaintainFire
    });

    // 5. 发送时代跃迁消息（重要，置顶显示）
    get().addMessage(`进入${nextMeta.name}`, 'event', true);

    // 6. 立即存档，确保跃迁状态持久化
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
