// 三级循环调度器 + 存档 + 离线收益
// fastLoop : 250ms  资源累积 / 人口 / 火种
// midLoop  : 1s     生产结算
// longLoop : 5s     统计 + 自动存档

import { useStore, type GameState } from '../../state/store';
import { LOOP, OFFLINE } from '../../data/constants';

const MID_RATIO = LOOP.MID_RATIO;   // 4
const LONG_RATIO = LOOP.LONG_RATIO; // 20

let loopTick = 0;
let worker: Worker | null = null;

// ─────────────────────────────────────────────
// 时钟
// ─────────────────────────────────────────────
export function startClock(): void {
  if (worker) return;

  worker = new Worker(new URL('./worker.ts', import.meta.url), {
    type: 'module',
  });

  worker.addEventListener('message', (e: MessageEvent) => {
    if (e.data.loop === 'main') {
      execGameLoops(e.data.periods);
    }
  });

  worker.postMessage({ loop: 'start', period: LOOP.FAST_MS });
}

export function stopClock(): void {
  if (worker) {
    worker.postMessage({ loop: 'clear' });
  }
}

export function execGameLoops(periods = 1): void {
  // 单次最多补 1 分钟，防止长时间挂起后一次性算爆
  const maxCatchUp = LONG_RATIO * 12;
  periods = Math.min(periods, maxCatchUp);

  while (periods--) {
    ++loopTick;
    const doMid = (loopTick % MID_RATIO) === 0;
    const doLong = (loopTick % LONG_RATIO) === 0;

    fastLoop();
    if (doMid) midLoop();
    if (doLong) longLoop();

    if (doMid && doLong) loopTick = 0;
  }
}

export function fastLoop(): void {
  const s = useStore.getState();
  if (!s.running) return;
  s.doTick(LOOP.DT);
}

export function midLoop(): void {
  // 队列推进已在 doTick 内处理；此处保留扩展位
}

export function longLoop(): void {
  const s = useStore.getState();
  s.doLongTick();
  saveGame();
}

// ─────────────────────────────────────────────
// 存档（localStorage + 版本号）
// ─────────────────────────────────────────────
const SAVE_KEY = 'civilis_save';
const SAVE_VERSION = 1;

interface SaveData {
  version: number;
  savedAt: number;
  state: Partial<GameState>;
}

export function saveGame(): void {
  const s = useStore.getState();
  const snapshot: SaveData = {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    state: s.takeSnapshot(),
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
  } catch (e) {
    console.error('[civilis] 存档失败', e);
  }
}

export function loadGame(): boolean {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;

    const data = JSON.parse(raw) as SaveData;
    if (!data.state) return false;

    // 版本迁移位（当前仅 v1，未来在此加 migration）
    const migrated = migrate(data);

    useStore.getState().loadSnapshot(migrated.state);
    return true;
  } catch (e) {
    console.error('[civilis] 读档失败', e);
    return false;
  }
}

function migrate(data: SaveData): SaveData {
  // 目前只有 v1；未来新增字段时在此按版本补默认值
  return data;
}

export function clearGame(): void {
  localStorage.removeItem(SAVE_KEY);
  useStore.getState().resetGame();
}

// ─────────────────────────────────────────────
// 离线收益（T3.2）
// 按 50% 效率推进，上限 8 小时
// ─────────────────────────────────────────────
export interface OfflineResult {
  elapsedSec: number;
  effectiveSec: number;
  researches: string[];
}

export function applyOfflineProgress(): OfflineResult | null {
  const s = useStore.getState();
  const elapsed = (Date.now() - (s.lastActiveAt || Date.now())) / 1000;
  if (elapsed < 60) return null; // 少于 1 分钟不结算

  const capped = Math.min(elapsed, OFFLINE.OFFLINE_CAP_SEC);
  const effective = capped * OFFLINE.OFFLINE_EFFICIENCY;

  // 以 1 秒为步长模拟推进（上限 8 小时 → 最多 14400 步，可接受）
  const step = 1;
  let remaining = effective;
  const researches: string[] = [];

  // 记录研究前状态，便于统计完成了哪些
  const before = { ...s.techs };

  while (remaining > 0) {
    const dt = Math.min(step, remaining);
    useStore.getState().doTick(dt);
    remaining -= dt;
  }

  const after = useStore.getState().techs;
  for (const id of Object.keys(after)) {
    if (after[id] && !before[id]) researches.push(id);
  }

  return { elapsedSec: elapsed, effectiveSec: effective, researches };
}
