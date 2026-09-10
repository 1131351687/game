# 06 · UI 设计

## 1. 设计原则

1. **信息密度高**：放置游戏玩家喜欢"看数字"，UI 要紧凑但清晰
2. **可扫读**：玩家能快速定位要操作的目标
3. **响应式**：移动端 + 桌面端都能玩
4. **低打扰**：弹窗/消息不要阻塞操作
5. **可配置**：主题、字体、数字格式可调

## 2. 整体布局

### 2.1 桌面端布局

```
┌────────────────────────────────────────────────────────────────┐
│  Header (资源栏)                                                │
│  🍎 1.2K   🪵 850   🪨 1.5K   👥 45   🔬 320   ⏱ 12:34:56   │
├────────────────────────────────────────────────────────────────┤
│  Tabs (Civil | Civic | Research | Space | Stats | Settings)   │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  主内容区 (主 Tab 内容)                                         │
│                                                                │
│  ┌──────────────┬─────────────────────────────────────┐       │
│  │ 子 Tabs       │  面板内容                             │       │
│  │ Resources     │                                      │       │
│  │ Jobs          │  资源列表 + 购买按钮                  │       │
│  │ Buildings     │  产出/秒 + 存储 + 工具提示            │       │
│  │               │                                      │       │
│  │               │  ┌──────────────────────────────┐   │       │
│  │               │  │ 🍎 Food          +10/s     │   │       │
│  │               │  │ 1.2K / 5K     [Buy 10] [Max]│   │       │
│  │               │  └──────────────────────────────┘   │       │
│  │               │                                      │       │
│  └──────────────┴─────────────────────────────────────┘       │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│  Footer (消息队列 + 控制栏)                                      │
│  [✓] Famine: -50% food for 60s       [Pause] [Speed x2] [Save] │
└────────────────────────────────────────────────────────────────┘
```

### 2.2 移动端布局

```
┌──────────────────────┐
│ 🍎 1.2K ⏱ 12:34:56  │  ← 顶部资源栏（简化）
├──────────────────────┤
│  ┌────┬────┬────┬──┐ │
│  │Civil│Civic│...│⚙│ │  ← 底部 Tab 切换
│  └────┴────┴────┴──┘ │
├──────────────────────┤
│                       │
│  主内容（单列布局）     │
│                       │
├──────────────────────┤
│ [Pause] [x2] [Save]  │  ← 底部固定控制栏
└──────────────────────┘
```

## 3. 主 Tab 列表

| Tab | 内容 | 解锁阶段 |
|---|---|---|
| Civil | 资源 + 岗位 + 城建 | 1 |
| Civic | 政府 + 军事 + 间谍 | 2 |
| Research | 科技树 | 1 |
| Space | 星系图 + 殖民 | 3 |
| Gene | 种族特性 | 3 |
| Stats | 统计 + 图表 | 1 |
| Achieve | 成就墙 | 1 |
| Settings | 设置 | 1 |

## 4. 通用组件

### 4.1 Tooltip

```tsx
// components/Tooltip.tsx
interface TooltipProps {
  content: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  children: ReactNode;
}

export function Tooltip({ content, position = 'top', children }: TooltipProps) {
  return (
    <div className="relative group">
      {children}
      <div className={`
        absolute invisible group-hover:visible
        ${position === 'top' ? 'bottom-full mb-2' : ''}
        bg-gray-900 text-white text-xs px-3 py-2 rounded
        max-w-xs z-50
      `}>
        {content}
      </div>
    </div>
  );
}
```

### 4.2 资源卡片

