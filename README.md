# GeoGebra AI Teaching Copilot

AI 驱动的 GeoGebra 教学助手 — Chrome MV3 浏览器扩展。

用户在侧边栏中输入数学教学主题，AI 自动生成结构化的教学步骤序列，并直接在 GeoGebra 画布上执行几何构造、函数绘图等操作，同时通过交互式问答引导学生探索。

### 环境要求

- Node.js 18+
- npm 或 pnpm

### 安装

```bash
git clone https://github.com/zesz-lin/AI-Teaching-Copilot.git
cd AI-Teaching-Copilot
npm install
```

### 构建

```bash
npm run build          # 生产构建 → packages/extension/dist/
```

构建流程:

1. Vite 单独打包 4 个入口 (`sw`, `cs`, `bridge`, `sidepanel`)，均为 IIFE 格式（MV3 不允许 ES 模块共享代码块）
2. PostCSS + Tailwind 处理 CSS
3. 复制 `manifest.json`、`sidepanel.html` 和 `assets/` 至 `dist/`

### 加载扩展

1. 打开 Chrome → `chrome://extensions/`
2. 启用"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `packages/extension/dist/` 目录
5. 打开任意 `*.geogebra.org` 页面，点击扩展图标打开侧边栏

## 架构概览

```
┌──────────────────────────────────────────────────┐
│ Sidepanel (React)                                │
│ 用户界面: 对话 / 时间线 / 日志 / 设置              │
│ ↓ postMessage (chrome.runtime.connect port)      │
├──────────────────────────────────────────────────┤
│ Service Worker (Background)                      │
│ 消息路由 · 引擎会话管理 · 配置持久化               │
│ ↓ chrome.tabs.sendMessage                        │
├──────────────────────────────────────────────────┤
│ Content Script (Isolated World)                   │
│ 消息桥接 · bridge.js 注入                         │
│ ↓ window.postMessage                             │
├──────────────────────────────────────────────────┤
│ Bridge Script (Main World)                        │
│ ggbApplet API 访问 · 命令执行 · 事件监听           │
└──────────────────────────────────────────────────┘
```

四层消息传递：

| 方向 | 路径 | 通道 |
|---|---|---|
| 侧边栏 → SW | sidepanel → sw | `chrome.runtime.connect` (长连接 port) |
| SW → CS | sw → cs | `chrome.tabs.sendMessage` |
| CS → Bridge | cs → window | `window.postMessage` + token 验证 |
| SW → 侧边栏 | sw → sidepanel | port `postMessage` (事件推送) |

消息协议定义在 [`shared/messages.ts`](packages/extension/src/shared/messages.ts)，包含 `CommandPayload`（请求）、`ResponsePayload`（响应）和 `EventPayload`（事件）三种联合类型。

## AI 调用流程

```
用户输入 → Sidepanel 直接调用 AI API (fetch)
         → parsePlannerResponse 解析为 Action[]
         → channel.request(EXECUTE_PLAN) → SW
         → SW 创建 EngineSession → 逐步执行
         → 每步通过 EngineSession 事件推回 Sidepanel
```

AI 调用在**侧边栏**中直接发起（而非 Service Worker），以规避 Chrome 在长时间 API 调用期间杀死 SW 的问题。

## DSL 动作类型（15 种）

### 几何动作（8 种）
| 动作 | 参数 |
|---|---|
| `FUNCTION_PLOT` | fn, variable, range, label, style, color |
| `POINT` | coords / intersection / onObject / expr, label |
| `LINE` | through / slope / expr / tangent, label, style |
| `CIRCLE` | center+radius / throughPoint / diameter, label |
| `POLYGON` | vertices / coords / regular, fillColor |
| `SLIDER` | name, min, max, step, initial, animate |
| `DELETE` | labels[] |
| `CLEAR` | scope (all / selected), keep[] |

### 教学动作（7 种）
| 动作 | 参数 |
|---|---|
| `EXPLAIN` | text, format (plain/markdown/latex) |
| `HIGHLIGHT` | targets[], effect (glow/pulse/blink), duration |
| `FOCUS_VIEW` | target (objects/region/zoom), xRange, yRange |
| `ANIMATE_STEP` | animate (slider), from, to, duration, easing |
| `PAUSE` | until (click/duration/object_click/interaction) |
| `ASK_OBSERVATION` | question, answerType (text/choice/number/coords) |
| `SHOW_RELATION` | between[], relation (intersection/parallel/…) |

