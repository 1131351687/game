// 重置存档 —— 带二次确认，避免误触
//
// 会清空 localStorage 中的存档并刷新页面，从头开始。

import { useState } from 'react';
import { clearGame } from '../../core/clock/scheduler';

export function ResetButton() {
  const [confirming, setConfirming] = useState(false);

  const doReset = (): void => {
    clearGame();
    // 刷新页面，确保所有内存状态（Worker、模块级变量）一并重置
    window.location.reload();
  };

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-red-950 hover:text-red-400"
        title="清空所有进度，从头开始"
      >
        重置存档
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <span className="text-xs text-red-400">重置将清空全部进度，确定？</span>
      <button
        type="button"
        onClick={doReset}
        className="rounded bg-red-800 px-2 py-1 text-xs text-white hover:bg-red-700"
      >
        确认重置
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="inline-flex h-10 items-center justify-center rounded-md px-3 text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-200"
      >
        取消
      </button>
    </span>
  );
}
