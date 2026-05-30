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

## 更新日志

### v0.2.0 — 2026-05-30

#### Bug 修复

- **修复 "No active engine session" 错误**：SW 重启后会话恢复时未注册到内存 Map，导致 `getEngineSession()` 始终返回 `undefined`。现已在 `restoreSession()` 中同步注册。
- **修复会话 tabId 不匹配**：`EXECUTE_PLAN` 和 `STUDENT_ANSWER` 各自独立调用 `resolveActiveTab()`，可能解析到不同标签页。新增 `currentSessionTabId` 绑定机制，确保同一会话内所有操作使用相同 tabId。
- **修复 SW 重启竞态条件**：`reviveSessions()` 是异步的，消息可能在恢复完成前到达。新增 `whenRevived()` 门控，所有消息等恢复完成后再 dispatch。
- **修复 `activeTabId` SW 重启后丢失**：模块级变量重置为 null。现由 `revive.ts` 恢复第一个已恢复的 tabId 到 dispatcher。
- **修复 `setSessionsPort` 竞态**：恢复的会话 `port: null`，事件被静默丢弃。现改为等待恢复完成后再设置端口。
- **修复引擎状态机绕过**：`retry()`、`skip()`、`executeEntry()` 等方法直接赋值 `entry.state` 绕过了状态机验证。现统一使用 `transitionAction()` 进行状态转换。
- **修复 `abort()` 日志源状态错误**：无论从哪个状态调用 abort，日志都记录为 `RUNNING`。现已使用实际源状态。
- **修复 PAUSE `setTimeout` 不可靠**：SW 中 `setTimeout` 可能被 Chrome 终止。对 >25s 的 duration 使用 `chrome.alarms` API。
- **修复 `callApiStreaming` 静默吞掉错误**：SSE 解析错误现在输出 `console.debug` 日志。
- **修复 relay 双重消息路由**：bridge 响应同时 resolve 和 `sendMessage`，可能产生循环。已移除多余的 `sendMessage`。
- **修复 `clearAll` 状态重置不完整**：未清除 `execState` 和 `activeQuestion`。
- **修复 `planId` 唯一性**：添加随机后缀防止快速连续调用时碰撞。
- **修复 `revive.ts` 冗余动态导入**：改为静态导入 `removeSession`。

#### 安全改进

- **API Key 混淆存储**：`chrome.storage.local` 中的 API Key 现使用 XOR+btoa 混淆，防止 DevTools 直接读取。
- **Bridge `postMessage` 使用实际 origin**：不再硬编码 `"*"`，改用 `window.location.origin`。
- **`alarms` 权限**：manifest 新增 `alarms` 权限以支持可靠的 SW 计时。

#### 性能优化

- **React 组件 `memo` 化**：`ChatArea`、`MessageBubble`、`Timeline`、`LogPanel`、`QuestionCard` 均用 `React.memo` 包裹，减少不必要的重渲染。
- **`getStatus()` 单次遍历**：从 3 次 O(n) 扫描优化为单次遍历，同时统计 `currentStep`、`completedSteps`、`failedSteps`、`skippedSteps`。
- **`run()` 逐步 yield**：每步执行后 `await new Promise(setTimeout)` 让出事件循环，防止 SW 线程阻塞触发超时。
- **`retry()` 精准 cursor 重置**：新增 `resetCursorTo(actionId)`，不再全局重置 cursor 到队列开头。
- **API 调用 DRY 重构**：提取 `buildRequestBody()` 和 `fetchWithTimeout()` 共享方法，消除 `callApi` 与 `callApiStreaming` 的代码重复。

#### DSL 校验增强

- `FUNCTION_PLOT` 的 `range` 现验证 `min < max`
- `SLIDER` 现验证 `min < max`、`initial ∈ [min, max]`、`width ∈ [50, 500]`
- `FOCUS_VIEW` 的 `xRange`/`yRange` 现验证 `min < max`
- `validateActionSafe` 和 `validateLessonPlanSafe` 移除了不安全的 `as` 类型断言

#### i18n

- 硬编码中文字符串（SW/CS 层）统一改为英文
- 侧边栏 `store.ts` 中的硬编码中文改用 i18n `t()` 函数
- 新增 `app.open_geogebra`、`sw.*` 等翻译键

#### 测试

- Vitest 环境从 `node` 改为 `jsdom`，支持 React 组件测试
- 包含 `*.test.tsx` 文件
- 移除 `__test__.ts` 排除规则，纳入 Vitest 管理
- 新增 `jsdom` devDependency
- **8 个引擎测试**：skip 流程、abort、序列化/反序列化、restorePendingAction 等

#### 新增功能