完整类型定义见 [`dsl/types.ts`](packages/extension/src/dsl/types.ts)，Zod 校验见 [`dsl/validators.ts`](packages/extension/src/dsl/validators.ts)。

## 执行引擎

[`engine/engine.ts`](packages/extension/src/engine/engine.ts) 中的 `ExecutionEngine` 按顺序执行 `LessonPlan` 中的每个动作：

- **状态机**: IDLE → READY → RUNNING → PAUSED / COMPLETED / ABORTED / FAILED
- **依赖解析**: 动作可以通过 `dependsOn` 声明对其他动作的依赖关系
- **重试**: 失败动作自动重试（最多 3 次）
- **回滚**: `RollbackManager` 支持单步 / 范围 / 全量回滚
- **暂停/恢复**: `ASK_OBSERVATION` 和 `PAUSE` 动作通过 `PendingAnswer` 模式暂停执行，等待学生输入或交互事件后恢复
- **序列化**: 引擎状态可序列化至 `chrome.storage.session`，在 SW 重启后可恢复

## 项目结构

```
AI-Teaching-Copilot/
  package.json              # 项目配置与依赖
  tailwind.config.js        # Tailwind CSS 颜色 tokens
  vitest.config.ts          # Vitest 测试配置
  scripts/
    build.js                # Vite 构建脚本 (4 入口, IIFE)
  config/
    tsconfig.base.json      # TypeScript 严格模式配置
  packages/extension/
    manifest.json            # Chrome MV3 manifest
    assets/icons/            # 扩展图标
    src/
      shared/                # 跨层共享代码
        messages.ts            # 消息协议 + 构建器
        types.ts               # 领域类型
        constants.ts           # 协议常量
        utils.ts               # 工具函数
      dsl/                   # 领域特定语言
        types.ts               # 15 种动作类型定义
        validators.ts          # Zod 校验
        schemas.ts             # JSON Schema 定义
      engine/                # 执行引擎
        engine.ts              # ExecutionEngine 主类
        state-machine.ts       # 状态转换
        transaction.ts         # 事务管理器 (快照/逆操作)
        queue.ts               # 动作队列 + 依赖解析
        rollback.ts            # 回滚管理器
        logger.ts              # 结构化日志
      adapter/               # GeoGebra 适配器
        command-builder.ts     # Action → evalCommand 字符串
        naming.ts              # LabelResolver (AI_ 前缀)
        ggb-adapter.ts         # GgbAdapter (ActionExecutor)
      planner/               # AI 教学规划器
        planner.ts             # TeachingPlanner (API 调用)
        prompt.ts              # 系统提示词 + 用户提示构建
        parser.ts              # AI 响应解析 + DSL 校验
        examples.ts            # Few-shot 示例
        config-store.ts        # 配置持久化 (chrome.storage)
      compressor/            # 画布状态压缩器 (AI 上下文)
        compressor.ts          # StateCompressor
        classifier.ts          # 对象角色分类 + 优先级评分
      service-worker/        # 后台 Service Worker
        sw.ts                  # 入口 (port + cs 消息监听)
        engine-manager.ts      # 引擎会话管理 + SwActionExecutor
        router/dispatcher.ts   # 消息路由 (按 target 分发)
        session/store.ts       # TabSession 持久化
        lifecycle/revive.ts    # SW 重启时恢复会话
      content-script/        # 内容脚本 (ISOLATED world)
        index.ts               # 入口 (注入 bridge + 消息桥接)
        injector.ts            # bridge.js <script> 注入
        relay.ts               # 请求/响应中继 + 超时
      bridge/                # Bridge 脚本 (MAIN world)
        index.ts               # 入口 (ggbApplet 轮询 + 命令处理)
        executor.ts            # evalCommand 执行 + 重试
        listener.ts            # ggbApplet 事件监听
      sidepanel/             # React 侧边栏 UI
        App.tsx                # 主组件
        store.ts               # Zustand 状态管理
        markdown.ts            # Markdown + KaTeX 渲染器
        hooks/useChannel.ts    # 消息通道 React Hook
        messaging/channel.ts   # chrome.runtime port 通道
        components/
          ChatArea.tsx          # 聊天消息列表
          InputBox.tsx          # 输入框 (Enter 发送, Shift+Enter 换行)
          MessageBubble.tsx     # 消息气泡 (用户/AI/系统)
          ControlBar.tsx        # 控制按钮 (停止/继续/跳过/重试/清除)
          SettingsPanel.tsx     # AI API 设置表单 + 测试连接
          Timeline.tsx          # 教学步骤时间线
          LogPanel.tsx          # 执行日志查看器
          QuestionCard.tsx      # 交互问题卡片
        i18n/                  # 国际化 (zh-CN / en)
        styles/index.css       # Tailwind + CSS 变量动画
```

