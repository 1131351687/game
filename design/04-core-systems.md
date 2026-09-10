# 04 · 核心系统详细设计

## 1. 游戏时钟（core/clock）

### 1.1 设计目标
- 250ms 主循环，允许 catch-up
- Worker 避免浏览器 setTimeout 节流
- 三级循环：250ms / 1s / 5s
- 可暂停、可加速、可切后台

### 1.2 Worker 定时器（worker.ts）

```ts
// 低漂移定时器：用最近 80 次采样的抖动历史补偿下一次触发时刻
const LOOP_N = 80;
let loopInterval: number;
let loopHist: number[];
let loopIdx = 0;
let loopSkew = 0;
let loopTargTs = 0;
let timerId: number;
let loopRun = false;

self.addEventListener('message', (e) => {
  const data = e.data;
  switch (data.loop) {
    case 'start':
      loopInterval = data.period;
      loopHist = new Array(LOOP_N).fill(0);
      loopSkew = 0;
      loopRun = true;
      loopTargTs = performance.now() + loopInterval;
      timerId = setTimeout(lowDriftTimer, loopInterval);
      break;
    case 'clear':
      loopRun = false;
      clearTimeout(timerId);
      break;
  }
});

function lowDriftTimer() {
  const ts = performance.now();
  const jitter = ts - loopTargTs;
  let periods = 1;

  if (jitter > loopInterval) {
    periods += Math.floor(jitter / loopInterval);
    loopSkew -= loopHist[loopIdx];
    loopHist[loopIdx] = 0;
    loopTargTs = ts + loopInterval;
  } else {
    loopSkew += jitter - loopHist[loopIdx];
    loopHist[loopIdx] = jitter;
    loopTargTs += loopInterval;
  }

  const timeout = (loopTargTs - ts) - (loopSkew / LOOP_N);

  if (loopRun) {
    timerId = setTimeout(lowDriftTimer, timeout);
  }

  self.postMessage({ loop: 'main', periods });
  if (++loopIdx === LOOP_N) loopIdx = 0;
}
```

### 1.3 三级循环调度器（scheduler.ts）

```ts
import { useStore } from '../../state/store';

let loopTick = 0;
const MID_RATIO = 4;    // 1s
const LONG_RATIO = 20;  // 5s

export function execGameLoops(periods = 1): void {
  // 单次调用最多 1 分钟 catch-up
  const maxCatchUp = LONG_RATIO * 12;
  periods = Math.min(periods, maxCatchUp);

  const state = useStore.getState();
  if (!state.running) return;

  while (periods--) {
    ++loopTick;
    const doMid = (loopTick % MID_RATIO) === 0;
    const doLong = (loopTick % LONG_RATIO) === 0;

    fastLoop();
    if (doMid) midLoop();
    doCallbacks();
    if (doLong) longLoop();

    // 防溢出
    if (doMid && doLong) loopTick = 0;
  }
}

export function fastLoop(): void {
  // 250ms：资源累积、UI 数字刷新
  // 调用 game/resources/engine.updateAllOutputs()
}

export function midLoop(): void {
  // 1s：事件检查、队列进度、间谍/战争
  // 调用 game/events/engine.checkEvents()
}

export function longLoop(): void {
  // 5s（= 1 游戏日）：季节、存档、成就
  // 调用 core/save.write + game/achieve/checkAchievements
}

export function doCallbacks(): void {
  // 每个 tick 跑，确保永久结果被存档
  // 调用 game/prestige/savePermanentState()
}
```

### 1.4 启动与暂停

```ts
// 启动
export function startClock(): void {
  const worker = new Worker(new URL('./worker.ts', import.meta.url));
  worker.addEventListener('message', (e) => {
    if (e.data.loop === 'main') {
      execGameLoops(e.data.periods);
    }
  });
  worker.postMessage({ loop: 'start', period: 250 });
}

// 暂停
export function stopClock(): void {
  worker.postMessage({ loop: 'clear' });
}
```

### 1.5 时间加速

```ts
// 加速状态：track.t > 0 表示"加速中"
export function accelerateTime(seconds: number): void {
  // 直接调用 execGameLoops(seconds / 0.25) 一次性执行
}
```

## 2. 存档系统（core/save）