- **"打开 GeoGebra" 按钮**：侧边栏顶部新增快捷跳转按钮，一键打开 `geogebra.org/calculator`
- **Channel 重连竞态修复**：断连重连时先收集待重发条目再修改 Map，避免迭代中修改

### v0.2.1 — 2026-05-30

#### 致命 Bug 修复

- **修复 `skipAnswer()` 引擎崩溃**：`handleFailure("Skipped by user")` 尝试 `RUNNING→SKIPPED` 转换，但动作状态机未允许此转换，导致抛异常 `Invalid action transition: RUNNING → SKIPPED`。已在 `state-machine.ts` 中添加该转换。
- **修复 `abort()` 在 READY 状态抛异常**：引擎加载计划但未启动时调用 `abort()`，状态机不允许 `READY→ABORTED`。已在 `state-machine.ts` 中添加该转换。

#### 高优先级修复

- **修复 `GGB_READY` 事件未转发至侧边栏**：`dispatcher.ts` 中 `GGB_READY` handler 仅更新 session store，未调用 `sidepanelPort?.postMessage(msg)`，导致侧边栏从未收到 GeoGebra 就绪事件。现已转发。
- **修复 `getCurrentActionId()` 对 FAILED 动作返回 null**：引擎暂停后「跳过」按钮调用 `engine.skip()` 时无法定位目标动作。现改为先查 RUNNING，再逆序查 FAILED。
- **修复 `executeInverse` 只处理 `DELETE_OBJECT`**：`REMOVE_UI`、`RESTORE_STYLE`、`RESET_VIEW` 等回滚操作被静默忽略。现已全类型处理。
- **修复 SW 重启后 RUNNING 动作永久丢失**：`restoreFromJSON()` 将 cursor 重置为 0，但 RUNNING 状态的条目被 `next()` 跳过。新增 `restorePendingAction()` 方法，将 RUNNING 重置为 PENDING 并回退 cursor。
- **修复 `actionSchema.type` 使用 `z.string()`**：任何字符串都能通过校验。已改为 `z.enum()` 精确枚举 15 种合法动作类型。

#### 中低优先级修复

- **修复 `engine.skip()` 日志固定写 `FAILED`**：`skip()` 方法可对 PENDING/BLOCKED/FAILED 状态调用，但 log 条目中 `fromActionState` 始终为 `FAILED`。现使用实际来源状态。
- **修复 style 参数被忽略**：`FUNCTION_PLOT`、`LINE`、`CIRCLE` 的 `style.thickness` 和 `style.dash` 在 `command-builder.ts` 中未被转换为 `SetThickness()` 和 `SetLineStyle()` 命令。现统一处理。
- **修复直径圆表达式鲁棒性**：`Circle((A+B)/2, A)` 改为 `Circle(Midpoint(A,B), A)`，避免特殊点名导致算术表达式错误。
- **修复 `ANIMATE_STEP` 逆操作类型**：本应返回 `{ type: "NOOP" }`，但错误生成为 `{ type: "DELETE_OBJECT" }`（无 labels，实际为空操作）。
- **修复 `resolveTarget` 缺少穷举检查**：通道 `channel.ts` 的 `resolveTarget` 无 `default` 分支，新增动作类型会静默返回 `undefined` 导致崩溃。现添加 `never` 穷举守卫。
- **移除无意义 try-catch**：`getPort()` 中的 try-catch 永不触发（访问局部变量不可能抛异常）。
- **移除未使用的 `isPausable`**：`state-machine.ts` 中的 `isPausable` 函数导出但从未被引用。
- **Zod 默认值 vs TS 可选类型不一致**：`ExplainParams.format`、`AnimateStepParams.easing` 等 6 个字段在 Zod 中有 `.default()` 但 TS 类型标记为可选。现统一为必填以匹配运行时行为。

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

| 动作 | 完整参数 |
|---|---|
| `FUNCTION_PLOT` | `fn`, `variable`, `range:[min,max]`, `label?`, `style?{thickness?,dash?}`, `color?` |
| `POINT` | `coords?[x,y]`, `intersection?[A,B]`, `onObject?`, `param?`, `expr?`, `label?`, `snap?("none"\|"grid"\|"intersection")`, `color?`, `size?(1-9)` |
| `LINE` | `through?[A,B]`, `slope?`, `expr?`, `relation?("parallel"\|"perpendicular")`, `target?`, `tangent?{at:[x,y]}`, `label?`, `style?`, `color?` |
| `CIRCLE` | `center?`, `radius?`, `throughPoint?`, `diameter?[p1,p2]`, `through?[p1,p2,p3]`, `expr?`, `label?`, `style?`, `color?`, `fillOpacity?` |
| `POLYGON` | `vertices?[A,B,C]`, `coords?[[x,y],...]`, `regular?{n,center,vertex}`, `label?`, `fillOpacity?`, `showEdges?`, `edgeStyle?` |
| `SLIDER` | `name`, `min`, `max`, `step`, `initial?`, `unit?(""\|"°"\|"rad")`, `animate?`, `speed?`, `direction?("inc"\|"dec"\|"oscillate")`, `width?(50-500)`, `position?[x,y]` |
| `DELETE` | `labels:[A,B]` |
| `CLEAR` | `scope:("all"\|"selected")`, `keep?[A,B]` |

