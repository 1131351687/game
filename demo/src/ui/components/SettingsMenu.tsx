// 右上角设置面板 —— 图标开关 / 存档（导出·复制·导入）/ 重置存档
//
// 由 App.tsx 渲染在顶部资源条右上角的 absolute 容器里，
// 因此组件根节点用 relative 定位，下拉面板以它为基准向右下展开。

import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore, type GameState } from '../../state/store';
import { clearGame } from '../../core/clock/scheduler';

// ─────────────────────────────────────────────
// 存档编解码
// ─────────────────────────────────────────────

/**
 * 存档 = Base64(JSON)。
 * 必须先 encodeURIComponent 再 btoa：btoa 只接受 Latin-1 字符，
 * 直接把含中文（科技名、消息文案）的 JSON 丢进去会抛 InvalidCharacterError。
 */
function encodeSave(json: string): string {
  return btoa(encodeURIComponent(json));
}

/** encodeSave 的逆运算，用于导入 */
function decodeSave(base64: string): string {
  return decodeURIComponent(atob(base64));
}

/** 面板里的分组小标题 */
function SectionTitle({ children }: { children: string }) {
  return <div className="mb-2 text-xs font-semibold text-gray-400">{children}</div>;
}

export function SettingsMenu() {
  const s = useStore();

  const [open, setOpen] = useState(false);
  /** 导入用的粘贴框内容 */
  const [importText, setImportText] = useState('');
  /** 剪贴板不可用时的兜底：把存档明文显示出来让玩家手动复制 */
  const [manualCopy, setManualCopy] = useState<string | null>(null);
  /** 重置的二次确认 */
  const [confirmingReset, setConfirmingReset] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  /** 关闭面板并清理临时输入，避免下次打开残留脏数据 */
  const closePanel = useCallback((): void => {
    setOpen(false);
    setImportText('');
    setManualCopy(null);
    setConfirmingReset(false);
  }, []);

  // 点击面板外部关闭
  useEffect(() => {
    if (!open) return;

    const onMouseDown = (e: MouseEvent): void => {
      const el = containerRef.current;
      if (!el) return;
      // 事件源不在容器内 → 视为外部点击
      if (e.target instanceof Node && !el.contains(e.target)) {
        closePanel();
      }
    };

    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open, closePanel]);

  // ─────────────────────────────────────────────
  // 存档
  // ─────────────────────────────────────────────

  /** 生成当前存档字符串（Base64） */
  const buildSaveText = (): string => encodeSave(JSON.stringify(s.takeSnapshot()));

  /**
   * 写入剪贴板。非 HTTPS 环境 / 无权限时 navigator.clipboard 会不存在或 reject，
   * 所以这里必须 try/catch 兜底，失败则把文本暴露到只读 textarea。
   */
  const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
        throw new Error('clipboard API 不可用');
      }
      await navigator.clipboard.writeText(text);
      setManualCopy(null);
      s.addMessage('存档已复制到剪贴板', 'event');
      return true;
    } catch {
      // 兜底：显示只读文本框，玩家可手动全选复制
      setManualCopy(text);
      s.addMessage('剪贴板不可用，请手动复制下方文本', 'warn');
      return false;
    }
  };

  /** 导出：复制到剪贴板，同时把文本显示出来方便核对 / 手动保存 */
  const handleExport = (): void => {
    const text = buildSaveText();
    setManualCopy(text);
    void copyToClipboard(text);
  };

  /** 复制：仅写剪贴板（失败时同样会退回文本框） */
  const handleCopy = (): void => {
    void copyToClipboard(buildSaveText());
  };

  /** 导入：解析失败必须明确报错，绝不静默失败 */
  const handleImport = (): void => {
    const raw = importText.trim();
    if (!raw) {
      s.addMessage('请先粘贴存档文本', 'warn');
      return;
    }

    // 兼容两种输入：Base64 存档串，或直接粘贴的 JSON
    let json: string;
    try {
      json = raw.startsWith('{') ? raw : decodeSave(raw);
    } catch {
      s.addMessage('存档格式无效', 'warn');
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      s.addMessage('存档格式无效', 'warn');
      return;
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      s.addMessage('存档格式无效', 'warn');
      return;
    }

    s.loadSnapshot(parsed as Partial<GameState>);
    s.addMessage('存档已导入，正在重新加载…', 'event');
    // 刷新页面，让 Worker 与模块级变量一并回到导入后的状态
    window.location.reload();
  };

  // ─────────────────────────────────────────────
  // 重置（二次确认）
  // ─────────────────────────────────────────────

  const handleReset = (): void => {
    // 第一次点击只进入确认态，不执行任何破坏性操作
    if (!confirmingReset) {
      setConfirmingReset(true);
      return;
    }
    clearGame();
    window.location.reload();
  };

  return (
    <div ref={containerRef} className="relative">
      {/* 齿轮按钮：始终显示，不受「纯文字模式」影响（否则开关自己会消失） */}
      <button
        type="button"
        onClick={() => (open ? closePanel() : setOpen(true))}
        title="设置"
        aria-label="设置"
        aria-expanded={open}
        className="flex h-10 w-10 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-800/50 hover:text-gray-100"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {/* 浮层（popover）：保留 border + shadow-xl（需脱离页面）；其余内容面板一律不保留 */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-md border border-gray-800 bg-gray-800 p-3 shadow-xl">
          <div className="pb-1 text-sm font-semibold text-gray-100">设置</div>

          {/* ① 图标显示开关 */}
            <div className="mt-2 border-t border-gray-800 pt-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-400">
              <input
                type="checkbox"
                checked={s.settings.showIcons}
                onChange={() => s.toggleIcons()}
                className="h-4 w-4 cursor-pointer accent-accent"
              />
              <span>显示图标（emoji）</span>
            </label>
            <p className="mt-1 text-xs leading-relaxed text-gray-400">
              勾选后在界面中显示 emoji 图标；取消勾选进入「纯文字模式」，界面更素净。
            </p>
          </div>

          {/* ② 主题（日间 / 夜间） */}
          <div className="mt-2 border-t border-gray-700 pt-3">
            <div className="text-sm text-gray-400">主题</div>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => s.updateSettings({ theme: 'light' })}
                className={`flex h-10 flex-1 items-center justify-center rounded-md text-sm transition-colors ${
                  s.settings.theme === 'light'
                    ? 'bg-accent text-white'
                    : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-100'
                }`}
              >
                日间
              </button>
              <button
                type="button"
                onClick={() => s.updateSettings({ theme: 'dark' })}
                className={`flex h-10 flex-1 items-center justify-center rounded-md text-sm transition-colors ${
                  s.settings.theme === 'dark'
                    ? 'bg-accent text-white'
                    : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-100'
                }`}
              >
                夜间
              </button>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-gray-400">
              日间适合明亮环境；夜间为默认深色护眼模式。设置会随存档保存。
            </p>
          </div>

          {/* ③ 存档 */}
          <div className="mt-3 border-t border-gray-700 pt-3">
            <SectionTitle>存档</SectionTitle>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleExport}
                className="h-10 flex-1 rounded-md text-gray-400 px-2 text-xs transition-colors hover:bg-gray-800/50 hover:text-gray-100"
              >
                导出
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="h-10 flex-1 rounded-md text-gray-400 px-2 text-xs transition-colors hover:bg-gray-800/50 hover:text-gray-100"
              >
                复制
              </button>
              <button
                type="button"
                onClick={handleImport}
                className="h-10 flex-1 rounded-md bg-accent px-2 text-xs text-white transition-colors hover:bg-accent/80"
              >
                导入
              </button>
            </div>

            {/* 剪贴板失败时的兜底文本框 */}
            {manualCopy !== null && (
              <textarea
                readOnly
                value={manualCopy}
                onFocus={(e) => e.currentTarget.select()}
                rows={3}
                className="mt-2 w-full resize-none rounded border border-gray-600 bg-gray-900 p-1 font-mono text-[10px] leading-tight text-gray-100"
              />
            )}

            {/* 导入用的粘贴框 */}
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="在此粘贴存档文本后点「导入」"
              rows={3}
              className="mt-2 w-full resize-none rounded border border-gray-600 bg-gray-900 p-1 font-mono text-[10px] leading-tight text-gray-400 placeholder:text-gray-600"
            />
            <p className="mt-1 text-xs leading-relaxed text-gray-400">
              存档以 Base64 编码，可跨设备迁移；导入后页面会自动刷新。
            </p>
          </div>

          {/* ④ 重置存档（红色警示 + 二次确认） */}
          <div className="mt-3 border-t border-gray-700 pt-3">
            <SectionTitle>重置存档</SectionTitle>
            {!confirmingReset ? (
              <button
                type="button"
                onClick={handleReset}
                className="h-10 rounded-md bg-danger px-3 text-xs text-white transition-colors hover:bg-danger/80"
              >
                重置
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-danger">将清空全部进度，确定？</span>
                <button
                  type="button"
                  onClick={handleReset}
                  className="h-10 rounded-md bg-danger px-3 text-xs text-white transition-colors hover:bg-danger/80"
                >
                  确认重置
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingReset(false)}
                  className="h-10 rounded-md px-3 text-xs text-gray-400 transition-colors hover:bg-gray-800/50 hover:text-gray-100"
                >
                  取消
                </button>
              </div>
            )}
            <p className="mt-1 text-xs leading-relaxed text-gray-400">
              清空 localStorage 中的存档并从头开始，此操作不可撤销。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