## 开发

### 设置

在侧边栏设置面板中配置：

- **API 端点**: OpenAI 兼容的 `/v1/chat/completions` 端点
- **API Key**: 你的 API 密钥（仅存储在本地浏览器）
- **模型**: 如 `gpt-4o`、`deepseek-chat`、`deepseek-reasoner` 等

支持快速填入 OpenAI、DeepSeek、Ollama 的端点 URL。点击"测试 API 连接"按钮可验证配置是否正确。

### 类型检查

```bash
npm run typecheck       # TypeScript 严格模式检查 (tsc --noEmit)
```

### 测试

```bash
npm test               # 运行所有 Vitest 测试
npm run test:watch     # 监听模式
```

测试文件位置:
- `engine/state-machine.test.ts` — 引擎与动作状态转换
- `engine/queue.test.ts` — 动作队列与依赖解析
- `planner/parser.test.ts` — AI 响应解析
- `compressor/classifier.test.ts` — 画布状态分类与压缩
- `sidepanel/i18n/locales.test.ts` — 翻译键一致性

## 技术栈

| 层 | 技术 |
|---|---|
| UI | React 19, Zustand, Tailwind CSS, KaTeX |
| 类型校验 | TypeScript (strict), Zod |
| 构建 | Vite 5 (IIFE), PostCSS, Autoprefixer |
| 测试 | Vitest |
| 持久化 | `chrome.storage.local` (配置), `chrome.storage.session` (会话) |
| 消息机制 | `chrome.runtime.connect` (port), `chrome.tabs.sendMessage`, `window.postMessage` |

## 消息协议

所有消息遵循 `AppMessage` 封装格式:

```typescript
interface AppMessage {
  id: string;           // 请求/响应匹配 ID
  direction: "request" | "response" | "event";
  source: Layer;        // sidepanel | sw | cs | bridge
  target: Layer;        // sidepanel | sw | cs | bridge
  timestamp: string;
  payload: CommandPayload | ResponsePayload | EventPayload;
}
```

- **CommandPayload**: 侧边栏 → SW/Bridge 的请求（AI_QUERY, EXEC_GGB, GET_STATE, ENGINE_CONTROL 等）
- **ResponsePayload**: SW/Bridge → 侧边栏的响应（OK, ERROR, STATE_DATA, EXEC_RESULT 等）
- **EventPayload**: Bridge/Engine → 侧边栏的推送事件（GGB_READY, ENGINE_STATUS, STEP_EVENT, SHOW_QUESTION 等）

## 关键设计决策

### AI 调用放至侧边栏

原先 AI 调用在 Service Worker 中进行，但 Chrome 会在 SW 持续工作约 5 分钟后杀死它。由于 deepseek-reasoner 等推理模型响应时间较长（2-5 分钟），调用现移至侧边栏（一个持久存在的 Web 页面），解析后的计划通过 `EXECUTE_PLAN` 消息发送给 SW 执行。

### 自动重连

侧边栏的 [`channel.ts`](packages/extension/src/sidepanel/messaging/channel.ts) 在 SW 断开连接时自动重新连接，并将所有待处理请求重新发送至新 port（最多重试 2 次）。

### 引擎持久化

引擎状态通过 `chrome.storage.session` 持久化，在 SW 重启后可恢复。RUNNING 状态降级为 PAUSED，未完成的 `ASK_OBSERVATION` promise 在恢复执行时重新发送给用户。

### 画布上下文压缩

[`StateCompressor`](packages/extension/src/compressor/compressor.ts) 将包含数百个对象的 GeoGebra 画布状态压缩为 ~500 token 的紧凑文本块，通过优先级评分和基于角色的对象排序，使 AI 规划器能够在已有构造的基础上继续构建。