### 教学动作（7 种）

| 动作 | 完整参数 |
|---|---|
| `EXPLAIN` | `text`, `format?("plain"\|"markdown"\|"latex")`, `tts?`, `relatedObjects?[A,B]`, `display?("inline"\|"bubble"\|"callout")`, `pointTo?[x,y]` |
| `HIGHLIGHT` | `targets:[A,B]`, `effect:("glow"\|"pulse"\|"color"\|"outline"\|"blink")`, `duration?`, `repeat?`, `color?`, `restore?` |
| `FOCUS_VIEW` | `target:("objects"\|"region"\|"reset"\|"zoom_in"\|"zoom_out")`, `objects?[A,B]`, `xRange?[min,max]`, `yRange?[min,max]`, `padding?`, `animation?` |
| `ANIMATE_STEP` | `animate:"label"`, `from?`, `to?`, `along?`, `duration`, `easing?("linear"\|"ease-in"\|"ease-out"\|"ease-in-out")`, `play?` |
| `PAUSE` | `until:("click"\|"duration"\|"object_click"\|"interaction"\|"ggb_ready")`, `duration?`, `target?`, `hint?` |
| `ASK_OBSERVATION` | `question`, `answerType:("text"\|"choice"\|"number"\|"coords")`, `options?["..."]`, `hint?`, `expectedAnswer?`, `required?`, `storeKey?` |
| `SHOW_RELATION` | `between:[A,B]`, `relation:("intersection"\|"parallel"\|"perpendicular"\|"tangent"\|"equal"\|"congruent"\|"similar"\|"midpoint"\|"bisector")`, `at?[A]`, `measure?`, `style?("text"\|"icon"\|"both")`, `duration?` |

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
- `engine/engine.test.ts` — 引擎核心（skip/abort/serialize/restore）
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
| 持久化 | `chrome.storage.local` (配置 + API Key 混淆), `chrome.storage.session` (引擎会话) |
| 消息机制 | `chrome.runtime.connect` (port), `chrome.tabs.sendMessage`, `window.postMessage` |
| 计时 | `chrome.alarms` (SW 长时 PAUSE), `setTimeout` (短时 PAUSE) |

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

### 会话 tabId 绑定

`EXECUTE_PLAN` 创建会话时将 tabId 绑定到 dispatcher 的 `currentSessionTabId` 变量。后续的 `STUDENT_ANSWER`、`ENGINE_CONTROL` 等操作优先使用该绑定值，而非每次都调用 `resolveActiveTab()` 去猜测当前活跃标签页。这解决了多标签页场景和 SW 重启后的 tabId 不匹配问题。

### SW 恢复门控

`sw.ts` 中的 `whenRevived()` 机制确保所有消息（包括 sidepanel 和 content script 的）都等 `reviveSessions()` 完成后再 dispatch。这消除了 SW 重启后第一条消息到达时 `sessions` Map 仍为空的竞态条件。

### 自动重连

侧边栏的 [`channel.ts`](packages/extension/src/sidepanel/messaging/channel.ts) 在 SW 断开连接时自动重新连接，并将所有待处理请求重新发送至新 port（最多重试 2 次）。重连时先收集待重发条目再修改 Map，避免迭代中修改导致的竞态。

### 引擎持久化

引擎状态通过 `chrome.storage.session` 持久化，在 SW 重启后可恢复。RUNNING 状态降级为 PAUSED，且 `restorePendingAction()` 将队列中 `RUNNING` 的动作重置为 `PENDING`、cursor 回退，确保 `ASK_OBSERVATION`/`PAUSE` 在恢复执行时重新发起。恢复的会话在 `restoreSession()` 中同步注册到内存 Map，确保 `getEngineSession()` 可立即查找。

### 画布上下文压缩

[`StateCompressor`](packages/extension/src/compressor/compressor.ts) 将包含数百个对象的 GeoGebra 画布状态压缩为 ~500 token 的紧凑文本块，通过优先级评分和基于角色的对象排序，使 AI 规划器能够在已有构造的基础上继续构建。

### API Key 混淆

API Key 在 `chrome.storage.local` 中使用 XOR+btoa 混淆存储。虽然 `chrome.storage.local` 本身是扩展隔离的，但混淆防止了通过 DevTools 直接读取明文密钥。
