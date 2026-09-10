// 统一图标渲染 —— 支持「纯文字模式」
//
// 所有显示 emoji 的地方都应通过本组件渲染，这样设置里的
// 「显示图标」开关才能全局生效。
//
// 用法：
//   <Icon emoji="🔥" />
//   <Icon emoji={def.icon} className="text-xl" />
//
// 关闭图标时渲染 null（不占位、不留空隙）。

import { useStore } from '../../state/store';

interface IconProps {
  /** 要显示的 emoji / 符号 */
  emoji: string;
  /** 额外的 Tailwind 类（尺寸、颜色等） */
  className?: string;
  /** 无障碍标签（默认用 emoji 本身） */
  label?: string;
}

export function Icon({ emoji, className, label }: IconProps) {
  const showIcons = useStore(s => s.settings.showIcons);
  if (!showIcons) return null;

  return (
    <span className={className} role="img" aria-label={label ?? emoji}>
      {emoji}
    </span>
  );
}

/** 读取当前是否显示图标（用于需要条件渲染的场合，如布局宽度调整） */
export function useShowIcons(): boolean {
  return useStore(s => s.settings.showIcons);
}