```tsx
// components/ResourceCard.tsx
interface ResourceCardProps {
  resource: ResourceState;
  output: number;
  storage: number;
  onBuy: (amount: number) => void;
}

export function ResourceCard({ resource, output, storage, onBuy }: ResourceCardProps) {
  return (
    <div className="flex items-center justify-between p-3 bg-gray-800 rounded">
      <div className="flex items-center gap-2">
        <span className="text-2xl">{resource.icon}</span>
        <div>
          <div className="font-bold">{resource.name}</div>
          <div className="text-xs text-gray-400">
            {formatNumber(resource.count)} / {formatNumber(storage)}
            <Tooltip content={`+${formatNumber(output)}/s`}>
              <span className="text-green-400 ml-2">↑</span>
            </Tooltip>
          </div>
        </div>
      </div>
      <div className="flex gap-1">
        <button onClick={() => onBuy(1)} className="px-2 py-1 bg-green-600 rounded">+1</button>
        <button onClick={() => onBuy(10)} className="px-2 py-1 bg-green-600 rounded">+10</button>
        <button onClick={() => onBuy(100)} className="px-2 py-1 bg-green-600 rounded">+100</button>
        <button onClick={() => onBuy('max')} className="px-2 py-1 bg-yellow-600 rounded">Max</button>
      </div>
    </div>
  );
}
```

### 4.3 队列组件

```tsx
// components/Queue.tsx
interface QueueItem {
  id: string;
  name: string;
  progress: number;  // 0-100
  total: number;
  eta: number;       // 剩余时间（秒）
}

export function Queue({ items, onCancel }: { items: QueueItem[]; onCancel: (id: string) => void }) {
  return (
    <div className="space-y-2">
      {items.map(item => (
        <div key={item.id} className="flex items-center gap-2 p-2 bg-gray-800 rounded">
          <div className="flex-1">
            <div className="flex justify-between text-sm">
              <span>{item.name}</span>
              <span className="text-gray-400">{item.progress}/{item.total}</span>
            </div>
            <div className="mt-1 h-2 bg-gray-700 rounded">
              <div
                className="h-full bg-blue-500 rounded transition-all"
                style={{ width: `${(item.progress / item.total) * 100}%` }}
              />
            </div>
            <div className="text-xs text-gray-400 mt-1">ETA: {formatTime(item.eta)}</div>
          </div>
          <button onClick={() => onCancel(item.id)} className="text-red-400 hover:text-red-500">✕</button>
        </div>
      ))}
    </div>
  );
}
```

### 4.4 数字输入框

```tsx
// components/NumberInput.tsx
interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  onMax: () => void;
}

export function NumberInput({ value, onChange, min = 0, max, step = 1, onMax }: NumberInputProps) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(Math.max(min, value - step))}
        className="px-2 py-1 bg-gray-700 rounded hover:bg-gray-600"
      >
        -
      </button>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={e => onChange(Number(e.target.value))}
        className="w-16 px-2 py-1 bg-gray-800 rounded text-center"
      />
      <button
        onClick={() => onChange(Math.min(max || Infinity, value + step))}
        className="px-2 py-1 bg-gray-700 rounded hover:bg-gray-600"
      >
        +
      </button>
      <button onClick={onMax} className="px-2 py-1 bg-yellow-700 rounded hover:bg-yellow-600">
        Max
      </button>
    </div>
  );
}
```

### 4.5 消息日志