### 2.1 数据库定义（db.ts）

```ts
import Dexie, { Table } from 'dexie';

class GameDB extends Dexie {
  saves!: Table<SaveData, string>;
  backups!: Table<BackupData, string>;

  constructor() {
    super('civilis');
    this.version(1).stores({
      saves: 'id, createdAt, updatedAt',
      backups: 'id, createdAt'
    });
  }
}

export const db = new GameDB();

export interface SaveData {
  id: string;             // 'default' 或自定义
  version: number;        // 存档版本号
  createdAt: number;      // 创建时间
  updatedAt: number;      // 最后更新时间
  data: GameSnapshot;     // 游戏状态快照
  compressed: string;     // LZ-String 压缩后的字符串（可选）
}

export interface BackupData {
  id: string;
  createdAt: number;
  data: GameSnapshot;
}
```

### 2.2 版本迁移（migration.ts）

```ts
export interface Migration {
  from: number;
  to: number;
  migrate: (data: any) => any;
}

const migrations: Migration[] = [
  {
    from: 0,
    to: 1,
    migrate: (data) => ({
      ...data,
      // 添加缺失字段
      settings: { ...defaultSettings, ...data.settings },
      version: 1
    })
  },
  {
    from: 1,
    to: 2,
    migrate: (data) => ({
      ...data,
      // v1 → v2：添加新资源字段
      resources: addMissingResources(data.resources),
      version: 2
    })
  }
];

export function migrate(data: any): any {
  let current = data;
  let currentVersion = current.version || 0;

  while (currentVersion < CURRENT_VERSION) {
    const migration = migrations.find(m => m.from === currentVersion);
    if (!migration) {
      throw new Error(`No migration from v${currentVersion} to v${currentVersion + 1}`);
    }
    current = migration.migrate(current);
    currentVersion = migration.to;
  }

  return current;
}
```

### 2.3 序列化（serializer.ts）

```ts
import LZString from 'lz-string';

export function serialize(snapshot: GameSnapshot): string {
  const json = JSON.stringify(snapshot);
  return LZString.compressToUTF16(json);
}

export function deserialize(compressed: string): GameSnapshot {
  const json = LZString.decompressFromUTF16(compressed);
  return JSON.parse(json);
}

// 存档体积预估
export function estimateSize(snapshot: GameSnapshot): number {
  return JSON.stringify(snapshot).length;
}
```

### 2.4 存档操作（index.ts）

```ts
let saveTimer: number | null = null;

export async function saveGame(snapshot: GameSnapshot): Promise<void> {
  const compressed = serialize(snapshot);
  const now = Date.now();

  await db.saves.put({
    id: 'default',
    version: CURRENT_VERSION,
    createdAt: now,
    updatedAt: now,
    data: snapshot,
    compressed
  });
}

export async function loadGame(): Promise<GameSnapshot | null> {
  const save = await db.saves.get('default');
  if (!save) return null;

  const data = deserialize(save.compressed);
  const migrated = migrate(data);
  return migrated;
}

// 定时存档（每 30 秒自动存档一次）
export function setupAutoSave(): void {
  saveTimer = window.setInterval(async () => {
    const snapshot = takeSnapshot();
    await saveGame(snapshot);
  }, 30000);
}

// 立即存档（重要操作后调用）
export async function forceSave(): Promise<void> {
  const snapshot = takeSnapshot();
  await saveGame(snapshot);
}
```

### 2.5 离线收益

```ts
export async function calcOfflineProgress(): Promise<OfflineProgress> {
  const save = await db.saves.get('default');
  if (!save) return { elapsed: 0, rewards: {} };

  const elapsed = Date.now() - save.updatedAt;
  const maxOffline = 8 * 60 * 60 * 1000;  // 最多算 8 小时
  const actualElapsed = Math.min(elapsed, maxOffline);

  if (actualElapsed <= 0) return { elapsed: 0, rewards: {} };

  // 按存档时的产出速率计算
  const rewards = {};
  for (const [id, res] of Object.entries(save.data.resources)) {
    rewards[id] = res.outputPerSecond * (actualElapsed / 1000);
  }

  return { elapsed: actualElapsed, rewards };
}
```

## 3. 随机数（core/rng）

