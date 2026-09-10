// 应用入口：React 挂载 + 启动时钟 + 加载存档
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { startClock, stopClock, loadGame } from './core/clock/scheduler';
import { useStore } from './state/store';
import './styles.css';

// 启动时加载存档（有存档则恢复，否则新游戏）
const hasSave = loadGame();
const store = useStore.getState();
store.addMessage(hasSave ? '存档已恢复，欢迎回来！' : '新游戏开始！', 'all', true);

// 启动游戏时钟
useStore.setState({ running: true });
startClock();

// 退出前保存 + 停止时钟
window.addEventListener('beforeunload', () => {
  stopClock();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