```tsx
// components/MessageLog.tsx
export function MessageLog() {
  const messages = useStore(s => s.messages);
  const [filter, setFilter] = useState<MessageCategory>('all');

  const filtered = filter === 'all'
    ? messages
    : messages.filter(m => m.category === filter);

  return (
    <div className="fixed bottom-4 left-4 right-4 max-h-48 overflow-y-auto bg-gray-900/95 rounded p-2">
      <div className="flex gap-1 mb-2 flex-wrap">
        <button onClick={() => setFilter('all')} className={`text-xs px-2 py-0.5 rounded ${filter === 'all' ? 'bg-blue-600' : 'bg-gray-700'}`}>All</button>
        <button onClick={() => setFilter('events')} className={`text-xs px-2 py-0.5 rounded ${filter === 'events' ? 'bg-blue-600' : 'bg-gray-700'}`}>Events</button>
        <button onClick={() => setFilter('major_events')} className={`text-xs px-2 py-0.5 rounded ${filter === 'major_events' ? 'bg-blue-600' : 'bg-gray-700'}`}>Major</button>
        <button onClick={() => setFilter('achievements')} className=`text-xs px-2 py-0.5 rounded ${filter === 'achievements' ? 'bg-blue-600' : 'bg-gray-700'}`}>Achievements</button>
      </div>
      <div className="space-y-1">
        {filtered.slice(-20).map(msg => (
          <div key={msg.id} className={`text-xs p-1 rounded ${msg.important ? 'bg-yellow-900/50 text-yellow-300' : 'text-gray-300'}`}>
            <span className="text-gray-500">{formatTimeAgo(msg.timestamp)}</span>
            {msg.text}
          </div>
        ))}
      </div>
    </div>
  );
}
```

## 5. 主题系统

```css
/* styles/index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --color-bg: #0f172a;
  --color-bg-secondary: #1e293b;
  --color-text: #f1f5f9;
  --color-text-muted: #94a3b8;
  --color-accent: #3b82f6;
  --color-success: #22c55e;
  --color-warning: #eab308;
  --color-danger: #ef4444;
  --font-size-base: 14px;
}

.theme-dark {
  --color-bg: #0a0e1a;
  --color-bg-secondary: #141b2d;
}

.theme-light {
  --color-bg: #f8fafc;
  --color-bg-secondary: #e2e8f0;
  --color-text: #1e293b;
  --color-text-muted: #475569;
}

.font-small { --font-size-base: 12px; }
.font-large { --font-size-base: 16px; }
.font-xlarge { --font-size-base: 18px; }
```

## 6. 交互设计

### 6.1 键盘快捷键

| 按键 | 功能 |
|---|---|
| `1-6` | 切换主 Tab |
| `Space` | 暂停/继续 |
| `+` | 加速 x2 |
| `-` | 减速 |
| `S` | 立即存档 |
| `?` | 帮助 |
| `Esc` | 关闭弹窗 |

### 6.2 鼠标操作

- **悬停**：显示 tooltip（数字 breakdown）
- **左键点击**：执行主操作
- **右键点击**：批量操作菜单（如"Max"、"全部 +10"）
- **滚轮**：滚动内容
- **拖拽**：科技树节点可拖拽移动

### 6.3 移动端适配

- 所有按钮 ≥ 44px 触控面积
- 重要操作固定在底部
- 顶部资源栏简化（只显示关键资源）
- 横屏模式推荐

## 7. 性能考虑

- **虚拟化列表**：超过 50 项的列表用 react-window
- **防抖**：数字输入框输入防抖 300ms
- **节流**：mousemove / scroll 事件节流
- **懒加载**：每个 Tab 用 `React.lazy` 懒加载
- **图片优化**：图标用 SVG（lucide-react），不用 PNG

## 8. 可访问性

- ARIA 标签
- 键盘导航
- 颜色对比度 ≥ 4.5:1
- 减少动画模式（`prefers-reduced-motion`）

## 9. UI 组件库选择

| 选项 | 推荐度 | 说明 |
|---|---|---|
| 自研组件 + Tailwind | ⭐⭐⭐⭐⭐ | 完全可控，体积小 |
| shadcn/ui | ⭐⭐⭐⭐ | 现代、可复制、无运行时依赖 |
| Ant Design | ⭐⭐⭐ | 企业风，可能过重于游戏 |
| Buefy | ⭐⭐ | Bulma 的 Vue 2 封装，维护状态不佳，不建议新项目用 |
| Material UI | ⭐⭐ | 偏企业，游戏场景不太搭 |

**推荐**：shadcn/ui + Tailwind，兼顾现代感与性能。

---

*返回 [README](./README.md)*
