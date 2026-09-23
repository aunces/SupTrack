# Request

主题：SupTrack —— 补剂摄入记录应用的整体分层架构（前端 SPA，纯本地离线，无后端）。

请画一张**分层架构图**，回答的核心问题是：「SupTrack 的代码分为哪几层、每层有哪些模块、层与层之间的依赖与数据流是怎样走的」。

## 背景

SupTrack 是一个 Vite + React 19 + TypeScript 的纯前端单页应用（PWA），运行在浏览器里，**没有任何服务端**。数据全部存在浏览器内置的 IndexedDB 中（通过 Dexie 封装），因此架构的最大特征是「前端即全栈」：UI 层直接往下走到数据层。当前版本 v0.2.0，代码规模 135 个文件（81 个 ts + 53 个 tsx），测试用 Vitest。

技术栈：React 19（函数组件 + Hooks）、TypeScript、Vite 7 构建、Tailwind CSS v4 + Radix UI（shadcn 风格组件）、Dexie 4 + dexie-react-hooks 封装 IndexedDB、Zod 做运行时校验、Zustand 做少量全局状态、react-router-dom 7 用 HashRouter 做路由。PWA 通过 public/sw.js 注册 Service Worker 实现离线可用。

## 需要画出的层次与模块（自上而下 5 层）

**第 1 层 · 应用入口与外壳（bootstrap）**

- `main.tsx`：异步 bootstrap —— 先初始化元数据默认值、写入应用版本号、注册 Service Worker，然后才挂载 React 根节点。这是唯一的启动闸门。
- `App.tsx`：套 ErrorBoundary 的顶层组件，用 `useRoutes` 消费路由表。
- `routes/index.tsx`：路由表，6 个页面挂在 AppShell 布局下（今日 / 补剂 / 停药 / 日历 / 成分库 / 设置）。
- `components/ErrorBoundary`：渲染期异常兜底。

**第 2 层 · 布局与 UI 组件层（presentation）**

- `components/layout/AppShell`：应用骨架。PC 优先 —— 左侧 220px 固定侧栏 + 内容区限宽 720px 居中；窄屏（<860px）侧栏收为顶部下拉。侧栏内含 6 项导航与离线提示条 OfflineBanner。
- 6 个页面（pages）：今日（Today）、补剂（Supplements）、停药（PausePeriods）、日历（Calendar）、成分库（Ingredients）、设置（Settings）。
- 按领域拆分的业务组件：`components/today`（打卡清单、手动录入、备份提醒）、`components/supplement`（补剂与成分关联）、`components/pause`（停药方案）、`components/ingredient`（成分）、`components/backfill`（补录）、`components/common`（空态、错误态、加载骨架、断网条）、`components/ui`（23 个基于 Radix 的基础组件）。
- 该层**不允许直接查数据库**，页面也不允许自己判定业务状态（这是一条写进代码注释的硬规则）。

**第 3 层 · 状态订阅与派生层（hooks + stores）**

- 数据 hook（5 个）：`useTodayData`（今日页清单/分组/统计/预警一次组装）、`useCalendarMonth`（42 格月历）、`usePauseData`、`useSupplementList`、`useIngredientSummary`。
- 这些 hook 只做「取材 → 交给纯函数推导」的数据搬运：通过 `useLiveQuery` 订阅 Dexie，库里数据一变自动重查；业务判定一律不写在 hook 里。
- `stores/dataVersion`（Zustand）：跨标签页一致性计数器。写操作后通过 BroadcastChannel 广播，其它标签页收到后自增版本号，触发 `useLiveQuery` 重新查询。
- `stores/toastStore`：全局轻提示队列。

**第 4 层 · 领域服务与仓储层（service + repository）**

- 服务层（11 个 service）承载全部业务规则与事务边界：`intakeService`（打卡/追加/撤销/改量）、`planService`（计划与节奏）、`pauseService`（停药方案组）、`supplementService`、`ingredientService`、`summaryService`（成分汇总）、`statsService`、`backfillService`（补录）、`importExportService`（导入导出/备份恢复）、`metaService`（元数据）、`stockAdjust`（余量联动的唯一入口）。
- 仓储层（9 个 repository）：`base.ts` 提供表级通用 CRUD（all/get/insert/update/remove/clear），各实体仓储在此基础上扩展专用查询（如 dailyIntakeRepository 的 listByDate / listByDateRange / findActive，supplementIngredientRepository 的 effectiveAt 按日期匹配当时有效配方）。仓储**不含业务规则**，也不判断「能不能删」。
- 校验层（schemas）：8 个 Zod schema 文件，服务层的写入口统一用 `parseOrThrow` 做运行时校验，保证非法数据不落库。
- 服务层写入前必须经过 schema 校验，且一律走 `db.transaction` 事务（例如打卡 = 插入记录 + 扣减余量，两件事必须在同一事务内）。