### 3.1 线性同余（lcg.ts）

```ts
// 种子 LCG：乘数 9301 / 增量 49297 / 模 233280，序列可复现
export class LCG {
  private seed: number;

  constructor(seed = 2) {
    this.seed = seed;
  }

  // 0 ~ max
  next(max = 1, min = 0): number {
    const newSeed = (this.seed * 9301 + 49297) % 233280;
    this.seed = newSeed;
    const rnd = newSeed / 233280;
    return min + rnd * (max - min);
  }

  // 整数
  int(min: number, max: number): number {
    return Math.floor(this.next(max - min + 1, min));
  }

  // 选择
  pick<T>(arr: T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  // 洗牌
  shuffle<T>(arr: T[]): T[] {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  // 设置/获取种子（存档用）
  setSeed(seed: number): void { this.seed = seed; }
  getSeed(): number { return this.seed; }
}
```

### 3.2 全局随机器

```ts
// 两个独立种子：游戏种子 + 战争种子，避免战斗随机消费主随机序列
export const rng = new LCG(2);        // 通用随机
export const warRng = new LCG(2);     // 战斗/战争随机

// 存档时保存种子
export function saveSeeds(): { seed: number; warSeed: number } {
  return { seed: rng.getSeed(), warSeed: warRng.getSeed() };
}

export function loadSeeds(seeds: { seed: number; warSeed: number }): void {
  rng.setSeed(seeds.seed);
  warRng.setSeed(seeds.warSeed);
}
```

## 4. 状态管理（state/store.ts）

### 4.1 主 Store

```ts
import { create } from 'zustand';

export interface GameState {
  // 核心状态
  running: boolean;
  seed: number;
  warSeed: number;

  // 游戏数据
  resources: Record<string, ResourceState>;
  jobs: Record<string, JobState>;
  techs: Record<string, TechState>;
  buildings: Record<string, BuildingState>;
  government: GovernmentState;
  space: SpaceState;
  events: EventState;
  season: SeasonState;
  prestige: PrestigeState;
  achievements: AchievementState;

  // UI 状态
  settings: Settings;
  messages: Message[];

  // 统计
  stats: Stats;
}

export const useStore = create<GameState & GameActions>((set, get) => ({
  // 初始状态
  running: false,
  seed: 2,
  warSeed: 2,
  resources: {},
  jobs: {},
  techs: {},
  buildings: {},
  government: { regime: 'none', military: 0 },
  space: { sectors: [], planets: [] },
  events: { current: null, timer: 0 },
  season: { day: 0, season: 'spring' },
  prestige: { level: 0, points: 0 },
  achievements: {},
  settings: defaultSettings,
  messages: [],
  stats: { startTime: Date.now(), playTime: 0 },

  // Actions
  setRunning: (running) => set({ running }),
  addResource: (id, amount) => set(state => ({
    resources: {
      ...state.resources,
      [id]: { ...state.resources[id], count: (state.resources[id]?.count || 0) + amount }
    }
  })),
  // ... 其他 actions
}));
```

### 4.2 派生量缓存（derivations.ts）

```ts
// 派生量缓存：避免每次 fastLoop 都重算
export class Derivations {
  private cache = new Map<string, { value: number; timestamp: number; ttl: number }>();

  get<T>(key: string, compute: () => T, ttl = 100): T {
    const now = performance.now();
    const cached = this.cache.get(key);

    if (cached && now - cached.timestamp < ttl) {
      return cached.value as T;
    }

    const value = compute();
    this.cache.set(key, { value, timestamp: now, ttl });
    return value;
  }

  invalidate(key?: string): void {
    if (key) this.cache.delete(key);
    else this.cache.clear();
  }
}

export const derivations = new Derivations();
```

### 4.3 快照（snapshots.ts）

```ts
export function takeSnapshot(): GameSnapshot {
  const state = useStore.getState();
  return {
    version: CURRENT_VERSION,
    seed: state.seed,
    warSeed: state.warSeed,
    resources: state.resources,
    jobs: state.jobs,
    techs: state.techs,
    buildings: state.buildings,
    government: state.government,
    space: state.space,
    events: state.events,
    season: state.season,
    prestige: state.prestige,
    achievements: state.achievements,
    settings: state.settings,
    stats: state.stats
    // 注意：messages 不入存档（或只保留最近 100 条）
  };
}
```

