// 应用入口：读档 → 结算离线收益 → 启动时钟 → 挂载 React

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { startClock, stopClock, loadGame, saveGame, applyOfflineProgress } from './core/clock/scheduler';
import { useStore } from './state/store';
import { TECH_MAP } from './data/techs';
import { formatTime } from './core/format';
import './styles.css';

const hasSave = loadGame();
const store = useStore.getState();

if (hasSave) {
  // 离线收益：按 50% 效率推进，上限 8 小时
  const offline = applyOfflineProgress();
  if (offline) {
    const names = offline.researches.map(id => TECH_MAP[id]?.name ?? id);
    store.addMessage(
      `离线 ${formatTime(offline.elapsedSec)}（按 50% 效率结算 ${formatTime(offline.effectiveSec)}）`,
      'all',
      true
    );
    if (names.length > 0) {
      store.addMessage(`离线期间完成研究：${names.join('、')}`, 'tech', true);
    }
  }
  store.addMessage('存档已恢复，欢迎回来', 'all');
} else {
  store.addMessage('新游戏开始 —— 先采集食物攒经验，点亮「掌握火」', 'all', true);
}

// 启动
useStore.setState({ running: true, lastActiveAt: Date.now() });
startClock();

// 退出前存档
window.addEventListener('beforeunload', () => {
  stopClock();
  saveGame();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
