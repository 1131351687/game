# 04 · 核心系统设计

本章定义时钟、模拟、随机数和存档之间的边界。核心原则是：时钟提供时间，模拟消费时间，存档保存快照，UI 展示结果。

## 1. 游戏时钟

### 1.1 职责

core/clock 只负责：

- 在 Worker 中产生稳定的时间通知；
- 计算本次经过的秒数；
- 在页面恢复时报告一段 elapsed time；
- 启停和暂停。

它不负责研究、贸易、人口或存档。

    export interface ClockListener {
      onElapsed(elapsedSec: number): void;
    }

### 1.2 Worker 与主线程

Worker 可以继续使用 250ms 的低漂移定时器，但消息应表达“经过了多少时间”，而不是要求主线程执行某个业务循环：

    self.postMessage({ type: 'elapsed', elapsedSec });

主线程收到消息后调用 simulation.advanceBy(elapsedSec)。Worker 不导入 Store，也不依赖游戏代码。

### 1.3 补算限制

    const MAX_CATCH_UP_SEC = 60;
    const MAX_STEP_SEC = 0.25;

页面长时间挂起时最多补算 60 秒；更长时间通过离线收益规则结算。这样既避免一次循环卡死，也避免无限积累状态变化。

## 2. 统一模拟入口

    export interface SimulateOptions {
      elapsedSec: number;
      mode: 'online' | 'offline' | 'test';
      efficiency?: number;
      maxStepSec?: number;
    }

    export interface SimulationResult {
      state: GameState;
      events: GameEvent[];
    }

    export function simulate(
      initial: GameState,
      options: SimulateOptions,
      services: SimulationServices,
    ): SimulationResult;

在线游戏、时间加速、离线收益和自动试玩都调用这个入口。离线模式可以设置 efficiency: 0.5，但不能另写一套资源和人口规则。

每一个 step 的结算顺序必须固定并写在代码中：

    输入与派生效果
      → 生产与消耗
      → 人口与岗位
      → 建筑/科技队列
      → 贸易与周期系统
      → 时代/事件检查
      → 资源上限与状态规范化

如果某个系统必须每 1 秒或每 5 秒运行，应使用自己的时间累积器，而不是依赖全局 loopTick % ratio。

## 3. 随机数

所有可影响存档结果的随机行为都使用注入的随机源：

    export interface RandomSource {
      next(): number;
      int(min: number, max: number): number;
      pick<T>(items: readonly T[]): T;
    }

    export interface RngState {
      seed: number;
      cursor: number;
    }

随机源状态属于 GameState 或 Snapshot，存档时一并保存。测试可以使用固定 seed，复现贸易、矿藏、事件和时代跃迁。

禁止在玩法层直接调用 Math.random。如果某个随机结果不需要存档可复现，也必须在注释中说明原因，例如纯 UI 装饰动画。

## 4. 存档系统

### 4.1 Repository 接口

当前 demo 可以使用 localStorage，但通过接口隔离实现：

    export interface SaveRepository {
      load(slot: string): Promise<RawSave | null>;
      save(slot: string, save: RawSave): Promise<void>;
      clear(slot: string): Promise<void>;
    }

未来需要多存档、备份或更大的内容时，可以替换为 IndexedDB，不需要修改 game 层。

### 4.2 Snapshot 与运行时状态分离

Snapshot 只保存玩家进度，不保存 Worker、React 状态、临时消息或缓存：

    export interface SaveEnvelope {
      schemaVersion: number;
      savedAt: number;
      state: GameSnapshot;
    }

不应把整个 Zustand store 直接 JSON.stringify。应由 toSnapshot(state) 明确选择字段。

### 4.3 读取流程

    读取原始文本
      → JSON 解析
      → 顶层结构校验
      → 按版本逐步迁移
      → 数值与枚举规范化
      → 转为当前 GameState
      → 失败则保留旧档并使用新游戏

迁移函数必须返回新对象，不修改输入；未知高版本存档不能强行读取，应提示玩家使用更新版本。

### 4.4 自动存档

自动存档属于应用适配层，不属于游戏规则。建议在以下时机存档：

- 每 30 秒；
- 时代跃迁、重置等不可逆操作之后；
- 页面隐藏或关闭前尽力保存；
- 玩家手动导出时。

写入失败应记录错误并保留内存中的状态，不得中断游戏模拟。

## 5. 离线收益

保存 lastActiveAt，启动时计算：

    const elapsed = Math.max(0, now - lastActiveAt);
    const capped = Math.min(elapsed, OFFLINE_CAP_SEC);
    const effective = capped * OFFLINE_EFFICIENCY;

随后将 effective 传给统一 simulate。离线结算需要限制最大离线时长、最大模拟 step 数、单次事件数量，以及数值上限和异常值修复。

离线结果应返回摘要事件，例如完成了哪些科技、获得了多少资源，而不是直接向 UI 写消息。

## 6. 消息与本地化

游戏层生成结构化事件：

    { type: 'tech.completed', techId: 'writing' }

UI presenter 将其转换为当前语言的消息：

    presentEvent(event, locale)

这样模拟器、日志、成就统计和 UI 可以分别消费同一事件。

## 7. 测试要求

### 单元测试

- 固定 RNG 下贸易和跃迁结果可复现；
- 资源不会低于 0 或超过容量；
- 时间步长变化不会破坏核心守恒关系；
- 无效命令返回明确 reason；
- 存档迁移覆盖每个历史版本。

### 集成测试

- E1 → E2 → E3 的完整跃迁；
- 在线模拟与离线模拟使用同一套规则；
- 研究、建造、贸易和人口同时运行时状态不互相破坏；
- 导出、清空、导入存档流程。

### 回归测试

自动试玩应固定 seed，并保存关键里程碑：达到门槛的时间、最终资源、科技数量和是否发生饥荒。数值调整时可以明确看到行为变化。

---

*返回 [README](./README.md)*
