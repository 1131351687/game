# 09 · 性能设计

## 1. 性能预算

| 指标 | 目标 | 上限 |
|---|---|---|
| 首屏加载（JS + CSS） | < 200KB | < 500KB |
| 单 chunk 大小 | < 100KB | < 300KB |
| 内存占用 | < 100MB | < 300MB |
| CPU 占用（主循环） | < 5% | < 15% |
| 帧率（UI 动画） | 60fps | 30fps |
| 操作响应 | < 100ms | < 300ms |
| 存档读取 | < 500ms | < 2s |
| 存档写入 | < 200ms | < 1s |

## 2. 主要性能瓶颈

### 2.1 主循环频率

- 250ms 主循环，每秒 4 次
- 每次主循环需要更新所有派生量 + 渲染部分 UI
- **目标**：单次主循环 < 50ms（CPU 时间）

### 2.2 渲染瓶颈

- 50 个资源、100 个科技、1000 条消息的列表渲染
- 大量 tooltip 触发 popper 重新计算
- 图表每帧更新数据

### 2.3 内存瓶颈

- 消息队列无限增长
- 派生量缓存无限增长
- 存档数据随时间膨胀（事件日志、统计历史）

## 3. 优化策略

### 3.1 代码分割（Code Splitting）

```tsx
// 按 Tab 懒加载
const CivilTab = lazy(() => import('./tabs/CivilTab'));
const SpaceTab = lazy(() => import('./tabs/SpaceTab'));
const GeneTab = lazy(() => import('./tabs/GeneTab'));

// App.tsx
<Suspense fallback={<Loading />}>
  <Routes>
    <Route path="/civil" element={<CivilTab />} />
    <Route path="/space" element={<SpaceTab />} />
    // ...
  </Routes>
</Suspense>
```

**效果**：首屏只加载核心 Tab，其他 Tab 按需加载

### 3.2 虚拟化列表（Virtualization）

```tsx
// 超过 50 项的列表用 react-window
import { FixedSizeList } from 'react-window';

export function ResourceList({ resources }: { resources: ResourceState[] }) {
  if (resources.length < 50) {
    return <NormalList resources={resources} />;
  }
  return (
    <FixedSizeList
      height={600}
      itemCount={resources.length}
      itemSize={60}
    >
      {({ index, style }) => (
        <div style={style}>
          <ResourceCard resource={resources[index]} />
        </div>
      )}
    </FixedSizeList>
  );
}
```

### 3.3 派生量缓存

```ts
// 避免每次 fastLoop 都重算
export function cachedCompute<T>(key: string, compute: () => T, ttl = 200): T {
  const now = performance.now();
  const cached = cache.get(key);
  if (cached && now - cached.timestamp < ttl) {
    return cached.value as T;
  }
  const value = compute();
  cache.set(key, { value, timestamp: now });
  return value;
}

// 用法
const output = cachedCompute(
  `resource_${id}`,
  () => calcOutput(id, state, context),
  250  // 250ms 缓存
);
```

### 3.4 选择器优化（Zustand）

```tsx
// ❌ 错误：订阅整个 state，任何变化都触发重绘
const state = useStore();
const food = state.resources.food;

// ✅ 正确：只订阅需要的字段
const food = useStore(s => s.resources.food);

// ✅ 进阶：用 shallow 比较避免引用变化
const stats = useStore(s => s.stats, shallow);
```

### 3.5 渲染优化

```tsx
// React.memo 避免不必要的重绘
export const ResourceCard = memo(function ResourceCard({ resource }: Props) {
  // ...
});

// useCallback 避免回调函数重建
const handleBuy = useCallback((id: string) => {
  addResource(id);
}, []);

// useMemo 缓存计算结果
const totalOutput = useMemo(() => {
  return resources.reduce((sum, r) => sum + r.outputPerSecond, 0);
}, [resources]);
```

### 3.6 消息队列限制

```ts
// 限制消息队列长度
const MAX_MESSAGES = 500;

class MessageQueue {
  push(msg: Message) {
    this.messages.push(msg);
    if (this.messages.length > MAX_MESSAGES) {
      this.messages = this.messages.slice(-MAX_MESSAGES / 2);
    }
  }
}
```

