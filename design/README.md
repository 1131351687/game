# 放置 + 文明进化游戏 · 详细设计方案

> 这是一份面向当前实现的**设计与渐进式演进方案**，目标是做一个纯前端、放置 + 文明进化类游戏。
>
> 文档共 11 份，按编号顺序阅读即可。**核心设计**：三级循环时钟 + 种子随机 + 多级重置 + 阶段化解锁。

---

## 文档索引

| # | 文档 | 内容 |
|---|---|---|
| 01 | [01-overview.md](./01-overview.md) | 项目定位、目标、成功标准、关键设计取舍 |
| 02 | [02-tech-stack.md](./02-tech-stack.md) | 技术栈选型与理由 |
| 03 | [03-architecture.md](./03-architecture.md) | 四层分层架构、目录结构、模块边界 |
| 04 | [04-core-systems.md](./04-core-systems.md) | 时钟、存档、随机数、状态、消息、本地化 |
| 05 | [05-game-systems.md](./05-game-systems.md) | 资源、岗位、科技、政府、太空、重置、成就 等子系统详细设计 |
| 06 | [06-ui-design.md](./06-ui-design.md) | UI 组件、Tabs、布局、交互、主题 |
| 07 | [07-content-design.md](./07-content-design.md) | 内容框架、数值曲线、事件表、阶段划分 |
| 08 | [08-data-schema.md](./08-data-schema.md) | 数据 Schema（资源/科技/事件/存档结构） |
| 09 | [09-performance.md](./09-performance.md) | 性能预算、优化策略、测试方法 |
| 10 | [10-roadmap.md](./10-roadmap.md) | 8 周开发路线图、里程碑、风险清单 |
| 11 | [11-appendix.md](./11-appendix.md) | 数值平衡表模板、存档迁移示例、API 模板、参考清单 |

---

## 阅读建议

- **只关心架构**：读 01 → 02 → 03 → 04
- **只关心玩法内容**：读 01 → 05 → 07
- **只关心数值平衡**：读 07 → 08 → 11
- **准备动手开发**：按 01 → 11 顺序读完，然后直接看 11-appendix 里的代码模板

---

## 一句话方案

**玩法骨架：Worker 提供 elapsed time，统一模拟入口驱动在线、加速和离线收益；随机源可复现；GameState 与 GameEvent 组成纯模拟核心；Zustand 作为 UI 适配器；存档通过 Repository 与迁移链隔离。技术栈：Vite + React 18 + Zustand + TypeScript + Tailwind。当前使用 localStorage，未来按存档体积和多存档需求再切换 IndexedDB。**

---

*最后更新：2026-09-09*