## 5. 消息队列（core/message）

### 5.1 消息定义

```ts
export type MessageCategory =
  | 'all'
  | 'progress'
  | 'queue'
  | 'research_queue'
  | 'combat'
  | 'spy'
  | 'events'
  | 'major_events'
  | 'minor_events'
  | 'achievements'
  | 'hell';

export interface Message {
  id: string;
  text: string;
  category: MessageCategory;
  timestamp: number;
  duration: number;  // 显示时长（秒）
  important: boolean; // 重要消息不自动消失
}

export const MESSAGE_FILTERS: MessageCategory[] = [
  'all', 'progress', 'queue', 'research_queue', 'combat',
  'spy', 'events', 'major_events', 'minor_events', 'achievements', 'hell'
];
```

### 5.2 消息队列

```ts
class MessageQueue {
  private messages: Message[] = [];
  private listeners = new Set<(msg: Message) => void>();
  private lastId = 0;

  push(text: string, category: MessageCategory, options = {}): void {
    const msg: Message = {
      id: `${++this.lastId}`,
      text,
      category,
      timestamp: Date.now(),
      duration: options.duration || 5,
      important: options.important || false
    };
    this.messages.push(msg);
    this.listeners.forEach(l => l(msg));

    // 限制队列长度（避免内存爆炸）
    if (this.messages.length > 1000) {
      this.messages = this.messages.slice(-500);
    }
  }

  subscribe(listener: (msg: Message) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getMessages(filter: MessageCategory = 'all'): Message[] {
    if (filter === 'all') return this.messages;
    return this.messages.filter(m => m.category === filter);
  }

  clear(): void { this.messages = []; }
}

export const messageQueue = new MessageQueue();
```

## 6. 数字格式化（core/format/number.ts）

```ts
const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
const SCIENTIFIC_THRESHOLD = 12; // 10^12 之后用科学计数法

export function formatNumber(n: number, decimals = 1): string {
  if (n === 0) return '0';
  if (n < 0) return '-' + formatNumber(-n, decimals);

  const magnitude = Math.floor(Math.log10(n));
  const suffixIndex = Math.floor(magnitude / 3);

  if (suffixIndex >= SUFFIXES.length || suffixIndex >= SCIENTIFIC_THRESHOLD) {
    return n.toExponential(decimals);
  }

  const suffix = SUFFIXES[suffixIndex];
  const scaled = n / Math.pow(1000, suffixIndex);
  return `${scaled.toFixed(decimals)} ${suffix}`;
}

export function formatTime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}
```

## 7. 本地化（core/i18n）

```ts
// init.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

export async function initI18n(locale = 'en-US'): Promise<void> {
  await i18n.use(initReactI18next).init({
    resources: await loadResources(locale),
    lng: locale,
    fallbackLng: 'en-US',
    interpolation: {
      escapeValue: false,
      prefix: '%',     // 用 %0 %1 占位符，避开 `{{ }}` 与模板语法冲突
      suffix: ''
    }
  });
}

async function loadResources(locale: string): Promise<any> {
  const defaultStrings = await import(`./locales/en-US.json`);
  if (locale === 'en-US') return { 'en-US': { translation: defaultStrings.default } };

  try {
    const localeStrings = await import(`./locales/${locale}.json`);
    return {
      'en-US': { translation: defaultStrings.default },
      [locale]: { translation: { ...defaultStrings.default, ...localeStrings.default } }
    };
  } catch {
    return { 'en-US': { translation: defaultStrings.default } };
  }
}
```

## 8. 系统协作时序图

```
[启动]
  main.tsx → initI18n → loadGame → calcOfflineProgress → applyRewards → startClock

[运行时]
  Worker tick → execGameLoops → fastLoop → midLoop → longLoop
                ↓                ↓          ↓          ↓
              资源累积        事件触发     季节变化   存档+成就

[用户操作]
  UI click → store action → game action → state 更新 → UI 重绘
            → (可选) forceSave()

[保存退出]
  beforeunload → forceSave → stopClock
```

---

*返回 [README](./README.md)*
