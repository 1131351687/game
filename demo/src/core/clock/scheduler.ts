// 三级循环调度器
// fastLoop: 250ms - 资源累积、UI 数字刷新
// midLoop: 1s - 事件检查、队列进度
// longLoop: 5s (1 游戏日) - 存档、成就检查

import { useStore } from '../../state/store';
import { updateAllOutputs, tickGame } from '../../game/engine';

const MID_RATIO = 4;   // 1000ms / 250ms
const LONG_RATIO = 20; // 5000ms / 250ms

let loopTick = 0;
let worker: Worker | null = null;

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

  worker.postMessage({ loop: 'start', period: 250 });
}

export function stopClock(): void {
  if (worker) {
    worker.postMessage({ loop: 'clear' });
  }
}

export function execGameLoops(periods = 1): void {
  // 单次最多 1 分钟 catch-up
  const maxCatchUp = LONG_RATIO * 12;
  periods = Math.min(periods, maxCatchUp);

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
  // 250ms：资源累积 + 派生量更新
  const state = useStore.getState();
  if (!state.running) return;

  // 先更新产出派生量
  updateAllOutputs();

  // 再执行资源累积
  tickGame(0.25);
}

export function midLoop(): void {
  // 1s：事件检查（demo 中简化）
}

export function longLoop(): void {
  // 5s：存档 + 统计
  const state = useStore.getState();
  useStore.setState({
    stats: {
      ...state.stats,
      playTime: state.stats.playTime + 5,
    },
  });
  // 定时存档（简化：每次 longLoop 都存）
  saveGame();
}

export function doCallbacks(): void {
  // 每 tick 跑，确保永久结果被存档
}

// 简单的 localStorage 存档（demo 用，正式版用 IndexedDB）
const SAVE_KEY = 'civilis_save';

export function saveGame(): void {
  const state = useStore.getState();
  const snapshot = {
    resources: state.resources,
    techs: state.techs,
    stats: state.stats,
    settings: state.settings,
    prestige: state.prestige,
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
  } catch (e) {
    console.error('Save failed', e);
  }
}

export function loadGame(): boolean {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const snapshot = JSON.parse(raw);
    useStore.setState(snapshot);
    return true;
  } catch (e) {
    console.error('Load failed', e);
    return false;
  }
}

export function clearGame(): void {
  localStorage.removeItem(SAVE_KEY);
  useStore.setState(useStore.getState().initialState);
}
