// Zustand 状态管理 - 游戏核心状态
import { create } from 'zustand';
import { JOB_DEFS } from '../game/engine';

// 资源定义（运行时状态）
export interface ResourceState {
  id: string;
  count: number;
  storage: number;
  unlocked: boolean;
  outputPerSecond: number;
}

// 科技状态
export interface TechState {
  id: string;
  unlocked: boolean;
  level: number;
}

// 设置
export interface Settings {
  locale: string;
  theme: 'dark' | 'light';
  pause: boolean;
  speed: 1 | 2 | 4 | 8;
  expose: boolean;
}

// 统计
export interface Stats {
  startTime: number;
  playTime: number;
  totalFood: number;
  totalResearch: number;
  techsUnlocked: number;
}

// 重置状态
export interface PrestigeState {
  level: number;
  points: number;
}

// 消息
export interface Message {
  id: string;
  text: string;
  category: string;
  timestamp: number;
  important: boolean;
}

export interface GameState {
  running: boolean;

  // 游戏数据
  resources: Record<string, ResourceState>;
  jobs: Record<string, { count: number; unlocked: boolean }>;
  techs: Record<string, TechState>;
  government: { regime: string; military: number };
  prestige: PrestigeState;
  settings: Settings;
  messages: Message[];
  stats: Stats;

  // Actions
  setRunning: (running: boolean) => void;
  unlockResource: (id: string) => void;
  buyResource: (id: string, count: number) => boolean;
  buyResourceMax: (id: string) => number;
  setJobCount: (id: string, count: number) => void;
  unlockTech: (id: string) => boolean;
  changeGovernment: (id: string) => void;
  addMessage: (text: string, category?: string, important?: boolean) => void;
  doPrestige: () => void;
  clearMessages: () => void;
  togglePause: () => void;
  setSpeed: (speed: 1 | 2 | 4 | 8) => void;

  // 初始状态（用于重置）
  initialState: () => Partial<GameState>;
}

// 初始状态工厂
const createInitialState = () => ({
  running: false,
  resources: {
    food: { id: 'food', count: 0, storage: 1000, unlocked: true, outputPerSecond: 0 },
    wood: { id: 'wood', count: 0, storage: 1000, unlocked: true, outputPerSecond: 0 },
    stone: { id: 'stone', count: 0, storage: 1000, unlocked: true, outputPerSecond: 0 },
    manpower: { id: 'manpower', count: 10, storage: 100, unlocked: true, outputPerSecond: 0 },
    research: { id: 'research', count: 0, storage: 1000, unlocked: true, outputPerSecond: 0 },
  },
  jobs: {
    farmer: { count: 0, unlocked: true },
    lumberjack: { count: 0, unlocked: true },
    miner: { count: 0, unlocked: true },
    scientist: { count: 0, unlocked: true },
  },
  techs: {},
  government: { regime: 'none', military: 0 },
  prestige: { level: 0, points: 0 },
  settings: {
    locale: 'zh-CN',
    theme: 'dark' as 'dark' | 'light',
    pause: false,
    speed: 1 as 1 | 2 | 4 | 8,
    expose: false,
  },
  messages: [],
  stats: {
    startTime: Date.now(),
    playTime: 0,
    totalFood: 0,
    totalResearch: 0,
    techsUnlocked: 0,
  },
});

export const useStore = create<GameState>((set, get) => ({
  ...createInitialState(),

  setRunning: (running) => set({ running }),

  unlockResource: (id) => set(state => ({
    resources: {
      ...state.resources,
      [id]: { ...state.resources[id], unlocked: true },
    },
  })),

  buyResource: (id, count) => {
    const state = get();
    const res = state.resources[id];
    if (!res || !res.unlocked) return false;
    if (res.count + count > res.storage) return false;
    set(s => ({
      resources: {
        ...s.resources,
        [id]: { ...s.resources[id], count: s.resources[id].count + count },
      },
    }));
    return true;
  },

  buyResourceMax: (id) => {
    const state = get();
    const res = state.resources[id];
    if (!res || !res.unlocked) return 0;
    const spaceLeft = res.storage - res.count;
    set(s => ({
      resources: {
        ...s.resources,
        [id]: { ...s.resources[id], count: res.count + spaceLeft },
      },
    }));
    return spaceLeft;
  },

  setJobCount: (id, count) => {
    const state = get();
    const manpower = state.resources.manpower.count;
    const inputCost = JOB_DEFS[id as keyof typeof JOB_DEFS]?.inputCost ?? 1;
    // 按岗位人力消耗上限 clamp，防止人力池变负
    const clamped = Math.max(0, Math.min(count, Math.floor(manpower / inputCost)));
    set(s => ({
      jobs: {
        ...s.jobs,
        [id]: { ...s.jobs[id], count: clamped },
      },
      resources: {
        ...s.resources,
        manpower: { ...s.resources.manpower, count: s.resources.manpower.count - (clamped - s.jobs[id].count) },
      },
    }));
  },

  unlockTech: (id) => {
    const state = get();
    if (state.resources.research.count < 100) return false;
    set(s => ({
      resources: {
        ...s.resources,
        research: { ...s.resources.research, count: s.resources.research.count - 100 },
      },
      techs: {
        ...s.techs,
        [id]: { id, unlocked: true, level: 1 },
      },
      stats: { ...s.stats, techsUnlocked: s.stats.techsUnlocked + 1 },
    }));
    get().addMessage(`解锁科技：${id}`, 'achievements', true);
    return true;
  },

  changeGovernment: (id) => set({
    government: { ...get().government, regime: id },
  }),

  addMessage: (text, category = 'all', important = false) => {
    const msg: Message = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      text,
      category,
      timestamp: Date.now(),
      important,
    };
    set(s => ({ messages: [...s.messages.slice(-99), msg] }));
  },

  doPrestige: () => {
    const state = get();
    const points = Math.floor(Math.sqrt(state.stats.totalFood / 1e6));
    if (points <= 0) return;
    set({
      resources: {
        food: { id: 'food', count: 0, storage: 1000, unlocked: true, outputPerSecond: 0 },
        wood: { id: 'wood', count: 0, storage: 1000, unlocked: true, outputPerSecond: 0 },
        stone: { id: 'stone', count: 0, storage: 1000, unlocked: true, outputPerSecond: 0 },
        manpower: { id: 'manpower', count: 10, storage: 100, unlocked: true, outputPerSecond: 0 },
        research: { id: 'research', count: 0, storage: 1000, unlocked: true, outputPerSecond: 0 },
      },
      jobs: {
        farmer: { count: 0, unlocked: true },
        lumberjack: { count: 0, unlocked: true },
        miner: { count: 0, unlocked: true },
        scientist: { count: 0, unlocked: true },
      },
      prestige: {
        level: state.prestige.level + 1,
        points: state.prestige.points + points,
      },
    });
    get().addMessage(`重置！获得 ${points} 点`, 'achievements', true);
  },

  clearMessages: () => set({ messages: [] }),
  togglePause: () => set(s => ({ settings: { ...s.settings, pause: !s.settings.pause } })),
  setSpeed: (speed) => set(s => ({ settings: { ...s.settings, speed } })),

  initialState: () => createInitialState(),
}));