### 3.7 存档优化

```ts
// 1. 只存必要字段（排除 UI 状态、派生量）
function takeSnapshot(): GameSnapshot {
  const state = useStore.getState();
  return {
    // 排除 messages、queue、cache
    resources: state.resources,
    jobs: state.jobs,
    // ...
  };
}

// 2. 异步写入（IndexedDB 本身就是异步）
async function saveGame(snapshot: GameSnapshot) {
  // 在 Worker 中序列化，不阻塞主线程
  const compressed = await workerSerialize(snapshot);
  await db.saves.put({ id: 'default', compressed });
}

// 3. 定时存档（30 秒一次）+ 关键操作立即存档
```

### 3.8 图表性能

```tsx
// Recharts 性能优化
<LineChart
  data={chartData}
  isAnimationActive={false}  // 关闭动画
  animationDuration={0}
>
  <Line dataKey="value" isAnimationActive={false} />
</LineChart>

// 限制数据点数量
const chartData = useMemo(() => {
  return allData.filter((_, i) => i % Math.ceil(allData.length / 100) === 0);
}, [allData]);
```

### 3.9 主循环优化

```ts
// 1. 不要在主循环中做 DOM 操作
// 2. 批量更新状态（zustand 自动 batch）
// 3. 避免 GC 压力（复用对象，不要每次创建）

let lastTick = 0;
export function fastLoop() {
  const now = performance.now();
  if (now - lastTick < 240) return;  // 防止过度触发
  lastTick = now;

  // 批量更新
  useStore.setState(state => {
    // 就地修改，避免创建新对象
    for (const [id, res] of Object.entries(state.resources)) {
      res.count += res.outputPerSecond * 0.25;
    }
    return { resources: state.resources };  // 返回同一个引用
  });
}
```

## 4. 性能测试方法

### 4.1 开发环境

```bash
# React DevTools Profiler
# Chrome DevTools Performance Tab
# Lighthouse（每版本跑一次）
```

### 4.2 自动化测试

```ts
// vitest 性能测试
import { performance } from 'perf_hooks';

describe('resource engine', () => {
  test('calcOutput should complete in < 1ms', () => {
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      calcOutput('food', state, context);
    }
    const duration = performance.now() - start;
    expect(duration / 1000).toBeLessThan(1);
  });
});
```

### 4.3 压力测试场景

| 场景 | 资源数 | 科技数 | 消息数 | 预期帧率 |
|---|---|---|---|---|
| 新手 | 5 | 5 | 10 | 60fps |
| 中期 | 20 | 50 | 100 | 60fps |
| 后期 | 50 | 200 | 500 | 30fps |
| 终局 | 100+ | 500+ | 1000+ | 30fps |

## 5. 性能监控

### 5.1 运行时监控

```ts
// 性能监控面板（调试模式开启）
export function PerformanceMonitor() {
  if (!useStore.getState().settings.expose) return null;

  return (
    <div className="fixed top-2 right-2 bg-black/80 text-white text-xs p-2 rounded">
      <div>FPS: {fps}</div>
      <div>Tick: {lastTickDuration}ms</div>
      <div>Memory: {performance.memory?.usedJSHeapSize / 1024 / 1024}MB</div>
      <div>Resources: {resourceCount}</div>
      <div>Techs: {techCount}</div>
    </div>
  );
}
```

### 5.2 错误上报

```ts
// 简单的错误上报（可选）
window.addEventListener('error', (e) => {
  console.error('Game error:', e);
  // 可选：上报到错误监控服务
});
```

## 6. 性能检查清单

- [ ] 首屏 JS < 200KB
- [ ] 每个 Tab 懒加载
- [ ] 列表虚拟化（>50 项）
- [ ] 派生量缓存（TTL 250ms）
- [ ] Zustand 选择器优化
- [ ] React.memo / useCallback / useMemo 使用
- [ ] 消息队列限制 500 条
- [ ] 存档异步 + 压缩
- [ ] 图表关闭动画
- [ ] 主循环不操作 DOM
- [ ] Lighthouse 性能分 ≥ 90
- [ ] 压力测试通过

---

*返回 [README](./README.md)*
