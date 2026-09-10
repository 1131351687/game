// Web Worker: 低漂移定时器
// 用 80 样本抖动历史补偿 setTimeout 的累积漂移

const LOOP_N = 80; // 存储 80 个抖动历史样本
let loopInterval: number;
let loopHist: number[];
let loopIdx = 0;
let loopSkew = 0;
let loopTargTs = 0;
let timerId = 0;
let loopRun = false;

self.addEventListener('message', (e: MessageEvent) => {
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

function lowDriftTimer(): void {
  const ts = performance.now();
  const jitter = ts - loopTargTs;
  let periods = 1;

  if (jitter > loopInterval) {
    // 高误差模式：一次跑多个 fastLoop
    periods += Math.floor(jitter / loopInterval);

    // 丢弃相关的抖动历史
    loopSkew -= loopHist[loopIdx];
    loopHist[loopIdx] = 0;

    // 重置基线时间戳
    loopTargTs = ts + loopInterval;
  } else {
    // 正常累积抖动历史
    loopSkew += jitter - loopHist[loopIdx];
    loopHist[loopIdx] = jitter;

    // 沿用现有基线
    loopTargTs += loopInterval;
  }

  // 抵消近期抖动，让 jitter 居中于 0
  const timeout = (loopTargTs - ts) - (loopSkew / LOOP_N);

  if (loopRun) {
    timerId = setTimeout(lowDriftTimer, timeout);
  }

  // 通知主线程
  self.postMessage({ loop: 'main', periods });

  if (++loopIdx === LOOP_N) loopIdx = 0;
}