**第 5 层 · 数据持久化与领域模型（persistence + domain）**

- `db/schema.ts`：Dexie 数据库定义，库名 `suptrack-v12`，一次性建好 8 张表：supplements（补剂）、dosagePlans（用量计划）、dailyIntakes（每日记录）、pausePeriods（停药条目）、pauseSchemes（停药方案组）、meta（元数据）、ingredients（成分）、supplementIngredients（补剂与成分的配方关联，带生效区间）。
- 索引设计支撑核心查询：`[date+supplementId]` 承担「某日某补剂记录」与重复打卡检测，`[date+timeSlot]` 承担日历按日聚取。
- `types/index.ts`：领域模型定义（Supplement / DosagePlan / DailyIntake / PausePeriod / PauseScheme / Ingredient / SupplementIngredient）。
- `constants/`：值域枚举（时段、节奏模式、停药周期模式、记录来源）+ 写死的阈值（补录窗口 7 天、余量偏低 5 天、临期 30 天等）。

**横切层 · 纯函数领域逻辑（utils）**
这是整个架构的「判定核心」，不依赖数据库、不依赖 React，输入即数据，因此可以被单独单元测试：

- `utils/dayState`（★最关键）：四态判定（pending 待服 / taken 已服 / rest 休息 / paused 停用）与日级状态推导。判定优先级严格有序：已服用 > 停用 > 休息 > 待服。今日页与日历页共用这一份判定，所以两者永远不会各说各话。日级状态（完成/部分/漏服/休息/停用/空）也是逐日算出来的，库里不存状态位。
- `utils/rate`：节奏匹配（每日 / 循环 N 吃 M 休）、下次应服日、日均密度。
- `utils/pause`：停药区间与方案组的命中判定、周期进度。
- `utils/stock`：余量预警、预计可用天数。
- `utils/summary`：成分汇总与上限超限判定。
- `utils/calendar`、`date`、`id`、`unit`、`broadcast`、`intakeFactory`。

**支撑设施**

- PWA：`public/sw.js` + Service Worker 注册，离线可用；新版本就绪时不静默刷新，等用户确认后再接管，避免打卡过程被打断。
- 测试：Vitest（node 环境 + fake-indexeddb），`src/test` 覆盖 schema、repository、service 三层。
- 构建：Vite 7，产物按 radix / icons / dexie / react 分包。代码规范由 ESLint + Prettier + Husky + lint-staged 守住。

## 关键关系（必须明确画出方向）

1. 「今日」页面依赖 `useTodayData`，该 hook 依赖 5 个仓储，然后把数据交给 `utils/dayState::resolveDayItems` 推导出 4 态清单；页面只负责渲染，不判状态。
2. 用户点「打卡」→ 页面调用 `intakeService` → 服务层用 Zod 校验 → 在同一个 Dexie 事务里 `dailyIntakeRepository.insert` 写记录 + `stockAdjust` 扣减余量 → 事务提交后 `publishDataChange()` 广播。
3. Dexie 的 liveQuery 让订阅中的 hook 自动重查（同标签页），BroadcastChannel 广播让其它标签页的 `dataVersion` 自增从而也重查（跨标签页）。
4. hooks → services → repositories → Dexie/IndexedDB 是严格单向的向下依赖，不存在反向依赖与跨层跳级（页面不直接碰仓储，仓储不 import 服务）。
5. `utils/*` 是横切层：services 与 hooks 都可以调用它，但它自己只 import types 与 constants，不 import db / React —— 这就是它能被纯函数测试的原因。
6. schemas 与 constants 被 services 与 repositories 复用，作为写入前的守门人。

## 呈现要求

- 呈现逻辑：分层拓扑（谁在谁之上、谁被谁依赖），不是流程图。要能一眼看清 5 层的上下次序。
- 构图：用区域底板强调「层」的归属，依赖箭头自上而下贯穿各层。
- 用不同色系区分各层，重点高亮两个模块：`utils/dayState`（判定核心）与 `db/schema`（8 张表的持久化底座）。
- 每个关键模块请带上它的职责短语（如「四态判定」），而不是只写文件名的光秃秃方框。
- 横切层 utils 与其它层的关系用「被调用」表达，不要让它看起来像最底层。
- 整体配色偏冷静专业的科技蓝，避免高饱和花哨颜色。

# CW

```cw

```
