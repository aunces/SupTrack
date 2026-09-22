# SupTrack 实施指导书 · AI 执行版

> **本文档是施工图，不是需求文档。** 它把《v12.0-需求重梳理.md（v12.2）》与《原型线框-v12.2.html》翻译成 AI 编码代理可以直接执行的施工指令：文件路径、函数签名、算法伪码、任务顺序、验收命令。
>
> | 项       | 内容                                                                            |
> | -------- | ------------------------------------------------------------------------------- |
> | 版本     | **v1.0**                                                                        |
> | 日期     | 2026-09-20                                                                      |
> | 上游基线 | `v12.0-需求重梳理.md`（v12.2，需求基线）+ `原型线框-v12.2.html`（低保真结构稿） |
> | 目标     | **一次完成 M1 + M2 + M3**，交付可替换现有应用的成品                             |
> | 执行者   | AI 编码代理（无人值守模式，除 §14 列出的 5 种情况外不停下提问）                 |

---

## 0. 怎么用这份文档

### 0.1 权威优先级

出现冲突时，按此顺序裁决，**不要自己发明第四种解释**：

```
1. 本文档 §3 红线 与 §5 算法规格   ← 最高（含歧义消解与技术细节）
2. 本文档其余章节
3. v12.0-需求重梳理.md（v12.2）
4. 原型线框-v12.2.html
5. 现有代码的既有写法
```

### 0.2 执行模式

| 项     | 规则                                                                                                        |
| ------ | ----------------------------------------------------------------------------------------------------------- |
| 顺序   | **严格串行 M1 → M2 → M3**。M1 未通过 §13.3 验收，不得开始 M2                                                |
| 粒度   | 每个任务（T-xxx）**一个 commit**，任务内可多次提交但必须原子可用                                            |
| 中断点 | 每个里程碑结束时停下，输出完成报告（§15.3 模板），等用户确认再进下一个                                      |
| 提问   | 除 §14.3 列出的 5 种情况外，**不要停下来提问**。遇到未定义的细节，按 §14 规则自行决定并在完成报告中记录     |
| 禁止   | 不得修改 `v12.0-需求重梳理.md`、`原型线框-v12.2.html`；不得修改 `v10.1.md`、`REQUIREMENTS.md`；不得新增需求 |

### 0.3 读这份文档的正确姿势

- §3 红线：**开工前通读一遍**，尤其是 R-01 ~ R-16，每条都对应一次范围蔓延事故。
- §4 技术基线 + §5 数据模型：**动手前先落地**，这是所有后续任务的地基。
- §6 算法规格：**先写测试再写实现**。这五个纯函数是整个应用的逻辑核心。
- §9 / §10 / §11 任务清单：按编号顺序执行，不跳号。
- §13 验收手册：每个里程碑结束时**逐条执行**，不要凭感觉判断"应该可以了"。

---

## 1. 任务全景

### 1.1 一句话目标

**打开应用，5 秒内看到今天该吃什么、哪个不用吃、为什么不用吃、下次什么时候吃。**

### 1.2 三个里程碑

| 里程碑            | 交付内容                                                                  | 完成定义（DoD）                                                                           |
| ----------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **M1 核心闭环**   | 今日页四态清单 + 打卡/撤销 + 补剂页（含节奏）+ 临时停药 + 本地存储 + 离线 | 建 3 个补剂（其中一个隔天吃）→ 今日页正确显示今天吃什么 → 打勾 → **第二天打开答案仍正确** |
| **M2 回看与补录** | 日历（日级状态可辨）+ 补录（窗口 7 天）+ 停药方案组 + 漏服自动推导        | 翻回上周，能一眼看出哪天漏了、哪天在停药                                                  |
| **M3 增值**       | 成分库 + 每日成分汇总 + 余量/过期提醒 + 备份提醒                          | 去掉任意一项，M1 / M2 功能不受影响                                                        |

### 1.3 执行顺序图

```
清场删除 ──▶ 数据层重构 ──▶ 纯函数算法 ──▶ 仓储/服务层 ──▶ 页面重写 ──▶ M1 验收
  T-101        T-102~106       T-107~112       T-113~120     T-121~125    §13.3
                                                              │
                    ┌─────────────────────────────────────────┘
                    ▼
              日历+补录+方案组 ──▶ M2 验收 ──▶ 成分库+汇总+提醒 ──▶ M3 验收
               T-201~212           §13.3        T-301~312          §13.3
```

### 1.4 总量预期

| 里程碑 | 任务数 | 净新增/重写文件 | 说明                                 |
| ------ | ------ | --------------- | ------------------------------------ |
| M1     | 25     | ≈ 35 个         | 数据层与主链页面全部重写，最大的一块 |
| M2     | 12     | ≈ 12 个         | 复用 M1 的算法与组件模式，增量为主   |
| M3     | 12     | ≈ 10 个         | 成分模块可直接参考现有实现           |

---

## 2. 从需求到施工的映射

一张表看懂"需求文档的哪一段，落到哪个文件"。

| 需求条款                            | 施工落点                                               | 任务号                |
| ----------------------------------- | ------------------------------------------------------ | --------------------- |
| §4.1 三个概念（补剂 / 计划 / 停药） | `src/types/index.ts` 三个接口                          | T-102                 |
| §4.2 主链路 5 秒闭环                | `src/pages/today/index.tsx` 清单行组件                 | T-121                 |
| §4.3 四态 + P1–P6                   | `src/utils/dayState.ts` + 今日页行组件                 | T-107 / T-121         |
| §4.4 节奏规则 + UI 预设             | `src/utils/rate.ts` + 补剂页节奏分段控件               | T-106 / T-123         |
| §4.5 停药规则 + 方案组语义          | `src/utils/pause.ts` + `services/pauseService.ts`      | T-108 / T-113 / T-207 |
| §4.6 打卡与撤销                     | `src/services/intakeService.ts`                        | T-112                 |
| §4.7 回看与补录                     | `src/pages/calendar/` + `services/backfillService.ts`  | T-203 / T-204         |
| §5.1 余量单一数字                   | `services/intakeService.ts` 扣减/加回 + 补剂页余量字段 | T-112 / T-123         |
| §5.2 硬删除 + 二次确认              | `services/supplementService.ts` + 删除确认 Dialog      | T-111 / T-123         |
| §5.3 PC 优先布局                    | `components/layout/AppShell.tsx`                       | T-125                 |
| §6.1–6.6 五张表                     | `src/db/schema.ts`                                     | T-102                 |
| §6.7–6.9 成分三章                   | `src/services/summaryService.ts` + 成分库页            | T-301~308             |
| §7 页面清单                         | `src/routes/index.tsx`                                 | T-125                 |
| §8.3 五条风险                       | 分别落到验收项（见 §13.4）                             | 全部                  |
| §9 走查 21 步                       | §13.2 验收手册                                         | 全部                  |

---

## 3. 不可违背的红线

> **这 16 条是防止范围蔓延的护栏。任何一条被触碰，本次实施即判定失败。**

| #        | 红线                                                                                                                    | 为什么                                  |
| -------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| **R-01** | 不引入后端、云同步、账号体系、任何网络请求（除 PWA 静态资源缓存）                                                       | 需求 §1.3 约束：纯前端、本地存储        |
| **R-02** | 成分汇总**只能做累加与并列**。禁止出现「超标」「过量」「有害」「建议减少」等结论性措辞，禁止用颜色/长度/图标暗示超限    | 需求 §6.9 第 4 条 + RK-05，这是合规红线 |
| **R-03** | 不做移动端专门适配（触摸手势、底部导航、44px 热区、安全区）。窄屏只保「不破坏」                                         | D5 + L3 明确不做                        |
| **R-04** | 不建软删除、回收站、`deletedAt` 字段、恢复流程                                                                          | D2 = A，硬删除                          |
| **R-05** | 不建库存状态机、库存流水表、`stockState` 四态、双扣警告、`unknown` 二选一                                               | D1 = B，余量降为单一数字                |
| **R-06** | M3 的任何功能**不得提前进入 M1**；L3 清单内的任何项**任何阶段都不做**                                                   | RK-02 范围蔓延                          |
| **R-07** | 不修改需求文档、线框文档、v10.1、REQUIREMENTS.md                                                                        | 它们是基线，不是产物                    |
| **R-08** | 判定失败方向一律「**不隐藏**」：节奏/停药参数缺失或非法时，该补剂仍出现在今日页并判为「该吃」，仅在管理页标「配置异常」 | 需求 §4.4 末段，静默隐藏用户无发现渠道  |
| **R-09** | 所有数量、余量、含量一律用**整数**；不使用浮点数做累计运算（重量类成分归一化用整数 μg）                                 | 需求 §6.1 / §6.9                        |
| **R-10** | 日期一律用 `'yyyy-MM-dd'` 本地日期字符串；时间戳用 ISO 8601。禁止混用                                                   | 保证跨时区与比较逻辑正确                |
| **R-11** | 不做庆祝动效、连续打卡天数、成就徽章、健康评分                                                                          | L3 + 合规边界（不做行为诱导）           |
| **R-12** | 不新增第三方依赖（§4.1 的白名单之外一律不装）                                                                           | 纯本地应用的攻击面控制                  |
| **R-13** | 每个里程碑必须**完整通过** §13.3 的验收判据，才算完成                                                                   | 不接受"基本可用"                        |
| **R-14** | 不写任何存量数据迁移链。旧库（`suptrack`）不做读取、不做兼容、不做迁移                                                  | 需求 §6.10：无存量数据                  |
| **R-15** | 不为「撤销」引入任何中间状态。撤销 = 删记录 + 余量加回                                                                  | D2 的连带简化                           |
| **R-16** | 任一记录行都必须能溯源：谁写的（origin）、哪一天归属（date）、什么时候写的（createdAt）                                 | P5「记录行须标注来源」                  |

---

## 4. 技术基线与工程约定

### 4.1 技术栈锁定（白名单）

**一律使用现有依赖，不新增、不升级主版本。**

| 层         | 选型                                            | 版本    | 用途                           |
| ---------- | ----------------------------------------------- | ------- | ------------------------------ |
| 构建       | Vite                                            | ^7.3.6  | —                              |
| 框架       | React                                           | ^19.3.0 | —                              |
| 路由       | react-router-dom                                | ^7.18.3 | `useRoutes` 对象式配置         |
| 存储       | Dexie                                           | ^4.4.5  | IndexedDB 封装                 |
| 响应式查询 | dexie-react-hooks                               | ^4.4.0  | `useLiveQuery`                 |
| 状态       | zustand                                         | ^5.0.15 | 仅用于 `dataVersion` / `toast` |
| 校验       | zod                                             | ^3      | 所有写入边界                   |
| 日期       | date-fns                                        | ^4.4.0  | 不用手写日期运算               |
| UI         | shadcn 原语（`src/components/ui/`）+ Tailwind 4 | —       | 12 个现成原语                  |
| 图标       | lucide-react                                    | —       | 按需引入                       |
| 测试       | vitest + fake-indexeddb                         | —       | `environment: 'node'`          |

**注意**：Dexie 自带的 `liveQuery` 已提供同标签页自动刷新；跨标签页刷新沿用 `src/utils/broadcast.ts`（BroadcastChannel）。不要引入 SWR / TanStack Query / Redux。

### 4.2 代码分层约定

**三层，职责不混。违反分层是最容易埋 bug 的地方。**

```
pages/          ← 只做渲染与交互编排。禁止直接调用 db.*，禁止写业务判断
  ↓ 通过 hooks
hooks/          ← useLiveQuery + 纯函数组装，输出页面所需的视图模型
  ↓
services/       ← 业务用例层：事务、校验、幂等、级联、广播。写操作全在这里
  ↓
repositories/   ← 表级 CRUD，不含业务规则
  ↓
db/schema.ts    ← Dexie 表定义
```

**硬约束**：

| 规则                               | 说明                                                                                                                         |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 页面**不写业务判断**               | 四态判定、节奏判定、停药判定全部来自 `utils/*.ts` 纯函数或 hooks，不允许在 JSX 里写 `if (plan.rateMode === 'cyclic' && ...)` |
| **写操作必须经 service**           | 页面 → service 函数；service 内部开事务、做 Zod 校验、发广播                                                                 |
| **纯函数不做 IO**                  | `utils/rate.ts` / `utils/pause.ts` / `utils/dayState.ts` 不 import `db`，输入参数即数据，便于单测                            |
| **仓储不做业务**                   | repository 只管单表读写，不判断"能不能删"                                                                                    |
| 写操作后必须 `publishDataChange()` | 保证多标签页同步（无写操作则不需要）                                                                                         |

### 4.3 目标目录结构

标注：`[新]` 新建 · `[改]` 重写或大改 · `[搬]` 保留现状（可小幅适配） · `[删]` 删除

```
src/
  App.tsx                                     [搬]
  main.tsx                                    [搬]
  routes/index.tsx                            [改]  导航收为 5 项 + 设置
  components/
    layout/AppShell.tsx                       [改]  220px 侧栏 + 内容区限宽居中
    ui/*.tsx                                  [搬]  12 个原语，不动
    ErrorBoundary/index.tsx                   [改]  增加"重新加载"与"导出备份"入口
    common/                                   [新]
      EmptyState.tsx                             三态空状态组件（§8.7）
      LoadingSkeleton.tsx                        骨架屏（>300ms 才显示）
      ErrorState.tsx                             错误态（原因 + 重试 + 导出）
      OfflineBanner.tsx                          断网提示条（可关闭、不阻塞）
      ConfirmDialog.tsx                          三档确认强度封装（D-轻/中/重）
    today/                                    [新]
      DayListItem.tsx                            单行四态渲染
      PauseSchemeBanner.tsx                      顶部停药提醒条（M2）
    supplement/                               [新]
      SupplementDialog.tsx                       新增/编辑（9 字段平铺）
      DeleteSupplementDialog.tsx                 删除确认（含历史记录勾选）
    pause/                                    [新]
      PausePeriodDialog.tsx                      临时停药增删改
      PauseSchemeDialog.tsx                      方案组编辑（M2）
    calorie/                                  —   不存在的目录，仅为占位陷阱，别建
  constants/
    enums.ts                                  [改]
    units.ts                                  [搬]
    deletedAt.ts                              [删]
    stockState.ts                             [删]
  db/
    index.ts                                  [搬]  改 DB_NAME
    schema.ts                                 [改]  8 张表
    migrations/                               [删]  整目录
  hooks/
    useTodayData.ts                           [改]
    useSupplementList.ts                      [新]
    usePauseData.ts                           [新]
    useCalendarMonth.ts                       [新]  M2
    useIngredientSummary.ts                   [新]  M3
    useMissedPlans.ts                         [删]  M2 改为日历推导
  pages/
    today/index.tsx                           [改]  重写
    supplements/index.tsx                     [改]  重写（合并原 plans 页）
    pausePeriods/index.tsx                    [改]  重写
    calendar/index.tsx                        [改]  M2 重写
    ingredients/index.tsx                     [改]  M3 重写
    settings/index.tsx                        [改]  重写
    plans/                                    [删]  功能并入补剂页
  pwa/registerSW.ts                           [搬]
  repositories/
    base.ts                                   [改]  去软删除
    index.ts                                  [改]
    supplementRepository.ts                   [改]
    dosagePlanRepository.ts                   [改]
    dailyIntakeRepository.ts                  [改]
    pausePeriodRepository.ts                  [改]
    pauseSchemeRepository.ts                  [新]
    ingredientRepository.ts                   [搬]
    supplementIngredientRepository.ts         [搬]
    metaRepository.ts                         [搬]
    stockLogRepository.ts                     [删]
  schemas/
    common.ts                                 [改]  去 DeletedAt
    supplement.ts                             [改]
    dosagePlan.ts                             [改]
    dailyIntake.ts                            [改]
    pausePeriod.ts                            [改]
    pauseScheme.ts                            [新]
    ingredient.ts                             [搬]
    supplementIngredient.ts                   [搬]
    stockLog.ts                               [删]
    bodyFeedback.ts                           [删]
    index.ts                                  [改]
  services/
    supplementService.ts                      [新]
    planService.ts                            [新]
    intakeService.ts                          [改]  重写
    pauseService.ts                           [改]  重写
    backfillService.ts                        [改]  M2
    summaryService.ts                         [改]  M3
    importExportService.ts                    [新]  替代 importService
    importService.ts                          [删]
    metaService.ts                            [搬]
    stockService.ts                           [删]
  stores/
    dataVersion.ts                            [搬]
    toastStore.ts                             [搬]
  styles/index.css                            [搬]  需补四态色 token
  types/index.ts                              [改]  重写
  utils/
    date.ts                                   [改]
    id.ts                                     [搬]
    unit.ts                                   [搬]
    rate.ts                                   [新]  ★ 节奏判定
    pause.ts                                  [改]  ★ 停药判定
    dayState.ts                               [新]  ★ 四态与日级状态判定
    broadcast.ts                              [搬]
    completion.ts                             [删]  被 dayState 取代
    intakeFactory.ts                          [改]  M2 补录用
    merge.ts                                  [删]  导入只做覆盖
    missedCache.ts                            [删]
  test/                                       见 §12
```

### 4.4 命名与代码风格

| 项       | 约定                                                                                                                                                  |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 文件     | 组件 `PascalCase.tsx`；模块 `camelCase.ts`                                                                                                            |
| 表与集合 | Dexie 表名用复数：`supplements` / `dosagePlans` / `dailyIntakes` / `pausePeriods` / `pauseSchemes` / `ingredients` / `supplementIngredients` / `meta` |
| 常量     | `SCREAMING_SNAKE` + `as const`，并在同文件导出 `XXX_VALUES` 元组供 Zod 使用                                                                           |
| 服务函数 | 动词开头：`checkIn` / `undoIntake` / `activateScheme`                                                                                                 |
| 纯函数   | 判定类用 `isXxx` / `matchesXxx` / `resolveXxx`                                                                                                        |
| 错误     | 抛 `Error`，message 直接用**用户可读中文**（UI 会直接 toast 出来），不要抛英文技术异常                                                                |
| 注释     | 只在"为什么这样做"处写；不复述代码。凡涉及需求条款，注释里带条款号，如 `// P2：必须给出下次日期`                                                      |
| 类型     | 全部走 `@/types`，不在页面内重复声明实体类型                                                                                                          |

### 4.5 命令

```bash
pnpm dev          # 开发服务器 http://localhost:3100
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint .
pnpm test         # vitest run
pnpm build        # typecheck + vite build
```

> **每个任务完成前必须跑**：`pnpm typecheck && pnpm test`，两个都过才能提交。每个里程碑结束时额外跑 `pnpm build`。

---

## 5. 目标数据模型

### 5.1 总览：8 张表

| #   | 表                      | 中文           | 里程碑          | 承载的问题       |
| --- | ----------------------- | -------------- | --------------- | ---------------- |
| 1   | `supplements`           | 补剂           | M1              | 我有哪些         |
| 2   | `dosagePlans`           | 计划（含节奏） | M1              | 我该什么时候吃   |
| 3   | `dailyIntakes`          | 记录           | M1              | 我吃了吗         |
| 4   | `pausePeriods`          | 停药条目       | M1              | 我什么时候不该吃 |
| 5   | `pauseSchemes`          | 停药方案组     | M1 表 / M2 界面 | 成套情景         |
| 6   | `meta`                  | 元数据         | M1              | 版本、备份时间   |
| 7   | `ingredients`           | 成分           | M3              | 这粒里有什么     |
| 8   | `supplementIngredients` | 补剂-成分关联  | M3              | 今天一共吃进多少 |

> **简化原则**：能用一个数字表达的，不建一张表；能用布尔表达的，不建枚举。

### 5.2 类型定义（`src/types/index.ts`）

**直接按此实现，字段名不得改动**（与需求 §6 逐字一致，除 §5.7 记录的 4 处实现化偏离）。

```ts
import type { IngredientUnit, UnitType } from '@/constants/units'
import type { IntakeOrigin, RateMode, TimeSlot } from '@/constants/enums'

// ── 1. 补剂 ────────────────────────────────────────────────
export interface Supplement {
  id: string
  name: string
  unitType: UnitType // 每次吃的单位：capsule/tablet/pill/... 10 种
  stockCount: number | null // 余量（按服用单位计，整数，可为负）。null = 不记录
  stockUnit: string | null // 展示单位（瓶 / 盒），仅 UI 换算
  unitsPerStock: number | null // 换算率：1 瓶 = 60 粒
  expiryDate: string | null // yyyy-MM-dd
  notes: string | null
  createdAt: string // ISO
  updatedAt: string
}

// ── 2. 计划 ────────────────────────────────────────────────
export interface DosagePlan {
  id: string
  supplementId: string
  amountPerTime: number // 每次服用量（不是每日量）
  timeSlots: TimeSlot[] // 非空，去重
  rateMode: RateMode // 'daily' | 'cyclic'
  rateOnDays: number | null // cyclic 必填，≥1
  rateOffDays: number | null // cyclic 必填，≥1
  rateAnchorDate: string | null // cyclic 必填，节奏起点
  isActive: boolean // 启用 / 关闭
  notes: string | null
  createdAt: string
  updatedAt: string
}

// ── 3. 记录 ────────────────────────────────────────────────
export interface DailyIntake {
  id: string
  date: string // 服用归属日期（补录时为用户所选历史日期）
  supplementId: string
  planId: string | null // 空 = 无计划（手动录入 / 仍要服用）
  timeSlot: TimeSlot
  amount: number // 实际服用量，整数
  taken: boolean // true 吃了 / false 标记漏服
  isExtra: boolean // = origin !== 'checkin'（由 Zod refine 强制）
  origin: IntakeOrigin // 来源，UI 据此标注
  notes: string | null
  createdAt: string // 真实写入时间（与 date 不同时 UI 标「补录」）
  updatedAt: string
}

// ── 4. 停药条目 ────────────────────────────────────────────
export interface PausePeriod {
  id: string
  schemeId: string | null // 空 = 临时停药
  supplementId: string | 'ALL' // 目标补剂，或全部
  startDate: string | null // 空 = 跟随方案组
  endDate: string | null // 空 = 持续中
  reason: string | null // 原因，UI 展示在今日页
  createdAt: string
  updatedAt: string
}

// ── 5. 停药方案组 ──────────────────────────────────────────
export interface PauseScheme {
  id: string
  name: string // 如「抗生素期间」
  note: string | null
  isActive: boolean // 是否执行中
  activatedAt: string | null // 执行起始日
  endedAt: string | null // 结束日；空且 isActive = 持续中
  createdAt: string
  updatedAt: string
}

// ── 6. 成分（M3） ──────────────────────────────────────────
export interface Ingredient {
  id: string
  name: string // 跨补剂归并的唯一锚点
  unit: IngredientUnit // mg / μg / g / IU / ml；存储统一 μg
  recommendedDailyIntake: number | null // 参考摄入量，用户自填，系统不预置
  upperLimit: number | null // 上限，用户自填
  notes: string | null
  createdAt: string
  updatedAt: string
}

// ── 7. 补剂-成分关联（M3） ─────────────────────────────────
export interface SupplementIngredient {
  id: string
  supplementId: string
  ingredientId: string
  amountPerServing: number // 每份含量，整数
  effectiveFrom: string // 生效日
  effectiveTo: string | null // 失效日，空 = 当前有效
  createdAt: string
  updatedAt: string
}

// ── 8. 元数据 ──────────────────────────────────────────────
export interface MetaRecord {
  key: string
  value: unknown
}
```

### 5.3 Dexie 定义（`src/db/schema.ts`）

```ts
import Dexie, { type Table } from 'dexie'
import type {
  DailyIntake,
  DosagePlan,
  Ingredient,
  MetaRecord,
  PausePeriod,
  PauseScheme,
  Supplement,
  SupplementIngredient,
} from '@/types'

/** 新库名：与旧库 suptrack 完全隔离（R-14，不做迁移） */
export const DB_NAME = 'suptrack-v12'

/** 元数据键 */
export const META_KEY = {
  SCHEMA_VERSION: 'schemaVersion',
  LAST_EXPORT_AT: 'lastExportAt',
  APP_VERSION: 'appVersion',
} as const

export class SupTrackDB extends Dexie {
  supplements!: Table<Supplement, string>
  dosagePlans!: Table<DosagePlan, string>
  dailyIntakes!: Table<DailyIntake, string>
  pausePeriods!: Table<PausePeriod, string>
  pauseSchemes!: Table<PauseScheme, string>
  meta!: Table<MetaRecord, string>
  ingredients!: Table<Ingredient, string>
  supplementIngredients!: Table<SupplementIngredient, string>

  constructor(name: string = DB_NAME) {
    super(name)
    this.version(1).stores({
      supplements: 'id, name',
      // isActive 是 boolean，IndexedDB 不接受 boolean 作为索引 key，
      // 故不建索引，查询侧过滤（沿用既有结论）
      dosagePlans: 'id, supplementId',
      dailyIntakes: 'id, date, supplementId, planId, [date+supplementId], [date+timeSlot]',
      pausePeriods: 'id, supplementId, schemeId, startDate',
      // isActive 同上不可索引；activatedAt 承担「谁是执行中」的排序
      pauseSchemes: 'id, name, activatedAt',
      meta: 'key',
      ingredients: 'id, name',
      supplementIngredients:
        'id, supplementId, ingredientId, effectiveFrom, effectiveTo, [supplementId+ingredientId]',
    })
  }
}
```

> **索引设计说明**（写进代码注释，避免后人误改）：
>
> - `[date+supplementId]` 承担「某日某补剂的记录」查询（今日页、重复检测）。
> - `[date+timeSlot]` 承担日历按日聚取。
> - 单日区间查询用 `where('[date+supplementId]').equals([date, id])`，**不要**用 `between` 补 `\uffff` 的老写法——新模型不再需要软删除过滤，直接按 date 等值查即可。
> - `ingredients` / `supplementIngredients` 在 M1 就建表（避免 M3 时再次升 schema），只是 M1 不放任何入口。

### 5.4 枚举与常量（`src/constants/enums.ts`）

```ts
// 时段
export const TIME_SLOT = {
  MORNING: 'morning',
  NOON: 'noon',
  EVENING: 'evening',
  BEDTIME: 'bedtime',
} as const
export type TimeSlot = (typeof TIME_SLOT)[keyof typeof TIME_SLOT]
export const TIME_SLOT_VALUES = Object.values(TIME_SLOT) as [TimeSlot, ...TimeSlot[]]
export const TIME_SLOT_LABEL: Record<TimeSlot, string> = {
  morning: '早上',
  noon: '中午',
  evening: '晚上',
  bedtime: '睡前',
}

// 节奏模式
export const RATE_MODE = { DAILY: 'daily', CYCLIC: 'cyclic' } as const
export type RateMode = (typeof RATE_MODE)[keyof typeof RATE_MODE]
export const RATE_MODE_VALUES = Object.values(RATE_MODE) as [RateMode, ...RateMode[]]

// 记录来源（R-16：每条记录必须可溯源）
export const INTAKE_ORIGIN = {
  CHECKIN: 'checkin', // 计划内打卡
  EXTRA: 'extra', // 追加一次（同一天吃了第二次）
  FORCED: 'forced', // 仍要服用（休息日 / 停用期）
  BACKFILL: 'backfill', // 补录
  MANUAL: 'manual', // 手动录入（无计划）
} as const
export type IntakeOrigin = (typeof INTAKE_ORIGIN)[keyof typeof INTAKE_ORIGIN]
export const INTAKE_ORIGIN_VALUES = Object.values(INTAKE_ORIGIN) as [
  IntakeOrigin,
  ...IntakeOrigin[],
]
export const INTAKE_ORIGIN_LABEL: Record<IntakeOrigin, string> = {
  checkin: '计划打卡',
  extra: '追加一次',
  forced: '计划外服用',
  backfill: '补录',
  manual: '手动录入',
}

// 全部补剂（全局停药）
export const ALL_SUPPLEMENTS = 'ALL'

// 阈值
/** 补录窗口（天），不含今天 */
export const BACKFILL_WINDOW_DAYS = 7
/** 余量偏低：剩余可用天数 ≤ 该值 */
export const LOW_STOCK_DAYS = 5
/** 临期提醒阈值（天） */
export const EXPIRY_WARNING_DAYS = 30
/** 备份提醒：距上次导出超过该天数 */
export const BACKUP_REMIND_DAYS = 30
/** 密集折叠阈值：同时段休息+停用项 ≥ 该值时折叠 */
export const DENSE_COLLAPSE_THRESHOLD = 3
/** 月历每格最多标记数 */
export const CALENDAR_MAX_DOTS = 3
```

**删除**：`INTAKE_STATUS` / `INTAKE_STATUS_LABEL` / `INTAKE_SOURCE` / `CYCLE_MODE` / `SUPPLEMENT_STATUS` / `STOCK_LOG_REASON` / `PLANNED_AMOUNT_SOURCE` / `STOCK_BATCH_UNIT` 全部移除。

`META_KEY` 里移除 `BACKFILL_WINDOW_DAYS`（改成常量，不再让用户配置，见 §14.1 D-07）。

### 5.5 Zod 校验（`src/schemas/`）

写入边界一律过 Zod。**所有实体都有 Create / Update 两套**：Create 校验完整对象，Update 全部字段 optional（便于部分更新）。

关键 refine 规则（缺一不可）：

| 表                      | refine                                                                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `dosagePlans`           | `rateMode === 'cyclic'` → `rateOnDays ≥ 1 && rateOffDays ≥ 1 && rateAnchorDate 非空`；`rateMode === 'daily'` → 三者均可空但若填了不报错（宽容） |
| `dosagePlans`           | `timeSlots.length ≥ 1` 且去重                                                                                                                   |
| `dailyIntakes`          | `isExtra === (origin !== 'checkin')`（R-16 一致性）                                                                                             |
| `dailyIntakes`          | `amount ≥ 1`                                                                                                                                    |
| `dailyIntakes`          | `taken === false` → `origin === 'backfill' \| 'manual'`（今日不能标漏服，需求 §4.6）                                                            |
| `pausePeriods`          | `endDate == null \|\| startDate == null \|\| endDate >= startDate`                                                                              |
| `supplementIngredients` | `amountPerServing ≥ 0`；`effectiveTo == null \|\| effectiveTo >= effectiveFrom`                                                                 |
| `ingredients`           | `recommendedDailyIntake == null \|\| ≥ 0`；`upperLimit == null \|\| ≥ 0`                                                                        |

`common.ts` 里**移除** `DeletedAtSchema`，保留 `UuidSchema` / `IntSchema` / `NonNegIntSchema` / `IsoDateSchema` / `IsoDateTimeSchema` / `NullableTextSchema` / `NullableIntSchema`。

### 5.6 与旧模型的对照

| 旧                                                              | 新                        | 处理                                     |
| --------------------------------------------------------------- | ------------------------- | ---------------------------------------- |
| `Supplement.stockCountInUsageUnit`                              | `stockCount`              | 改名                                     |
| `Supplement.status`（active/inactive/finished）                 | 无                        | 删除（启用状态由计划的 `isActive` 承担） |
| `DosagePlan.dailyAmount`                                        | `amountPerTime`           | 改名 + 语义澄清（每次量，不是每日量）    |
| `DosagePlan.withMeal`                                           | 无                        | 删除（无用例）                           |
| `DailyIntake.status`（4 枚举）                                  | `taken` 布尔 + `origin`   | 重构                                     |
| `DailyIntake.actualAmount`                                      | `amount`                  | 改名                                     |
| `DailyIntake.stockState` / `plannedAmount*` / `deletedAt`       | 无                        | 删除                                     |
| `PausePeriod.cycleMode/cycleStartDate/cycleOnDays/cycleOffDays` | 迁移到计划的 `rate*` 字段 | 删除                                     |
| `PausePeriod.supplementId: null` 表示全局                       | `'ALL'`                   | 改值                                     |
| `StockLog` / `StockBatch` / `BodyFeedback`                      | 无                        | 删表                                     |
| `deletedAt`（全部表）                                           | 无                        | 删字段                                   |

### 5.7 实现化偏离清单（必须记录，不得静默）

需求文档在四处写到了实现者才能发现的不精确处，本实施按右侧处理。**这些偏离必须写进 `docs/DECISIONS.md`（新建，见 T-126）**。

| 编号        | 需求文档原文                                                       | 本实施                                                                                      | 理由                                                                                                                               |
| ----------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **DIFF-01** | `isExtra` 布尔                                                     | `isExtra` + `origin` 枚举                                                                   | §4.3 P5 要求「记录行须标注来源」，单一布尔无法区分「追加一次」与「休息日仍要服用」。`isExtra` 保留并由 refine 与 `origin` 保持一致 |
| **DIFF-02** | 「同一补剂的启用计划，时段不得重叠……拆时段，不建两条计划」         | 收紧为「**同一补剂至多 1 条 `isActive=true` 的计划**」                                      | 原文两种表述等价但易误读。收紧后的规则可被单条 Zod refine 与唯一性检查直接执行                                                     |
| **DIFF-03** | 「引用被删的补剂：条目保留并标『已删除补剂』……恢复后自动重新生效」 | 删除补剂时**一并硬删除**其 PausePeriod 条目                                                 | 新模型是硬删除、无恢复路径，「恢复后重新生效」永不发生，保留孤儿条目只会积累垃圾数据                                               |
| **DIFF-04** | 设置页「导出 / 导入」                                              | 导入**只做覆盖**，不做智能合并                                                              | 不做云同步 → 唯一场景是「备份恢复」，覆盖语义最清晰。导入前自动导出现有数据作为兜底                                                |
| **DIFF-05** | 「停用中 · 抗生素期间 · 9/30 恢复」                                | 停用区间为闭区间 `[start, end]`；文案中的「X 恢复」= `end + 1` 天；`end` 为空显示「持续中」 | 原文示例中 `end=9/30` 时 9/30 当天仍在停用，写「9/30 恢复」会误导。表单字段标注为「到哪天为止（含当天）」                          |

**除以上 5 条外，不得有任何其他字段名或语义偏离。** 若实施中又发现必须偏离之处，追加 DIFF-06 并说明理由。

---

## 6. 核心算法规格（纯函数）

> **这五个函数是整个应用的逻辑核心，也是唯一值得认真写单测的地方。**
>
> 全部放 `src/utils/`，**不 import `db`**，输入即数据。先写 §12.2 的测试，再写实现。

### 6.1 日期工具（`src/utils/date.ts`）

```ts
export const DATE_FORMAT = 'yyyy-MM-dd'

export function formatDate(date: Date): string // 已有
export function today(): string // 已有
export function yesterday(): string // 已有
export function isValidDate(value: string): boolean // 已有

/** 新增：date 之后 n 天（n 可为负） */
export function addDays(date: string, n: number): string
/** 新增：两个日期之间的日历天数差（to - from） */
export function diffCalendarDays(from: string, to: string): number
/** 新增：中文短日期展示，如「9月20日 周日」 */
export function formatDateLabel(date: string): string
/** 新增：短日期展示，如「9/22」（月日无前导零） */
export function formatShortDate(date: string): string
/** 新增：补录可选范围 [today-7, yesterday] */
export function backfillRange(): { min: string; max: string }
/** 保留：临期判断 */
export function isExpiringSoon(expiryDate: string | null, threshold?: number): boolean
/** 保留：是否补录（date 与 createdAt 不同日） */
export function isBackfill(date: string, createdAt: string): boolean
/** 保留 */
export function daysUntil(date: string): number
```

⚠️ **现有代码有两个坑，重写时必须修掉**：

| 坑                                                                      | 现状            | 修复                                                    |
| ----------------------------------------------------------------------- | --------------- | ------------------------------------------------------- |
| `shiftDays(date, days)` 名字像"偏移"，实际实现是**往前减**（`subDays`） | `utils/date.ts` | **删除 `shiftDays`**，改用语义明确的 `addDays(date, n)` |
| `backfillRange(backfillWindowDays)` 需要外部传参                        | 同上            | 改为无参（窗口固定 7 天，见 D-07）                      |

### 6.2 节奏判定（`src/utils/rate.ts`）★

```ts
/** 判断某日是否为该计划的「该吃日」 */
export function matchesRate(plan: DosagePlan, date: string): boolean {
  // daily：恒为 true
  if (plan.rateMode === 'daily') return true

  // cyclic：参数缺失 / 非法 → 判为「该吃」（R-08 失败方向：不隐藏）
  const { rateOnDays: on, rateOffDays: off, rateAnchorDate: anchor } = plan
  if (!anchor || on == null || off == null || on < 1 || off < 1 || !isValidDate(anchor)) return true

  const diff = diffCalendarDays(anchor, date)
  if (diff < 0) return false // 节奏尚未开始 → 该日不出现
  return diff % (on + off) < on // anchor 当天算周期第 1 个「该吃」日
}

/** 严格晚于 fromDate 的第一个「该吃」日。用于 P2「下次 X 日」 */
export function nextRateDate(plan: DosagePlan, fromDate: string): string | null {
  if (plan.rateMode === 'daily') return addDays(fromDate, 1)
  const { rateOnDays: on, rateOffDays: off, rateAnchorDate: anchor } = plan
  if (!anchor || on == null || off == null) return addDays(fromDate, 1) // 配置异常按每天算
  const period = on + off
  for (let i = 1; i <= period; i++) {
    // 一个周期内必有解，最多找 period 天
    const d = addDays(fromDate, i)
    if (matchesRate(plan, d)) return d
  }
  return null // 不可达
}

/** 平均每日出现率（0–1]。用于余量估算 */
export function rateDensity(plan: DosagePlan): number {
  if (plan.rateMode === 'daily') return 1
  const { rateOnDays: on, rateOffDays: off } = plan
  if (on == null || off == null || on + off === 0) return 1
  return on / (on + off)
}

/** 用户语言描述节奏（补剂列表直接用这个，不要把参数暴露给用户） */
export function describeRate(plan: DosagePlan): string {
  if (plan.rateMode === 'daily') return '每天'
  const { rateOnDays: on, rateOffDays: off } = plan
  if (on == null || off == null) return '配置异常'
  if (on === 1 && off === 1) return '隔天'
  if (on === 1) return `每 ${off + 1} 天一次`
  return `吃 ${on} 停 ${off}`
}

/** cyclic 参数是否完整合法（用于补剂页「配置异常」标记，R-08） */
export function isRateConfigValid(plan: DosagePlan): boolean {
  if (plan.rateMode === 'daily') return true
  const { rateOnDays: on, rateOffDays: off, rateAnchorDate: a } = plan
  return on != null && off != null && on >= 1 && off >= 1 && !!a && isValidDate(a)
}

/** UI 预设 → 参数（§4.4 表，两个入口都要给） */
export const RATE_PRESETS = [
  {
    key: 'daily',
    label: '每天',
    toParams: () => ({
      rateMode: 'daily',
      rateOnDays: null,
      rateOffDays: null,
      rateAnchorDate: null,
    }),
  },
  {
    key: 'everyOther',
    label: '隔天',
    toParams: (a: string) => ({
      rateMode: 'cyclic',
      rateOnDays: 1,
      rateOffDays: 1,
      rateAnchorDate: a,
    }),
  },
  {
    key: 'everyN',
    label: '每 N 天一次',
    toParams: (a: string, n = 2) => ({
      rateMode: 'cyclic',
      rateOnDays: 1,
      rateOffDays: n - 1,
      rateAnchorDate: a,
    }),
  },
  {
    key: 'onOff',
    label: '吃 N 停 M',
    toParams: (a: string, on = 5, off = 2) => ({
      rateMode: 'cyclic',
      rateOnDays: on,
      rateOffDays: off,
      rateAnchorDate: a,
    }),
  },
] as const
```

**边界用例表**（写进测试）：

| 场景                 | 输入                                  | 期望                                                    |
| -------------------- | ------------------------------------- | ------------------------------------------------------- |
| 锚点是未来           | `anchor=9/25`，查 `9/20`              | `matchesRate=false`（不出现，不报错）                   |
| 锚点当天             | `anchor=9/25, on=1, off=1`，查 `9/25` | `true`                                                  |
| 隔天 · 第 2 天       | 同上，查 `9/26`                       | `false`                                                 |
| 隔天 · 第 3 天       | 同上，查 `9/27`                       | `true`                                                  |
| 吃 5 停 2 · 第 6 天  | `on=5, off=2`，`anchor+5`             | `false`                                                 |
| 吃 5 停 2 · 第 7 天  | `anchor+6`                            | `false`                                                 |
| 吃 5 停 2 · 第 8 天  | `anchor+7`                            | `true`                                                  |
| 参数缺失             | `rateMode='cyclic'`, `on=null`        | `matchesRate=true`（不隐藏），`isRateConfigValid=false` |
| 下次日期 · 隔天      | from=`9/26`（休息日）                 | `9/27`                                                  |
| 下次日期 · 吃 5 停 2 | from=`anchor+5`                       | `anchor+7`                                              |
| 密度                 | `on=5, off=2`                         | `5/7`                                                   |

### 6.3 停药判定（`src/utils/pause.ts`）★

```ts
export interface PauseContext {
  periods: PausePeriod[]
  schemes: Map<string, PauseScheme> // schemeId → scheme
}

export interface ActivePause {
  period: PausePeriod
  scheme: PauseScheme | null
  /** 今日页文案用：优先 period.reason，其次 scheme.name，最后 '停药中' */
  reasonLabel: string
  /** 停用区间（闭区间） */
  startDate: string
  /** null = 持续中 */
  endDate: string | null
  /** 恢复服用日 = endDate + 1；null = 持续中 */
  resumeDate: string | null
}

/**
 * 解析一条停药条目的实际生效区间。
 * 返回 null 表示该条目当前不生效（方案组未执行过等）。
 */
export function resolveEffectiveRange(
  period: PausePeriod,
  scheme: PauseScheme | null,
): { startDate: string; endDate: string | null } | null {
  // 条目自带 startDate → 用条目自己的（独立起止）
  if (period.startDate) {
    return { startDate: period.startDate, endDate: period.endDate ?? null }
  }
  // 否则跟随方案组
  if (!scheme) return null // 临时停药必须有 startDate（Zod 强制）
  if (scheme.activatedAt == null) return null // 从未执行 → 不生效
  return { startDate: scheme.activatedAt, endDate: period.endDate ?? scheme.endedAt ?? null }
}

/** 该日是否落在某条停药区间内（含边界） */
export function coversDate(
  range: { startDate: string; endDate: string | null },
  date: string,
): boolean {
  if (date < range.startDate) return false
  if (range.endDate != null && date > range.endDate) return false
  return true
}

/** 补剂在该日命中的全部停药条目（并集语义） */
export function findActivePauses(
  supplementId: string,
  date: string,
  ctx: PauseContext,
): ActivePause[] {
  const out: ActivePause[] = []
  for (const period of ctx.periods) {
    if (period.supplementId !== supplementId && period.supplementId !== ALL_SUPPLEMENTS) continue
    const scheme = period.schemeId ? (ctx.schemes.get(period.schemeId) ?? null) : null
    const range = resolveEffectiveRange(period, scheme)
    if (!range || !coversDate(range, date)) continue
    out.push({
      period,
      scheme,
      reasonLabel: period.reason ?? scheme?.name ?? '停药中',
      startDate: range.startDate,
      endDate: range.endDate,
      resumeDate: range.endDate ? addDays(range.endDate, 1) : null, // DIFF-05
    })
  }
  return out
}

export function isPausedOn(supplementId: string, date: string, ctx: PauseContext): boolean {
  return findActivePauses(supplementId, date, ctx).length > 0
}
```

**生效区间规则表**（写进测试）：

| `period.startDate` | `period.endDate` | 方案组状态         | 生效区间                                              |
| ------------------ | ---------------- | ------------------ | ----------------------------------------------------- |
| 有                 | 有               | 任意               | `[startDate, endDate]`                                |
| 有                 | 空               | 任意               | `[startDate, +∞)`                                     |
| 空                 | 空               | `activatedAt` 有值 | `[activatedAt, scheme.endedAt ?? +∞)`                 |
| 空                 | 空               | `activatedAt` 为空 | **不生效**                                            |
| 空                 | 有               | `activatedAt` 有值 | `[activatedAt, endDate]`（条目自带 endDate 优先于组） |

**边界用例**：

| 场景                                          | 期望                                                  |
| --------------------------------------------- | ----------------------------------------------------- |
| `'ALL'` 条目                                  | 对任意补剂均命中                                      |
| 临时停药 start=9/19, end=9/21，查 9/19 / 9/21 | 均命中；查 9/22 不命中                                |
| 同上，`resumeDate`                            | `9/22`（DIFF-05）                                     |
| 停用期无 endDate                              | `endDate=null`，`resumeDate=null` → UI 显示「持续中」 |
| 补剂独立停药 + 方案组停药同时命中             | 两条都返回（并集），UI 展示第一条优先                 |
| `schemeId` 指向的 scheme 已被删除             | 按「不生效」处理，不抛错                              |

### 6.4 四态与日级状态（`src/utils/dayState.ts`）★

这是今日页与日历页共用的判定核心。

```ts
export type ItemState = 'pending' | 'taken' | 'rest' | 'paused'

export interface DayItem {
  date: string
  supplementId: string
  supplement: Supplement | undefined // undefined = 补剂已被删除
  planId: string
  timeSlot: TimeSlot
  amountDue: number // 计划量
  state: ItemState
  /** 该日该补剂的累积已服量（taken=true 的记录之和） */
  takenAmount: number
  /** 该日该补剂的已服时间（最新一条） */
  lastTakenAt: string | null
  /** state === 'rest' 时必填（P2） */
  nextRateDate: string | null
  /** state === 'paused' 或「停用期服用」时非空 */
  pause: ActivePause | null
  /** 有记录且当时处于休息日 / 停用期 */
  offScheduleTake: boolean
  /** 节奏参数非法（R-08） */
  configError: boolean
}

/**
 * 判定优先级（严格按序，第一条命中即返回）：
 *
 *   1. 该日存在 taken=true 的记录         → 'taken'
 *   2. 命中停药                            → 'paused'
 *   3. !matchesRate(plan, date)            → 'rest'
 *   4. 其他                                → 'pending'
 *
 * 为什么「已服用」优先于「停用」：产品的第一问是 Q2「我吃了吗」。
 * 用户已经在停用期点了「仍要服用」，此时显示「停用中」会让他以为没记上。
 * 代价是需要在 taken 状态下额外标注来源（offScheduleTake），由 UI 承担。
 */
export function resolveDayItems(input: {
  date: string
  plans: DosagePlan[]
  supplements: Map<string, Supplement>
  records: DailyIntake[] // 该日全部记录
  pauseCtx: PauseContext
}): DayItem[]
```

**实现要点**：

1. 对每个 `plan`，按 `plan.timeSlots` 展开成多个 `DayItem`（一个计划多时段 = 多行）。
2. `records` 按 `(supplementId, timeSlot)` 索引；同键可能有多条（打卡 + 追加一次）。
3. `takenAmount = Σ records.filter(r => r.taken).amount`；`takenCount = 该组记录数`。
4. `offScheduleTake = state==='taken' && (pause != null || !matchesRate(plan, date))`。
5. `nextRateDate`：仅 `state === 'rest'` 时计算（`nextRateDate(plan, date)`），其他状态为 `null`。
6. 计划按「无计划记录」补位：`records` 中 `planId == null` 且没有对应计划的记录（手动录入 / 仍要服用），也要生成 `DayItem`，`state='taken'`、`planId=''`、`amountDue=0`。**它们不进计划清单，走「计划外」分组**（见 §8.1）。

**日级状态（日历用）**：

```ts
export type DayStatus = 'empty' | 'paused' | 'rest' | 'done' | 'partial' | 'missed'

export function resolveDayStatus(items: DayItem[]): DayStatus {
  const due = items.filter((i) => i.state === 'pending' || i.state === 'taken')
  const paused = items.filter((i) => i.state === 'paused')
  const rest = items.filter((i) => i.state === 'rest')

  if (due.length === 0 && paused.length > 0) return 'paused'
  if (due.length === 0 && rest.length > 0) return 'rest'
  if (due.length === 0) return 'empty'

  const takenCount = due.filter((i) => i.state === 'taken').length
  if (takenCount === due.length) return 'done'
  if (takenCount > 0) return 'partial'
  return 'missed'
}
```

> **「漏服」不需要用户手动标记**（线框 §04 明确要求写进代码）：过去某日存在 `state === 'pending'` 的应服项，即自动判为 `missed`。用户显式标记的 `taken=false` 记录同样使该日落入 `missed`（它是 `pending` 之外的一种"未完成"表达，在 `resolveDayItems` 里体现为「有记录但 taken=false」→ 仍返回 `pending`）。

**待服用 vs 漏服的区别**：同一份 `resolveDayItems` 结果，`date === today()` 时 `pending` 显示为「待服用」，`date < today()` 时显示为「漏服」。**判定函数不区分，由 UI 按日期呈现**。

**边界用例**：

| 场景                                 | 期望                                                                  |
| ------------------------------------ | --------------------------------------------------------------------- |
| 该吃、无记录                         | `pending`                                                             |
| 该吃、有 taken=true 记录             | `taken`，`takenAmount` 正确                                           |
| 该吃、两条记录（打卡 + 追加）        | `taken`，`takenAmount` 为两条之和                                     |
| 休息日、无记录                       | `rest`，`nextRateDate` 非空（P2）                                     |
| 停用中、无记录                       | `paused`，`pause.resumeDate` 正确                                     |
| 休息日 + 有记录                      | `taken` 且 `offScheduleTake=true`                                     |
| 停用中 + 有记录                      | `taken` 且 `offScheduleTake=true`（停用优先于节奏，但记录优先于停用） |
| 节奏参数非法                         | `state` 按"该吃"处理 + `configError=true`                             |
| 补剂已被删除                         | `supplement=undefined`，仍生成 item，UI 显示「[已删除的补剂]」        |
| 日级：全 pending                     | `missed`                                                              |
| 日级：1 taken + 1 pending            | `partial`                                                             |
| 日级：全 taken                       | `done`                                                                |
| 日级：无应服项 + 有 paused           | `paused`                                                              |
| 日级：无应服项 + 无 paused + 有 rest | `rest`                                                                |

### 6.5 余量规则（单一数字，D1=B）★

| 场景          | 规则                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------ |
| **扣减**      | 写入一条 `taken === true` 的记录时：若 `supplement.stockCount != null` → `stockCount -= record.amount` |
| **加回**      | 撤销（硬删除）一条 `taken === true` 的记录时：若 `stockCount != null` → `stockCount += record.amount`  |
| **不变**      | `taken === false`（漏服标记）不扣也不加                                                                |
| **不改**      | 补录（`origin='backfill'`）与打卡走同一规则——只要 `taken=true` 就扣                                    |
| **可为负**    | 允许为负，负值用 warning 色展示；不做拦截                                                              |
| **null 语义** | `stockCount === null` 表示「不记录余量」，全部余量逻辑跳过                                             |
| **手动调整**  | 补剂编辑里直接改 `stockCount`（覆盖式赋值），不写流水、不记账                                          |
| **不做**      | 不做流水、不做批次、不做状态机、不做「为什么少了 3 粒」的追溯                                          |

**余量偏低判定**（W-02 拍板）：

```ts
/** 平均每日消耗量 = Σ(amountPerTime × rateDensity(plan))，仅计启用计划 */
export function dailyDose(supplementId: string, plans: DosagePlan[]): number

export function isLowStock(supplement: Supplement, plans: DosagePlan[]): boolean {
  if (supplement.stockCount == null) return false
  if (supplement.stockCount < 0) return false // 负值走「库存为负」提示，不重复提示
  const dose = dailyDose(supplement.id, plans)
  if (dose <= 0) return false
  return supplement.stockCount / dose <= LOW_STOCK_DAYS // 5 天
}
```

> **为什么用「日均」而不是「每次量」**：线框 W-02 写的是「剩余 ÷ 每次量」，但在 cyclic 计划下这会让隔天吃的补剂被高估一倍消耗。用「每次量 × 出现率」的平均值才能得出正确的"还能吃几天"。**这是对 W-02 的实现化，UI 文案不变（仍显示「余量 12（偏低）」）。**

### 6.6 成分汇总（M3 · `src/services/summaryService.ts`）

四条口径**必须逐条写死在代码里**（需求 §6.9）。

```ts
export interface IngredientTotal {
  ingredientId: string
  name: string
  unit: IngredientUnit
  /** 重量类为 μg 合计数；IU / ml 为原单位合计数 */
  total: number
  /** 展示用（重量类按合计值选单位） */
  displayValue: number
  displayUnit: IngredientUnit
  recommendedDailyIntake: number | null
  upperLimit: number | null
  /** 来源明细（UI 展示「来源：A 1000 + B 400」） */
  sources: Array<{ supplementId: string; supplementName: string; amount: number }>
  /** 存在解析不出补剂的记录 */
  hasDeletedSupplement: boolean
  /** 存在关联配方缺失 */
  missingRecipe: boolean
}

export async function summarizeDate(date: string): Promise<IngredientTotal[]>
```

**实现算法**：

```
1. 取该日全部记录 records
2. 过滤：record.taken === true            ← 口径 1（taken=false 与漏服不计入）
3. 对每条记录：
     a. 取该补剂在 record.date 当时有效的配方关联（M3 用 effectiveFrom/To 匹配 record.date，
        不是 createdAt）                     ← 口径 2
     b. 对每个关联：amount = link.amountPerServing × record.amount
        - 重量类（μg/mg/g）→ 归一到 μg 后累加
        - IU / ml → 原单位独立累加，不与其他类混算   ← 口径 3
     c. 累加进 accumulator，key = ingredientId + ':' + 单位类别
4. 展示：重量类按合计值选展示单位（<1000μg → μg；<1e6 → mg；否则 g）
5. 输出只有数字与并列，UI 不得加任何判断性颜色 / 图标 / 措辞   ← 口径 4（R-02）
```

**合规边界（写进组件注释与测试）**：

```
❌ 禁止出现：「已超标」「过量」「有害」「建议减少」「已达 XX%」
❌ 禁止：进度条着色、超限变红、告警图标、健康评分
✅ 允许：「参考值 800 / 今日 1400 IU」（纯数字并列）
✅ 允许：「未设参考值」「来源：A 1000 + B 400」
```

> **注意**：现有 `summaryService.ts` 有一处 `text-destructive` 超限变红的实现（`today/index.tsx` 第 305 行）。**M3 重写时必须删掉**，这是 RK-05 的正面命中。

---

## 7. 服务层 API 契约

> 写操作全在 service。每个 service 函数**必须**：① 开事务（涉及多表时）② 过 Zod ③ 结束时 `publishDataChange()` ④ 抛中文错误。

### 7.1 `services/supplementService.ts`（新）

```ts
/** 新建补剂（可选同时创建首条计划，减少一次跳转） */
export async function createSupplement(
  input: SupplementCreateInput,
  plan?: DosagePlanCreateInput,
): Promise<Supplement>

export async function updateSupplement(id: string, patch: SupplementUpdateInput): Promise<void>

/** 手动调整余量（覆盖式，不记账） */
export async function setStockCount(id: string, stockCount: number | null): Promise<void>

/**
 * 硬删除补剂（D2=A）。级联规则见下表。
 * @param deleteRecords 是否同时删除该补剂的历史记录（UI 默认勾选）
 */
export async function deleteSupplement(id: string, deleteRecords: boolean): Promise<void>

/** 删除前的统计，用于确认框展示具体数字 */
export async function countRelatedRecords(id: string): Promise<number>
```

**级联删除规则**（DIFF-03）：

| 关联表                                  | 处理                                                                                     |
| --------------------------------------- | ---------------------------------------------------------------------------------------- |
| `dosagePlans`（该补剂全部）             | **硬删除**                                                                               |
| `pausePeriods`（`supplementId === id`） | **硬删除**（DIFF-03；`'ALL'` 条目不删）                                                  |
| `dailyIntakes`（该补剂全部）            | `deleteRecords === true` → 硬删除；`false` → 保留（孤儿记录，UI 显示「[已删除的补剂]」） |
| `supplementIngredients`（M3）           | **硬删除**                                                                               |
| `meta`                                  | 不动                                                                                     |

> 全部在一个 `db.transaction('rw', ...)` 内完成，失败整体回滚。

### 7.2 `services/planService.ts`（新）

```ts
/**
 * 保存补剂的计划（新建或更新）。同补剂至多一条 isActive=true —— DIFF-02。
 * 若已存在启用计划，则更新它；否则新建。
 * 若 isActive=false，则关闭当前启用计划（历史保留）。
 */
export async function savePlanForSupplement(
  supplementId: string,
  input: { amountPerTime; timeSlots; rateMode; rateOnDays; rateOffDays; rateAnchorDate; notes },
): Promise<DosagePlan>

/** 关闭计划（P6：与节奏休息是两件事） */
export async function deactivatePlan(planId: string): Promise<void>

/** 删除计划条目（硬删除） */
export async function deletePlan(planId: string): Promise<void>

/** 校验：该补剂是否已有启用计划 */
export async function hasActivePlan(supplementId: string, excludePlanId?: string): Promise<boolean>
```

**必须拦截的错误**（抛中文 Error，UI toast 显示）：

| 条件                           | 错误信息                                                               |
| ------------------------------ | ---------------------------------------------------------------------- |
| `timeSlots` 为空               | `请至少选择一个服用时段`                                               |
| 已有启用计划且正在新建         | `该补剂已有启用的计划，请直接编辑；要一天吃两次请在同一计划里多选时段` |
| `cyclic` 且 on/off/anchor 缺失 | `节奏参数不完整，请补齐「吃几天 / 停几天 / 起点」`                     |

### 7.3 `services/intakeService.ts`（重写）

```ts
export interface CheckInInput {
  date: string
  supplementId: string
  planId: string | null
  timeSlot: TimeSlot
  amount: number
  origin: IntakeOrigin
}

/**
 * 打卡 / 补录 / 手动录入 / 仍要服用的统一写入口。
 *
 * 幂等：同 (date, supplementId, timeSlot) 已存在 taken=true 记录 →
 *       抛 `DUPLICATE_INTAKE`，UI 捕获后提示「今天已打卡」并提供「追加一次」。
 * 余量：taken=true → 扣减（§6.5）。
 */
export async function createIntake(input: CheckInInput): Promise<DailyIntake>

/**
 * 追加一次：跳过幂等检查，origin='extra'。用于「一天吃了两次」。
 * 仍要服用走同一个函数，origin='forced'。
 */
export async function appendIntake(input: CheckInInput): Promise<DailyIntake>

/** 撤销：硬删除 + 余量加回。不弹二次确认（§4.6） */
export async function undoIntake(id: string): Promise<void>

/** 修改记录（数量 / 时段 / 备注）。数量变化时同步调整余量 */
export async function updateIntake(
  id: string,
  patch: { amount?: number; timeSlot?: TimeSlot; notes?: string | null },
): Promise<void>

/** 按日的记录查询（页面用） */
export async function listByDate(date: string): Promise<DailyIntake[]>
```

**幂等错误约定**：抛出的 Error 带 `name = 'DuplicateIntakeError'`，UI 用 `error.name` 判断，避免匹配中文文案。

**余量联动**（全部在同一个事务内）：

```
createIntake:  insert(record)  +  若 taken → stockCount -= amount
appendIntake:  insert(record)  +  若 taken → stockCount -= amount
undoIntake:    delete(record)  +  若 taken → stockCount += amount
updateIntake:  若 amount 变化且 taken → stockCount += oldAmount - newAmount
```

### 7.4 `services/pauseService.ts`（重写）

```ts
/** 临时停药（schemeId = null） */
export async function createPausePeriod(input: PausePeriodCreateInput): Promise<PausePeriod>
export async function updatePausePeriod(id: string, patch: PausePeriodUpdateInput): Promise<void>
export async function deletePausePeriod(id: string): Promise<void>

/** 方案组（M2 界面，M1 只建表与 service） */
export async function listSchemes(): Promise<PauseScheme[]>
export async function createScheme(input: { name; note; entries: PauseEntryInput[] }): Promise<PauseScheme>
export async function updateScheme(id: string, input: {...}): Promise<void>
export async function deleteScheme(id: string): Promise<void>

/**
 * 执行方案组：同一时刻至多一组执行中，执行新组自动结束旧组。
 * 返回被结束的旧组（供 UI 提示「将结束『抗生素期间』」，W-04）。
 */
export async function activateScheme(id: string, date: string): Promise<{ endedScheme: PauseScheme | null }>

/** 停止方案组：记 endedAt，条目立即失效，历史记录不变 */
export async function stopScheme(id: string, date: string): Promise<void>

/** 今日页需要的上下文（periods + schemes Map） */
export async function loadPauseContext(): Promise<PauseContext>
```

**临时停药的必填校验**：`supplementId` 与 `startDate` 均不可为空（跟随方案组的语义只属于方案组条目）。

### 7.5 `services/backfillService.ts`（M2 重写）

```ts
/** 补录窗口内的可选日期范围 */
export function backfillRange(): { min: string; max: string } // 复用 utils/date

/**
 * 单条补录。date 必须在 [today-7, yesterday]。
 * 休息日 / 停用日不允许补录（UI 不入口，service 二次拦截）。
 */
export async function backfillOne(input: {
  date: string
  supplementId: string
  timeSlot: TimeSlot
  amount: number
  taken: boolean // true=已服用（扣余量）；false=标记漏服（不扣）
}): Promise<DailyIntake>

/** 某日可补录的应服项（已排掉休息日 / 停用日 / 已有记录的项） */
export async function listBackfillableItems(date: string): Promise<DayItem[]>
```

**窗口校验**：`date > yesterday()` → `补录不能选择今天或未来`；`date < today()-7` → `补录窗口为最近 7 天`。

### 7.6 `services/importExportService.ts`（新，替代 `importService`）

```ts
export const EXPORT_FORMAT = 'suptrack-export'
export const EXPORT_FORMAT_VERSION = 12

export interface ExportPayload {
  format: typeof EXPORT_FORMAT
  formatVersion: number
  exportedAt: string
  appVersion: string
  meta: Record<string, unknown>
  data: Record<string, unknown[]> // 8 张表的全量数据
}

export async function buildExport(): Promise<ExportPayload>
export async function exportToFile(): Promise<void> // 触发下载 + 写 lastExportAt

/**
 * 覆盖式导入（DIFF-04）。导入前自动导出当前数据作为兜底。
 * 不认识的 format / formatVersion → 抛错，不动数据。
 */
export async function importFromFile(
  file: File,
  options?: { skipBackup?: boolean }, // 测试用
): Promise<{ imported: Record<string, number> }>

/** 清除全部数据（设置页危险区，输入「清除」二次确认后调用） */
export async function clearAllData(): Promise<void> // db.delete() → db.open() → initDefaults()
```

**导入校验顺序**（任一步失败即中止，数据库保持原样）：

```
1. JSON.parse 成功                          → 否则「文件不是有效的 JSON」
2. payload.format === 'suptrack-export'      → 否则「这不是 SupTrack 的备份文件」
3. payload.formatVersion === 12              → 否则「备份文件来自不兼容的版本（v{n}），本版本无法导入」
4. 每张表的数据逐条过对应 Zod Create Schema  → 失败的条目记入 issues 并跳过
5. 事务内：清空 8 张表 → 批量写入 → 写 meta
```

> **不做**：不做旧版本迁移、不做智能合并、不做差异对比。R-14 + DIFF-04。

### 7.7 `services/metaService.ts`（保留）

```ts
export async function get<T>(key: string): Promise<T | undefined>
export async function set(key: string, value: unknown): Promise<void>
export async function getLastExportAt(): Promise<string | null>
export async function getSchemaVersion(): Promise<number>
export async function initDefaults(): Promise<void> // 写 schemaVersion / appVersion
export async function needsBackupRemind(): Promise<boolean> // M3
```

### 7.8 数据钩子（`src/hooks/`）

```ts
/** 今日页：一次性组装清单、分组、统计、预警 */
export function useTodayData(date?: string): {
  date: string
  groups: Array<{ timeSlot: TimeSlot; items: DayItem[]; pendingCount: number; takenCount: number; offCount: number }>
  extraItems: DayItem[]              // 计划外记录
  summary: { pending: number; taken: number; off: number }
  activeScheme: PauseScheme | null    // 顶部提醒条（M2）
  warnings: { negative: Supplement[]; expiring: Supplement[]; lowStock: Supplement[] }
  loading: boolean
  error: Error | null
}

/** 补剂页：补剂 + 其启用计划 + 配置异常标记 + 关联记录数 */
export function useSupplementList(): { rows: SupplementRow[]; loading: boolean }

/** 停药页：方案组 + 临时停药 */
export function usePauseData(): { schemes: PauseScheme[]; periods: PausePeriod[]; loading: boolean }

/** 日历页（M2）：整月日级状态 + 每日明细 */
export function useCalendarMonth(year: number, month: number): {
  days: Array<{ date: string; status: DayStatus; dots: ... }>
  loading: boolean
}

/** 成分汇总（M3） */
export function useIngredientSummary(date: string): { totals: IngredientTotal[]; loading: boolean }
```

**统一约定**：

- 全部用 `useLiveQuery(fn, deps, default)`，deps 里必须带 `useDataVersion(s => s.version)` 以支持跨标签页刷新。
- **初始化竞态防护**：`useLiveQuery` 未就绪时返回 `undefined`，hooks 必须把 `loading` 与之绑定，页面在 `loading === true` 时渲染骨架屏（§8.7）。**不要用 `useState + useEffect` 手写数据获取**。
- 错误：`useLiveQuery` 抛错时用 `error` 字段暴露，页面渲染错误态。

---

## 8. 页面实施规格

> 全部按「PC 优先」：侧栏 220px 固定，内容区最大宽度 **720px** 居中，内部滚动（侧栏不随内容滚动）。
> 窄屏（< 860px）：侧栏收为顶部下拉，内容区占满宽度。不做触摸手势、不做底部 Tab（R-03）。

### 8.1 今日页（`src/pages/today/index.tsx`）· M1 · 最重要的一页

**页面目标**：打开 5 秒内知道今天吃什么，点一下完成记录，不跳转、不滚动。

**结构（自上而下）**：

```
┌─ 标题区 ─────────────────────────────────────────────┐
│ 今天 · 9月20日 周日          [+ 手动录入]（次要按钮）  │
│ 待吃 2 · 已吃 1 · 今天不用吃 2                        │
└──────────────────────────────────────────────────────┘
┌─ 停药提醒条（条件渲染，仅存在执行中的方案组时）M2 ────┐
│ 当前停药方案：抗生素期间（3 项）              [停止]  │
└──────────────────────────────────────────────────────┘
┌─ 预警区（条件渲染，有内容才显示）────────────────────┐
│ 库存为负：X、Y    临期：Z    余量偏低：W              │
└──────────────────────────────────────────────────────┘
┌─ 时段分组 ───────────────────────────────────────────┐
│ 早上        1 待吃 · 1 已吃 · 3 今天不用吃            │
│  ├ 维生素 D3   1 粒 · 余量 34          [打卡]         │
│  ├ 鱼油        2 粒 · 已服用 08:12      [撤销][追加]  │
│  └ ▾ 另有 3 项今天不用吃（含 1 项停用中）              │
│ 睡前        1 待吃                                    │
│  └ 镁片        1 粒 · 余量 12（偏低）   [打卡]         │
└──────────────────────────────────────────────────────┘
┌─ 计划外记录（条件渲染）──────────────────────────────┐
│ 今天额外记了 1 条：鱼油 1 粒 · 追加一次         [撤销] │
└──────────────────────────────────────────────────────┘
```

**四种状态的渲染规范**（P1：必须有独立视觉 + 独立文案）：

| 状态         | 颜色 token     | 图形（前端 DOM） | 文案模板                         | 主操作           | 次要操作             |
| ------------ | -------------- | ---------------- | -------------------------------- | ---------------- | -------------------- |
| **待服用**   | 琥珀 `#F59E0B` | 实心圆点         | `待服用 {n} {unit}`              | **打卡**（实心） | —                    |
| **已服用**   | 绿 `#10B981`   | 实心圆 + 对勾    | `已服用 {n} {unit} · {HH:mm}`    | **撤销**（描边） | 追加一次（文字按钮） |
| **今天休息** | 灰 `#94A3B8`   | 虚线圆           | `今天不用吃 · 下次 {M/d}`        | 无               | 仍要服用（文字按钮） |
| **停用中**   | 紫 `#8B5CF6`   | 斜纹方块         | `停用中 · {reason} · {M/d} 恢复` | 无               | 仍要服用（文字按钮） |

**硬规则落地检查**（实施时逐条对照，这些是验收点）：

| #   | 规则                              | 落地                                                                          |
| --- | --------------------------------- | ----------------------------------------------------------------------------- |
| P1  | 「休息」与「停用」是两个不同的词  | 文案与图形都不同（不只是颜色）                                                |
| P2  | 不吃项必须给出下一个该吃的日期    | `rest` → 「下次 9/22」，加粗                                                  |
| P3  | 休息 / 停用日不产生漏服提醒       | 顶部不出现漏服提示（漏服只在日历体现）                                        |
| P4  | 休息 / 停用日不计入完成度分母     | 标题统计行「待吃 2 · 已吃 1 · 今天不用吃 2」——第三个数字独立，不进分母        |
| P5  | 休息 / 停用期仍允许记录，不弹确认 | 「仍要服用」直接调用 `appendIntake({origin:'forced'})`，无 Dialog、无 confirm |
| P6  | 计划关闭 ≠ 节奏休息               | 无启用计划的补剂**不出现**在今日页（不是显示「休息」）                        |

**密集折叠**（W-01 拍板）：

- 同一时段内 `state ∈ {rest, paused}` 的项合计 **≥ 3** → 折叠为一行：
  `▾ 另有 N 项今天不用吃（含 M 项停用中）`
- `pending` 与 `taken` **永不折叠**
- 展开后逐条显示完整文案（含下次日期 / 恢复日）
- 折叠状态为组件局部 state，不持久化，默认折叠

**打卡交互（5 秒闭环的核心）**：

```
点击 [打卡]
  ├─ 按钮立即进入 disabled + 加载中（局部，不阻塞整页）
  ├─ 成功 → 该行原地变「已服用 · HH:mm」，按钮变 [撤销]，余量数字立刻变化
  │        顶部统计同步更新（pending -1, taken +1）
  │        不跳转、不滚动、不弹窗；toast 可省（行本身已是反馈）
  └─ 失败 DUPLICATE_INTAKE → 行内提示「今天已打卡」+ [追加一次] 按钮
     原地展开，不进 Dialog
```

**三种空状态**（不能共用同一句话）：

| 场景       | 判定               | 文案                                                      | 动作                                                      |
| ---------- | ------------------ | --------------------------------------------------------- | --------------------------------------------------------- |
| 首次使用   | 无任何补剂         | `还没有要吃的补剂` / `先添加一个补剂，再设置它的服用节奏` | 主按钮「添加补剂」→ 跳 `/supplements?new=1` 并打开 Dialog |
| 全部关闭   | 有补剂但无启用计划 | `所有补剂都已停用` / `启用的计划才会出现在这里`           | 次要按钮「去补剂页看看」                                  |
| 时段无内容 | 某时段无项         | 该时段 Card 不渲染（不是显示空状态）                      | —                                                         |

**加载 / 错误态**：

- `loading` → 骨架屏（3 行灰条），**超过 300ms 才显示**（避免快时闪屏）
- `error` → 错误态卡：`数据读取失败` + `本地数据库可能被其他标签页占用。你的数据没有丢失。` + [重试] + [导出备份]

**不做**（写进代码注释，避免后人"顺手加上"）：

- ❌ 日期切换（回看是日历页职责）
- ❌ 完成度百分比 / 进度环
- ❌ 庆祝动效、连续打卡天数、健康评分
- ❌ 「今天先不吃」快捷入口（W-09：M1 不做，且整轮不做）

### 8.2 补剂页（`src/pages/supplements/index.tsx`）· M1

**这一页合并了原「服用计划」页**——节奏是计划的属性，但用户心智里它就是「这个补剂怎么吃」。

**列表列定义**：

| 列     | 来源                        | 说明                                            |
| ------ | --------------------------- | ----------------------------------------------- |
| 名称   | `supplement.name`           | —                                               |
| 每次量 | `plan.amountPerTime` + 单位 | 无启用计划显示 `—`                              |
| 节奏   | `describeRate(plan)`        | **用户语言**：「隔天」「吃 5 停 2」，不暴露参数 |
| 时段   | `plan.timeSlots` 映射标签   | 多时段用 `早 + 晚`                              |
| 余量   | `supplement.stockCount`     | 空显示 `—`；负数红色；偏低显示 `12（偏低）`     |
| 状态   | `plan.isActive`             | 启用 / 已关闭 / 配置异常                        |
| 操作   | —                           | 编辑 / 删除；配置异常时为「修正」               |

**「配置异常」行**（R-08 的落地，独立视觉状态）：

- 暖底（`bg-amber-50`）+ 加粗提示「配置异常，请修正」
- 该补剂**仍然出现在今日页**并判为「该吃」
- 主操作由「编辑」换成「修正」，点击直达 Dialog 的节奏区

**新增 / 编辑 Dialog**（`components/supplement/SupplementDialog.tsx`，宽 560px）：

字段顺序（W-06 拍板：9 字段平铺，不做折叠）：

```
名称 *                     [input]
单位 *                     [select：胶囊/片/粒/颗粒/袋/支/ml/g/勺/滴]
每次服用量 *               [number, ≥1]
余量（可留空）             [number]    留空 = 不记录余量
服用时段 *                 [4 个可多选 chip：早上 中午 晚上 睡前]
   提示：一天吃两次就选两个时段，不要建两条计划
服用节奏 *                 [4 段控件：每天 隔天 每 N 天一次 吃 N 停 M]
   ├ 选「每 N 天一次」→ 展开 [每 __ 天]（N≥2）
   ├ 选「吃 N 停 M」 → 展开 [吃 __ 天] [停 __ 天]
   └ 选 cyclic 任一 → 展开 [起点 *]（默认今天）
       提示：起点之前该补剂不出现，不报错
过期日（可留空）           [date]
备注（可留空）             [input]
启用这个计划               [checkbox，默认勾选]
```

**表单行为**：

| 情况                            | 行为                                                  |
| ------------------------------- | ----------------------------------------------------- |
| 时段一个都没选                  | 保存时行内报错「请至少选择一个服用时段」，不关 Dialog |
| 选 cyclic 但 on/off/anchor 缺失 | 「节奏参数不完整，请补齐」                            |
| 该补剂已有启用计划              | 保存走更新现有计划（DIFF-02），不报错                 |
| 「每 N 天一次」的 N             | 输入 2 → `on=1, off=1`；输入 3 → `on=1, off=2`        |
| 取消勾选「启用这个计划」        | `isActive=false`，今日页不再出现，历史记录保留        |

**删除确认 Dialog**（`DeleteSupplementDialog.tsx`）：

- 标题：`删除补剂`
- 正文：`将删除 维生素 D3、它的计划，以及 {N} 条历史记录。` ← **N 必须实时算出**（`countRelatedRecords`）
- 勾选项：`[✓] 同时删除该补剂的 {N} 条历史记录`（**默认勾选**，需求 §6.9）
  - 副文案：`取消勾选则保留历史记录，但补剂会被隐藏，成分汇总里这些记录将无法解析来源。`
- 提示：`建议先导出备份再删除。` + [前往导出] 链接
- 按钮：`[取消] ... [删除]（红色实心）`，右对齐两段式

### 8.3 停药页（`src/pages/pausePeriods/index.tsx`）· M1 临时 / M2 方案组

**两个分区并列**（不藏进 Tab），M1 就先渲染出「方案组」分区骨架（空状态 + 入口），避免 M2 再改信息架构。

```
┌─ 停药方案组（M2）────────────────────────────────────┐
│ ● 抗生素期间  [执行中]                                │
│   覆盖 3 项 · 9/18 起 · 未设结束日      [停止] [编辑] │
│ ○ 服用碘剂前后                                        │
│   覆盖 2 项 · 已停止                    [执行] [编辑] │
└──────────────────────────────────────────────────────┘
┌─ 临时停药 ─────────────────────────── [＋ 加一条停药] ┐
│ 鱼油        9/19 → 9/21 · 原因：胃不舒服  [编辑][删除]│
│ 全部补剂    9/25 起 · 持续中（未设结束日） [编辑][删除]│
└──────────────────────────────────────────────────────┘
```

**判定规则（写进代码，不靠 UI 表达）**：

| 规则                                           | 落地位置                                                     |
| ---------------------------------------------- | ------------------------------------------------------------ |
| `start ≤ 该日 ≤ (end ?? +∞)` 即停用            | `utils/pause.ts::coversDate`                                 |
| 与节奏重叠时**停用优先**                       | `utils/dayState.ts` 判定顺序                                 |
| 与方案组并用取**并集**                         | `utils/pause.ts::findActivePauses`                           |
| 修改停药参数**只影响未来判定，已产生记录不变** | 无特殊代码（记录独立存储），但**编辑 Dialog 必须提示这句话** |

**「加一条临时停药」Dialog**：

```
停哪个 *        [select：补剂列表，末尾分隔线后为「全部补剂」]
从哪天开始 *    [date，默认今天]
到哪天结束      [date]   留空 = 持续中，今日页显示「停用中 · 持续中」
                         标签写「到哪天为止（含当天）」（DIFF-05）
原因（可留空）  [input]  占位符：帮未来的你想起为什么停
```

**「同一时刻至多一组执行中」**：`activateScheme` 的语义保证。执行新组时弹**轻确认**（W-04）：`执行「服用碘剂前后」将结束当前执行中的「抗生素期间」，确认？`

**「全部补剂」**：`supplementId === 'ALL'` 的条目，渲染成一行「全部补剂」。**不单独做一个「全局停药」开关**（两个入口表达同一件事会让人分不清）。

### 8.4 日历页（`src/pages/calendar/index.tsx`）· M2

**左右并排**（PC 优先，不需要抽屉）：左侧月历，右侧详情常驻。

**月历格**：

- 每格显示日期数字 + 最多 **3 个状态点**（W-05），超出显示 `+N`
- 状态点颜色沿用四态色
- **今日用边框加粗**（不用填充色，避免与「已服用」的绿色填充混淆）
- 未来日期灰显、不可点
- 顶部：`‹ 2026 年 9 月 ›` + [回到今天]

**日级状态 → 视觉映射**：

| `DayStatus` | 视觉       | 图例文案 |
| ----------- | ---------- | -------- |
| `done`      | 绿色实心   | 已服用   |
| `partial`   | 绿色半填充 | 部分完成 |
| `missed`    | 橙/红描边  | 漏服     |
| `rest`      | 灰色       | 今天休息 |
| `paused`    | 紫色       | 停用     |
| `empty`     | 无标记     | —        |

**右侧详情**：

- 标题：`9 月 19 日 周六` + 统计 `已吃 1 · 停用 2`
- 逐条列出该日补剂与状态文案（与今日页同一套文案组件）
- 底部按条件渲染补录入口：

| 条件                                  | 显示                              |
| ------------------------------------- | --------------------------------- |
| 在过去 7 天内 **且** 有可补录的应服项 | `[+ 补录一条]`                    |
| 超过 7 天                             | `超出补录窗口`（无按钮）          |
| 该日为休息日                          | `今日休息`（无补录入口）          |
| 该日为停用日                          | `停用中 · X 日恢复`（无补录入口） |

**漏服自动推导**：不存字段，`resolveDayStatus(items) === 'missed'` 即漏服。**这条要写进测试用例**。

### 8.5 成分库（`src/pages/ingredients/index.tsx`）· M3

**列表**：

| 列         | 说明                  |
| ---------- | --------------------- |
| 成分名     | —                     |
| 单位       | mg / μg / g / IU / ml |
| 参考摄入量 | 用户自填；空显示 `—`  |
| 上限       | 用户自填；空显示 `—`  |
| 来源补剂   | `N 个`，**可点开**    |
| 操作       | 编辑                  |

**「来源补剂」展开内容**（发现重复成分的唯一入口）：

```
维生素 D3 被以下补剂包含：
  · 维生素 D3 胶囊 · 每份 1000 IU · 生效 9/1 起（当前有效）
  · 复合维生素   · 每份 400 IU  · 生效 9/15 起（当前有效）
```

**编辑 Dialog**：

```
成分名 *          [input]   提示：跨补剂归并按名称匹配，请与瓶子上的写法保持一致
单位 *            [select]  提示：IU 与 ml 独立累加，不与 μg 混算
参考摄入量        [number]  留空 = 不做比较
上限              [number]  留空 = 不显示
备注（可留空）    [input]
```

- **单位存储统一 μg**：用户输入 `mcg` 自动转 `μg`（`MCG_ALIAS`）
- **改名提示**（W-08）：保存时若已有 N 个补剂关联 → 提示 `已有 N 个补剂关联此成分，改名后仍指向同一成分`（提示但不用警告色，因为关联走 `ingredientId`）
- **系统不预置任何默认阈值**——留空即「不比较」

**配方变更（补剂 ↔ 成分关联）**：写在**补剂编辑 Dialog 内**，不单独开页面。

| 操作       | 行为                                                                   |
| ---------- | ---------------------------------------------------------------------- |
| 「改配方」 | 不修改原记录：原记录 `effectiveTo = 昨天`，新建 `effectiveFrom = 今天` |
| 回看历史   | 汇总按 `record.date` 匹配当时配方 → 历史数字不因今天改配方而变动       |
| 已失效记录 | 保留可见但降饱和（用户需要看到「改过配方」，不是被删掉痕迹）           |

### 8.6 设置页（`src/pages/settings/index.tsx`）· M1 导出 / M3 完善

```
┌─ 数据 ───────────────────────────────────────────────┐
│ [导出 JSON]  [导入 JSON]                              │
│ 上次导出：2026-09-18 21:03        ← 必须显示          │
│ 导入将清空当前数据并替换为备份内容（导入前会自动备份） │
└──────────────────────────────────────────────────────┘
┌─ 危险区 ─────────────────────────────────────────────┐
│ 清除全部数据   需输入「清除」二次确认，且不可恢复      │
└──────────────────────────────────────────────────────┘
┌─ 关于 ───────────────────────────────────────────────┐
│ 版本 0.2.0（来自 import.meta.env.VITE_APP_VERSION）   │
│ 全部数据只存在本机浏览器，不上传、不联网、不收集信息   │
│ 本应用是记录工具，不是医疗建议。                        │
│ 删除后无法恢复，请定期导出备份。                        │
└──────────────────────────────────────────────────────┘
```

**必须做**：

- 「上次导出时间」常驻显示（让「多久没备份」可感知）
- 清除数据用**输入文字二次确认**（输入「清除」），不用普通 confirm——破坏面太大
- 备份提醒（M3）：距上次导出 > 30 天时，在今日页顶部显示一条可关闭提示

**不做**：M1 不放任何开关（默认时段 / 日期格式 / 是否显示余量）——每个设置项都是一个需要维护的决策。

### 8.7 通用状态规范（`src/components/common/`）

**这四种状态在每个页面都要有，最容易在开发时被漏掉。交付前逐个核对。**

| 状态         | 组件              | 规范                                                                                                                                                                    |
| ------------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **加载中**   | `LoadingSkeleton` | **骨架屏，不用 spinner**。保留页面结构感，避免闪白屏。**超过 300ms 才显示**                                                                                             |
| **出错**     | `ErrorState`      | 必须给**原因 + 重试**，不能只说「出错了」。文案区分「数据可能丢了」与「数据还在」：`数据读取失败 / 本地数据库可能被其他标签页占用。你的数据没有丢失。[重试] [导出备份]` |
| **空状态**   | `EmptyState`      | **三种，文案不同**：首次使用 / 筛选无结果 / 全部关闭。见 §8.1                                                                                                           |
| **断网**     | `OfflineBanner`   | 可关闭的提示条，**不阻塞、不弹窗、不遮罩**：`未联网 · 功能不受影响，数据仍存在本机`                                                                                     |
| **多标签页** | 已有机制          | 一边打卡，另一边自动刷新（`broadcast.ts` + `dataVersion`），不需要新增机制                                                                                              |

### 8.8 错误边界（`components/ErrorBoundary/index.tsx`）

改造为：

- 捕获渲染错误后显示错误态卡，而非白屏
- 提供 **[重新加载]** 与 **[导出备份]** 两个动作（万一真坏了，用户至少能把数据抢救出来）
- 保留错误详情折叠区（`<details>`），供排查

---

## 9. M1 任务清单

> **M1 结束时，新应用就可以替换掉现有应用。** 这是整个路径最重要的一点。
> 每个任务的 DoD 全部达成才能标记完成；完成前跑 `pnpm typecheck && pnpm test`。

### 阶段 A · 清场（先删后建）

#### T-101 删除不再需要的模块

**目标**：把范围声明变成物理事实，避免旧代码泄露到新模型。

| 动作   | 目标                                                                                                                                                                                                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 删目录 | `src/pages/plans/`、`src/components/recycle/`、`src/components/backfill/MissedPlansBanner.tsx`、`src/db/migrations/`                                                                                                                                                                             |
| 删文件 | `services/stockService.ts`、`services/importService.ts`、`repositories/stockLogRepository.ts`、`schemas/stockLog.ts`、`schemas/bodyFeedback.ts`、`constants/stockState.ts`、`constants/deletedAt.ts`、`utils/completion.ts`、`utils/merge.ts`、`utils/missedCache.ts`、`hooks/useMissedPlans.ts` |
| 删测试 | 随源文件一并删除对应 `src/test/**` 用例                                                                                                                                                                                                                                                          |

**DoD**：`pnpm typecheck` 报出的错误只来自**将要重写**的文件（`types/index.ts` / `db/schema.ts` / 各 repository / 各 page / schemas），不来自"应该已删除"的引用。

---

### 阶段 B · 数据层

#### T-102 重写 `types/index.ts` 与 `constants/enums.ts`

- 按 §5.2 实现 8 个接口，按 §5.4 实现枚举与阈值常量
- 删除 `INTAKE_STATUS` / `CYCLE_MODE` / `SUPPLEMENT_STATUS` / `STOCK_LOG_REASON` / `PLANNED_AMOUNT_SOURCE` / `DeletedAt` / `StockState`
- `constants/units.ts` 保留不动（`UNIT_TYPE` / `INGREDIENT_UNIT` / `TO_MICROGRAM` 已符合要求）

**DoD**：`enums.ts` 中不再出现「status」「source」「cycleMode」相关导出；`ALL_SUPPLEMENTS` / `LOW_STOCK_DAYS` / `DENSE_COLLAPSE_THRESHOLD` 等新常量就位。

#### T-103 重写 Dexie schema

- 按 §5.3 实现；`DB_NAME = 'suptrack-v12'`
- 8 张表一次性建好（含 M3 的两张，避免 M3 再次升 schema）
- 索引注释写清「boolean 不可索引」的原因

**DoD**：浏览器 DevTools → Application → IndexedDB 中可见 `suptrack-v12` 库与 8 张表；旧库 `suptrack` 不再被读写。

#### T-104 重写 Zod schemas

- 按 §5.5 实现 7 个实体的 Create / Update
- `common.ts` 移除 `DeletedAtSchema`
- 补齐 §5.5 列出的全部 refine

**DoD**：`src/test/schemas/` 下每个 schema 至少有一个"非法输入被拒"的用例。

---

### 阶段 C · 纯函数算法（先写测试）

#### T-105 `utils/date.ts` 扩展 + 修正 `shiftDays`

- 按 §6.1 实现；**删除 `shiftDays`**，新增 `addDays` / `diffCalendarDays` / `formatDateLabel` / `formatShortDate`
- `backfillRange()` 改为无参（固定 7 天）

**DoD**：全仓库 grep `shiftDays` 无结果；`addDays('2026-09-30', 1) === '2026-10-01'`（跨月用例）。

#### T-106 `utils/rate.ts`（新）★

- 实现 `matchesRate` / `nextRateDate` / `rateDensity` / `describeRate` / `isRateConfigValid` / `RATE_PRESETS`
- **先写 `src/test/utils/rate.test.ts`**，覆盖 §6.2 全部边界用例

**DoD**：`pnpm test rate` 全绿；`describeRate` 对 `on=1,off=1` 返回「隔天」而非「每 2 天一次」。

#### T-107 `utils/dayState.ts`（新）★

- 实现 `resolveDayItems` / `resolveDayStatus`
- **先写 `src/test/utils/dayState.test.ts`**，覆盖 §6.4 全部边界用例

**DoD**：判定优先级测试通过（含「停用期有记录 → taken + offScheduleTake」这条关键用例）。

#### T-108 `utils/pause.ts`（重写）★

- 按 §6.3 实现；删除 `cycleMode` 相关分支
- `resumeDate = addDays(endDate, 1)`（DIFF-05）

**DoD**：§6.3 的生效区间规则表 5 行全部有用例覆盖；`'ALL'` 条目命中任意补剂。

---

### 阶段 D · 仓储与服务层

#### T-109 重写仓储层

| 文件                                                            | 要点                                                                                                                                                                                          |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repositories/base.ts`                                          | **去掉软删除**：`all` / `get` / `insert` / `bulkInsert` / `update` / `remove`（替代 `softDelete`/`restore`/`purge`）                                                                          |
| `dailyIntakeRepository.ts`                                      | 新增 `listByDate(date)`（用 `[date+supplementId]` 或 `where('date').equals(date)`）、`findActive(date, supplementId, timeSlot)`、`listByDateRange`、`countBySupplement`、`deleteBySupplement` |
| `dosagePlanRepository.ts`                                       | 新增 `listActive()`、`getActiveBySupplement(id)`、`deleteBySupplement(id)`、`countBySupplement(id)`                                                                                           |
| `pausePeriodRepository.ts`                                      | 新增 `deleteBySupplement(id)`（**不含 `'ALL'`**）                                                                                                                                             |
| `pauseSchemeRepository.ts`                                      | 新建：`all` / `get` / `insert` / `update` / `remove` / `getActiveScheme()`                                                                                                                    |
| `ingredientRepository.ts` / `supplementIngredientRepository.ts` | 搬，去掉 `deletedAt` 过滤                                                                                                                                                                     |

**DoD**：`repository.test.ts` 重写通过；grep `deletedAt` 在 `src/` 下无结果（R-04）。

#### T-110 `services/metaService.ts` 适配

- 保留 `get` / `set` / `initDefaults` / `getSchemaVersion`
- 新增 `getLastExportAt()` / `needsBackupRemind()`
- `META_KEY` 移除 `BACKFILL_WINDOW_DAYS`（改常量）

#### T-111 `services/supplementService.ts`（新）

- 按 §7.1 实现，含 `deleteSupplement` 的级联规则与 `countRelatedRecords`
- 全部在事务内

**DoD**：测试覆盖「删除补剂且 deleteRecords=true → 计划与记录全消失、`'ALL'` 停药条目保留」；「deleteRecords=false → 记录保留、计划消失」。

#### T-112 `services/planService.ts`（新）

- 按 §7.2 实现，含 DIFF-02 唯一性拦截

**DoD**：测试覆盖「同补剂连续保存两次计划 → 只有一条启用计划」。

#### T-113 `services/intakeService.ts`（重写）★

- 按 §7.3 实现，含幂等（`DuplicateIntakeError`）与余量联动
- **注意**：旧实现里 `mode` 参数（today/backfill/update）的日期校验迁移到 `backfillService`，`createIntake` 不再需要 mode

**DoD**：测试覆盖 §12.2 的 intake 用例组，特别是「重复打卡被拒且不产生第二条记录」「撤销后余量精确加回」。

#### T-114 `services/pauseService.ts`（重写）

- 按 §7.4 实现；`activateScheme` 的"至多一组"语义
- `loadPauseContext()` 返回 `PauseContext`

**DoD**：测试覆盖「执行新组自动结束旧组」「临时停药 startDate 必填校验」。

#### T-115 `services/importExportService.ts`（新）

- 按 §7.6 实现；导出格式带 `format` + `formatVersion`
- 导入只做覆盖，导入前强制备份

**DoD**：测试覆盖「formatVersion 不匹配 → 抛错且数据不变」「导出 → 清空 → 导入 → 数据完整还原」。

---

### 阶段 E · Hooks 与页面

#### T-116 Hooks 层

- `useTodayData` / `useSupplementList` / `usePauseData` 按 §7.8 实现
- 全部带 `useDataVersion` 依赖

**DoD**：跨标签页打开两个实例，一边打卡，另一边 1 秒内自动刷新。

#### T-117 通用状态组件

- 按 §8.7 实现 4 个组件（`LoadingSkeleton` / `ErrorState` / `EmptyState` / `OfflineBanner`）
- `ConfirmDialog` 三档强度封装（轻 / 中 / 重）

#### T-118 今日页（重写）★

- 按 §8.1 实现；`DayListItem` 抽成独立组件
- 四态渲染表、密集折叠、三种空状态、5 秒闭环

**DoD**：

- 单行打卡不引起整页重排（视觉上按钮位置不动）
- 休息 / 停用行显示下次日期 / 恢复日
- 8 个补剂同屏时休息 + 停用项自动折叠

#### T-119 补剂页（重写）

- 按 §8.2 实现；`SupplementDialog` / `DeleteSupplementDialog` 抽成组件
- 删除确认框里的 N 实时计算

#### T-120 停药页（重写）

- 按 §8.3 实现；M1 渲染方案组分区骨架（空状态 + 说明文字）
- 临时停药 CRUD 可用

#### T-121 设置页（重写）

- 按 §8.6 实现；导出 / 导入 / 清除（输入「清除」）/ 关于 / 上次导出时间

#### T-122 导航与路由（`AppShell.tsx` / `routes/index.tsx`）

- 导航项：**今日 / 补剂 / 停药 / 设置**（M1 只这 4 项，日历与成分库在对应里程碑再加）
- 侧栏 220px 固定；内容区最大宽度 720px 居中
- 窄屏（< 860px）侧栏收为顶部下拉
- 路由移除 `/plans`
- 补剂页支持 `?new=1` 查询参数自动打开新增 Dialog（供今日页空状态跳转）

**DoD**：M1 阶段导航无「点不进去的死链」。

---

### 阶段 F · 验收准备

#### T-123 `docs/DECISIONS.md`（新建）

记录 §5.7 的 5 条实现化偏离，格式：

```markdown
| 编号    | 需求文档原文 | 本实施 | 理由 | 日期       |
| ------- | ------------ | ------ | ---- | ---------- |
| DIFF-01 | ...          | ...    | ...  | 2026-09-20 |
```

**DoD**：5 条 DIFF 全部记录；后续若产生新偏离，在同一文件追加。

#### T-124 M1 回归

- 补齐 §12 列出的 M1 测试用例
- 跑 §13.3 的 M1 验收判据（含 §13.2 走查第 1–16 步）
- 输出完成报告（§15.3）

**DoD**：`pnpm typecheck && pnpm lint && pnpm test && pnpm build` 全绿；走查 16 步全通过。

#### T-125 M1 提交

- commit message：`feat(m1): 核心闭环 —— 四态清单 + 打卡撤销 + 节奏计划（换心脏留脚手架）`
- 在完成报告中列出：新增/重写/删除的文件清单、跑过的验收步骤、遗留问题

---

## 10. M2 任务清单

> **前置条件**：M1 已通过 §13.3 全部判据。

#### T-201 `utils/intakeFactory.ts` 适配

按新字段（`amount` / `taken` / `origin`）重写 `buildIntake`，供补录与手动录入复用。

#### T-202 `services/backfillService.ts`（重写）

按 §7.5 实现：`backfillOne` / `listBackfillableItems` / `backfillRange`。

- 窗口固定 7 天，不含今天
- 休息日 / 停用日不允许补录（service 层二次拦截，不只靠 UI 不入口）

**DoD**：补录昨天成功；补录今天抛错；补录 8 天前抛错；对休息日调 `backfillOne` 抛错。

#### T-203 `hooks/useCalendarMonth.ts`

按 §7.8 实现：整月每日 `DayStatus` + 标记点（最多 3 个 + `+N`）。

- 用 `resolveDayItems` + `resolveDayStatus` 逐日推导，不查存储字段

#### T-204 日历页（重写）

按 §8.4 实现：月历 + 右侧详情常驻 + 三种补录入口条件渲染。

- 今日用**边框加粗**，不用填充色
- 未来日期灰显不可点

**DoD**：翻到上月能看到 `missed` / `paused` / `rest` / `done` 四种状态并存且可辨。

#### T-205 补录 Dialog（重构）

```
日期        [date picker，限 [today-7, yesterday]]
补剂 *      [select：仅列该日可补录的应服项]
时段 *      [select]
状态        ( ) 已服用   ( ) 漏服
数量        [number，默认取计划量]
```

- 「已服用」→ `taken=true, origin='backfill'`，扣余量
- 「漏服」→ `taken=false, origin='backfill'`，不扣余量

**DoD**：补录「漏服」后，该日 `DayStatus` 变 `missed`，且成分汇总不计入（M3 交叉验证）。

#### T-206 方案组 CRUD

`createScheme` / `updateScheme` / `deleteScheme` + `PauseSchemeDialog`（按 §8.3 的编辑区）。
每条目一行，**「跟随方案」与「独立起止」必须行内可见**（这是全篇最容易混淆处）。

#### T-207 方案组执行 / 停止

`activateScheme`（含轻确认提示将结束哪一组）/ `stopScheme`。
**DoD**：执行新组后旧组 `isActive=false` 且 `endedAt` 有值；旧组的历史记录不变。

#### T-208 今日页 · 停药提醒条

`PauseSchemeBanner`：仅在存在执行中的方案组时渲染，显示 `当前停药方案：{name}（{N} 项）` + [停止]。
**W-03：点空白区不跳转。**

#### T-209 「仍要服用」

今日页休息 / 停用行的次要入口，调用 `appendIntake({ origin: 'forced' })`。

- 无 Dialog、无 confirm（P5）
- 记录行标注来源：`计划外服用`（`offScheduleTake`）

**DoD**：停用期点「仍要服用」后，该行变「已服用 · HH:mm · 停用期服用」，且不计入完成度分母。

#### T-210 M2 测试补齐

日历推导、补录窗口、方案组语义三组用例。

#### T-211 导航更新

导航加入「日历」（第 4 项，设置之前）。

#### T-212 M2 提交

`feat(m2): 回看与补录 —— 日历四态 + 7 天补录 + 停药方案组`
跑 §13.3 的 M2 判据。

---

## 11. M3 任务清单

> **前置条件**：M2 已通过全部判据。

#### T-301 成分表与仓储（适配）

`ingredientRepository` / `supplementIngredientRepository` 去软删除 + 加 `effectiveAt(supplementId, date)` 查询。

#### T-302 `services/summaryService.ts`（重写）★

按 §6.6 实现四条口径。
**关键改动**：删除旧实现的 `text-destructive` 超限变红逻辑（R-02 正面命中）。

**DoD**：测试覆盖 §13.2 走查第 17–21 步对应的逻辑断言。

#### T-303 补剂-成分关联 UI

写在**补剂编辑 Dialog 内**（新 section「包含成分」）：

- 列表：成分 / 每份含量 / 生效区间 / 操作
- 「改配方」按 §8.5 的写入规则（原记录 `effectiveTo=昨天`，新建 `effectiveFrom=今天`）
- 已失效行保留可见但降饱和

#### T-304 成分库页（重写）

按 §8.5 实现：列表 + 来源追溯展开 + 编辑 Dialog（mcg→μg 转换、改名提示）。

#### T-305 今日页 · 成分汇总卡

按 §6.6 输出渲染：

```
维生素 D3
参考值 800 / 今日 1400 IU
来源：维生素 D3 胶囊 1000 + 复合维生素 400
```

**红线**：无进度条、无超限着色、无告警图标、无结论性措辞。
空数据显示 `今日记录的补剂尚未关联成分`。

#### T-306 今日页 · 预警区

按 §6.5 实现三类预警：库存为负 / 临期（30 天）/ 余量偏低（≤5 天日均）。
**DoD**：三类同时存在时逐行显示，不合并成一句话。

#### T-307 备份提醒

`metaService.needsBackupRemind()`：距 `lastExportAt` > 30 天 → 今日页顶部可关闭提示条。
从未导出过 → 也提示。

#### T-308 设置页完善

补「数据统计」（各表条数）。**不放任何开关**（不做默认时段 / 日期格式等配置）。

#### T-309 导航更新

导航加入「成分库」（第 5 项）。

#### T-310 M3 测试补齐 + 提交

`feat(m3): 增值 —— 成分库与每日汇总 + 余量过期提醒 + 备份提醒`
跑 §13.3 的 M3 判据与走查第 17–21 步。

#### T-311（可选，最低优先级）统计图表

需求 §8.2 明确「随便挑一个砍掉，不影响 M1/M2 使用」。**若时间紧张直接跳过，并在完成报告中记为「未实施，符合需求允许范围」。**

---

## 12. 测试规格

### 12.1 原则

| 项         | 规则                                                                        |
| ---------- | --------------------------------------------------------------------------- |
| 环境       | `environment: 'node'` + `fake-indexeddb/auto`（`src/test/setup.ts` 已配置） |
| 每个测试前 | `await db.delete(); await db.open(); await metaService.initDefaults()`      |
| 优先测什么 | **纯函数 > service > schema > 组件**。不要写组件快照测试                    |
| 命名       | `describe('模块名')` + `it('中文行为描述')`                                 |
| 断言什么   | 状态、数量、余量数值、抛错信息。**不要断言 DOM 结构**                       |

### 12.2 必写用例清单

**`test/utils/rate.test.ts`**（§6.2 全部 11 条边界）
**`test/utils/pause.test.ts`**（§6.3 全部 5 条区间规则 + 5 条边界）
**`test/utils/dayState.test.ts`**（§6.4 全部 14 条边界，含优先级与日级状态）
**`test/utils/date.test.ts`**（`addDays` 跨月 / 跨年、`diffCalendarDays` 正负、`formatShortDate`）

**`test/services/intakeService.test.ts`**：

| 用例               | 断言                                                |
| ------------------ | --------------------------------------------------- |
| 打卡成功           | 记录入库，`taken=true`，`origin='checkin'`，余量 -N |
| 重复打卡           | 抛 `DuplicateIntakeError`，记录数不变，余量不变     |
| 追加一次           | 同键第二条记录，`isExtra=true`，余量再 -N           |
| 撤销打卡记录       | 记录消失，余量精确加回                              |
| 撤销漏服记录       | 记录消失，**余量不变**                              |
| 修改数量           | 余量按差额调整（+old-new）                          |
| 余量为 null 时打卡 | 不抛错，余量保持 null                               |
| 余量为 0 时打卡    | 余量变负数，不拦截                                  |
| 不存在 id 撤销     | 抛「记录不存在」                                    |

**`test/services/supplementService.test.ts`**：

| 用例                  | 断言                                               |
| --------------------- | -------------------------------------------------- |
| 删除补剂 + 删记录     | 补剂 / 计划 / 记录全消失；`'ALL'` 停药条目**保留** |
| 删除补剂 + 不删记录   | 补剂 / 计划消失；记录保留                          |
| `countRelatedRecords` | 与实际记录数一致                                   |

**`test/services/planService.test.ts`**：

| 用例               | 断言                         |
| ------------------ | ---------------------------- |
| 同补剂保存两次计划 | 只有一条 `isActive=true`     |
| 时段为空           | 抛「请至少选择一个服用时段」 |
| cyclic 参数缺失    | 抛「节奏参数不完整」         |

**`test/services/pauseService.test.ts`**：

| 用例                    | 断言                                    |
| ----------------------- | --------------------------------------- |
| 执行新方案组            | 旧组 `isActive=false` 且 `endedAt` 有值 |
| 停止方案组              | 条目立即失效；历史记录不变              |
| 临时停药 startDate 为空 | 抛错                                    |

**`test/services/importExportService.test.ts`**：

| 用例                 | 断言                     |
| -------------------- | ------------------------ |
| 导出 → 清空 → 导入   | 8 张表条数与内容完全还原 |
| formatVersion 不匹配 | 抛错，数据库内容不变     |
| format 字段缺失      | 抛错                     |

**`test/services/summaryService.test.ts`**（M3）：

| 用例              | 断言                                                                     |
| ----------------- | ------------------------------------------------------------------------ |
| 只统计 taken=true | `taken=false` 的记录不计入                                               |
| 跨补剂归并        | 两个含 D3 的补剂合计正确                                                 |
| 单位归一          | `mg` 与 `μg` 混用后合计正确（归一 μg）                                   |
| IU 与 ml 独立     | 不出现在同一行，不互相累加                                               |
| 按当日配方        | 改配方后回看昨天仍是旧值                                                 |
| **无结论性措辞**  | 输出对象中不存在 `level` / `overLimit` / `warning` 之类字段（R-02 断言） |

### 12.3 测试不要写什么

| ❌ 不要                   | 原因                                     |
| ------------------------- | ---------------------------------------- |
| `render()` 组件快照       | 只定结构不定视觉，快照维护成本高、误报多 |
| 对 IndexedDB 内部结构断言 | 换 schema 就全红                         |
| 断言中文文案的完整字符串  | 文案会调，断言用 `toThrow(/关键词/)`     |
| 为覆盖率而写的空测试      | 分母游戏，无价值                         |

---

## 13. 验收执行手册

### 13.1 命令清单

```bash
# 每个任务完成后
pnpm typecheck && pnpm test

# 每个里程碑结束时
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

### 13.2 人工走查 21 步

> 第 1–16 步属 M1，第 17–21 步属 M3。**逐条执行，不要跳。**

| #   | 步骤                                                        | 期望                                                                   | 里程碑 |
| --- | ----------------------------------------------------------- | ---------------------------------------------------------------------- | ------ |
| 1   | 建补剂 A，节奏＝隔天，锚点＝今天                            | A 出现在今日页，显示「待服用」                                         | M1     |
| 2   | 查看明天                                                    | A 显示「今天不用吃 · 下次 X 日」，**不出现「停药中」**                 | M1     |
| 3   | 建补剂 B，节奏＝吃 5 停 2                                   | 第 6、7 天显示「今天不用吃」                                           | M1     |
| 4   | 锚点设为未来日期                                            | 锚点之前**不出现**该补剂，不报错                                       | M1     |
| 5   | 同一补剂同时段建第二条计划                                  | **被阻止**，提示已有计划，请合并或改时段                               | M1     |
| 6   | 今日页打卡 A                                                | 行变「已服用」，余量减少，可撤销                                       | M1     |
| 7   | 再次点击打卡                                                | 提示「今天已打卡」，提供「追加一次」                                   | M1     |
| 8   | 点撤销                                                      | 记录删除，**余量加回**，无需二次确认                                   | M1     |
| 9   | 给 A 建停药期覆盖明天，查看明天                             | 显示「停用中 · X 日恢复」，**停用优先于休息**                          | M1     |
| 10  | 在停用中的行点「仍要服用」                                  | 直接写入，不弹确认；记录标注来源；不计入完成度                         | M1     |
| 11  | 停药期无结束日期                                            | 显示「停用中 · 持续中」，不显示恢复日期                                | M1     |
| 12  | 打开两个标签页，一边打卡                                    | 另一边自动刷新                                                         | M1     |
| 13  | 断网后打开应用并打卡                                        | 全部功能正常                                                           | M1     |
| 14  | 导出 JSON → 清除数据 → 导入                                 | 完整还原                                                               | M1     |
| 15  | **把浏览器窗口缩到窄屏（≈375px）重做第 1、6 步**            | 不横向滚动、不遮挡打卡按钮、功能入口不缺失。**不要求一屏不滚动**       | M1     |
| 16  | **全程只用键盘完成第 1、6 步**（Tab + Enter）               | 列表项可聚焦、可触发，焦点可见                                         | M1     |
| 17  | 建成分 D3（单位 IU），给补剂 A 关联「每份 1000 IU」，打卡 A | 汇总显示「维生素 D3 合计 1000 IU」，来源为 A                           | M3     |
| 18  | 再打卡一个也含 D3 的补剂                                    | 合计正确累加（跨补剂归并），来源列两个补剂                             | M3     |
| 19  | 成分单位改为 mg 与 μg 混用，查看汇总                        | 归一到 μg 后合计正确，显示按合计值选单位；**IU 与 ml 不出现在同一行**  | M3     |
| 20  | 改一次配方（含量翻倍）                                      | 原关联失效日＝昨日，新关联生效日＝今日；**回看昨天的汇总仍按旧配方算** | M3     |
| 21  | 对含 D3 的补剂标记「漏服」                                  | 该条**不计入**成分汇总                                                 | M3     |

### 13.3 里程碑通过判据

**M1 全部满足才算通过**：

- [ ] 走查第 1–16 步全通过
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` 全绿
- [ ] 全仓库 grep `deletedAt` / `stockState` / `StockLog` 无结果（R-04 / R-05）
- [ ] 导航为 4 项（今日 / 补剂 / 停药 / 设置），无死链
- [ ] 8 个补剂同屏时，休息 + 停用项自动折叠，打卡入口不被遮挡
- [ ] 用 DevTools 断网后刷新，应用仍可用
- [ ] 两个标签页打开，一边打卡另一边自动刷新
- [ ] `docs/DECISIONS.md` 已记录 5 条 DIFF

**M2 全部满足才算通过**：

- [ ] 走查第 1–16 步回归通过（M1 功能未被破坏）
- [ ] 日历能同时看到 `done` / `partial` / `missed` / `rest` / `paused` 五种状态且视觉可辨
- [ ] 补录窗口严格为 7 天，休息 / 停用日无补录入口
- [ ] 方案组执行新组会自动结束旧组，且有轻确认
- [ ] 导航 5 项

**M3 全部满足才算通过**：

- [ ] 走查第 17–21 步全通过
- [ ] 成分汇总界面**不含任何结论性措辞 / 颜色 / 图标**（R-02，逐字检查）
- [ ] 去掉成分库、预警、备份提醒任意一项，M1 / M2 功能不受影响
- [ ] 导航 6 项

### 13.4 风险核对（对应需求 §8.3）

| 风险                       | 验收时如何确认已缓解                                                     |
| -------------------------- | ------------------------------------------------------------------------ |
| RK-01 误删不可恢复         | 删除确认框含具体数字 N；`deleteRecords` 默认勾选；确认框内有「前往导出」 |
| RK-02 范围蔓延             | 检查 `docs/DECISIONS.md` 是否有未记录的偏离；M3 功能未出现在 M1 提交中   |
| RK-03 窄屏被忽略           | 走查第 15 步                                                             |
| RK-04 窗口期浪费           | M1 提交后模型冻结；后续变更需新建 DIFF 记录                              |
| RK-05 成分展示滑向营养判断 | 走查第 17–21 步 + 逐字检查界面措辞                                       |

---

## 14. 决策规则（歧义与拍板）

### 14.1 已拍板项（不需要再问，直接照做）

**A. 线框遗留的 10 项（W-01 ~ W-10）**

| #    | 事项                   | **拍板结论**                                                         |
| ---- | ---------------------- | -------------------------------------------------------------------- |
| W-01 | 不吃项折叠阈值         | 同时段「休息 + 停用」**≥ 3 项**时折叠为一行；待吃 / 已吃**永不折叠** |
| W-02 | 余量偏低阈值           | **剩余 ÷ 日均消耗 ≤ 5 天**，写死不配置（日均算法见 §6.5）            |
| W-03 | 停药提醒条点击行为     | **不跳转**，只保留 [停止]                                            |
| W-04 | 执行新方案组的确认     | **需要轻确认**，提示将结束哪一组                                     |
| W-05 | 日历每格标记密度       | **最多 3 个点**，超出显示 `+N`                                       |
| W-06 | 补剂表单长度           | **先平铺**，不做折叠区                                               |
| W-07 | 「删除记录」确认强度   | **轻确认**（一次确认框），不套用删除补剂的强度                       |
| W-08 | 成分改名提示           | **提示但不警告**（关联走 `id`，改名安全）                            |
| W-09 | 「今天先不吃」快捷入口 | **不做**（M1–M3 均不做，记入后续版本池）                             |
| W-10 | 成分汇总进度条         | **去掉**，只并列数字                                                 |

**B. 需求文档未定、本实施补充的决策**

| #    | 事项                              | 结论                                                       | 依据                     |
| ---- | --------------------------------- | ---------------------------------------------------------- | ------------------------ |
| D-01 | 旧库如何处理                      | 新库名 `suptrack-v12`，旧库不读不迁                        | R-14                     |
| D-02 | 同一补剂能否有多条启用计划        | **不能，至多 1 条**                                        | DIFF-02                  |
| D-03 | 删除补剂时 PausePeriod 怎么办     | 一并硬删除（`'ALL'` 除外）                                 | DIFF-03                  |
| D-04 | 导入策略                          | 只做覆盖，导入前强制备份                                   | DIFF-04                  |
| D-05 | 「X 恢复」中的 X                  | `endDate + 1`                                              | DIFF-05                  |
| D-06 | `isExtra` 与 `origin` 的关系      | 两者都存，refine 强制一致                                  | DIFF-01                  |
| D-07 | 补录窗口是否可配置                | **不可配置**，固定 7 天常量                                | 减少一个设置项，需求允许 |
| D-08 | 打卡成功后是否 toast              | **不 toast**（行本身已变，再弹一次是噪音）。失败时才 toast | 减少干扰                 |
| D-09 | 今日页是否显示日期切换            | 不显示，回看是日历页职责                                   | 线框 §01                 |
| D-10 | 四态的颜色是否可自定义            | 不可，写死 token                                           | 保证 P1 的视觉一致性     |
| D-11 | 漏服是否需要存储字段              | 不需要，由 `resolveDayStatus` 推导                         | 线框 §04                 |
| D-12 | 空状态「添加补剂」如何直达 Dialog | 跳 `/supplements?new=1`，页面读 query 自动开窗             | 少一次点击               |
| D-13 | 手动录入（无计划）的记录归属      | 归入「计划外记录」分组，`planId=null`、`origin='manual'`   | §4.3 DQ-14 原则          |
| D-14 | 加载超过 300ms 才显示骨架         | 是                                                         | 避免快时闪屏             |

### 14.2 可以自行决定的事项

以下情形**不需要停下来问**，按最接近的既有模式处理，并在完成报告里记一行：

| 情形                           | 处理方式                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------- |
| 组件内部布局细节（间距、对齐） | 沿用现有页面的 Tailwind 模式（`p-6` / `gap-4` / `rounded-md`）               |
| 文案的微调用词                 | 保持与 §8 表格里的文案一致；表格没写的，用最直白的说法                       |
| 新增纯函数的文件名             | 遵循 §4.4 命名约定                                                           |
| 测试用例的具体输入数据         | 用有代表性的虚构数据（如「维生素 D3」「鱼油」），**不要用真实人名 / 手机号** |
| 内部辅助函数的拆分             | 按可测性判断，能被单测覆盖的拆出来                                           |

### 14.3 必须停下来问的 5 种情况

只有这 5 种情况允许中断执行、向用户提问：

1. **需求文档与本指导书冲突**——比如文档说 A，指导书说 B，而指导书没有对应的 DIFF 说明。
2. **发现新的实现化偏离**，且它会影响字段名或数据语义——追加 DIFF 需要用户认可。
3. **必须新增第三方依赖**——R-12 是硬约束，需要用户批准。
4. **验收项无法达成**——比如某个走查步骤在当前架构下做不到，需要做范围调整。
5. **用户数据存在风险**——任何可能导致用户已有数据丢失的操作。

**提问格式**：一句话说清问题 + 2–3 个选项 + 你的建议。不要开放式提问。

---

## 15. 交付定义与完成报告

### 15.1 每个任务的交付定义

| 项     | 要求                                                                                          |
| ------ | --------------------------------------------------------------------------------------------- |
| 代码   | 通过 `pnpm typecheck && pnpm test`                                                            |
| 测试   | 该任务引入的新逻辑有对应用例（§12.2 列出的必写不遗漏）                                        |
| 注释   | 涉及需求条款处带条款号；「不做」的事项写明原因，防后人顺手加                                  |
| commit | 一个任务一个提交，message 用中文，格式：`feat(m1): 简述` / `fix(m1): 简述` / `refactor: 简述` |

### 15.2 每个里程碑的交付定义

| 项   | 要求                                     |
| ---- | ---------------------------------------- |
| 代码 | 通过 `typecheck + lint + test + build`   |
| 验收 | §13.3 该里程碑的全部判据打勾             |
| 文档 | `docs/DECISIONS.md` 已更新（若有新偏离） |
| 报告 | 按 §15.3 输出完成报告                    |

### 15.3 完成报告模板

每个里程碑结束时输出：

```markdown
# M{n} 完成报告

## 交付内容

- 新增文件：{数量}
- 重写文件：{数量}
- 删除文件：{数量}
- 关键实现：{3–5 条}

## 验收结果

| 判据                            | 结果    | 说明           |
| ------------------------------- | ------- | -------------- |
| 走查第 x–y 步                   | ✅ / ❌ | {异常说明}     |
| typecheck / lint / test / build | ✅ / ❌ | {命令输出摘要} |
| §13.3 检查项                    | ✅ / ❌ | —              |

## 测试统计

- 测试文件：{n} 个
- 用例：{n} 个（全绿 / {n} 个失败）

## 偏离与决策

| 编号    | 内容 | 理由 |
| ------- | ---- | ---- |
| DIFF-0x | ...  | ...  |

## 遗留问题

| #   | 问题 | 影响 | 建议 |
| --- | ---- | ---- | ---- |

## 下一步

{M+1 的前置条件是否满足，是否可以进入}
```

### 15.4 全部完成时的最终交付物

| 交付物     | 路径                                              |
| ---------- | ------------------------------------------------- |
| 可运行应用 | `pnpm dev` 起在 3100；`pnpm build` 产物在 `dist/` |
| 代码       | `src/` 全部 8 张表 + 6 个页面 + 5 个纯函数算法    |
| 测试       | `src/test/` 全绿                                  |
| 决策留痕   | `docs/DECISIONS.md`                               |
| 完成报告   | 三份（M1 / M2 / M3），或合并一份总报告            |

---

## 16. 附录

### 16.1 文件处置总表（一份表看完全部改动）

| 路径                                                  | 处置                           | 任务号    |
| ----------------------------------------------------- | ------------------------------ | --------- |
| `src/types/index.ts`                                  | 重写（8 接口）                 | T-102     |
| `src/constants/enums.ts`                              | 重写                           | T-102     |
| `src/constants/units.ts`                              | 保留                           | —         |
| `src/constants/deletedAt.ts`                          | **删**                         | T-101     |
| `src/constants/stockState.ts`                         | **删**                         | T-101     |
| `src/db/index.ts`                                     | 改 DB_NAME                     | T-103     |
| `src/db/schema.ts`                                    | 重写（8 表）                   | T-103     |
| `src/db/migrations/`                                  | **删目录**                     | T-101     |
| `src/schemas/*.ts`                                    | 重写 7 个 + 删 2 个            | T-104     |
| `src/repositories/base.ts`                            | 重写（去软删除）               | T-109     |
| `src/repositories/*Repository.ts`                     | 重写 6 个 + 新 1 个 + 删 1 个  | T-109     |
| `src/services/supplementService.ts`                   | **新建**                       | T-111     |
| `src/services/planService.ts`                         | **新建**                       | T-112     |
| `src/services/intakeService.ts`                       | 重写                           | T-113     |
| `src/services/pauseService.ts`                        | 重写                           | T-114     |
| `src/services/backfillService.ts`                     | 重写                           | T-202     |
| `src/services/summaryService.ts`                      | 重写                           | T-302     |
| `src/services/importExportService.ts`                 | **新建**（替代 importService） | T-115     |
| `src/services/importService.ts`                       | **删**                         | T-101     |
| `src/services/stockService.ts`                        | **删**                         | T-101     |
| `src/services/metaService.ts`                         | 适配                           | T-110     |
| `src/utils/rate.ts`                                   | **新建** ★                     | T-106     |
| `src/utils/dayState.ts`                               | **新建** ★                     | T-107     |
| `src/utils/pause.ts`                                  | 重写 ★                         | T-108     |
| `src/utils/date.ts`                                   | 改（删 shiftDays）             | T-105     |
| `src/utils/completion.ts`                             | **删**                         | T-101     |
| `src/utils/merge.ts`                                  | **删**                         | T-101     |
| `src/utils/missedCache.ts`                            | **删**                         | T-101     |
| `src/utils/intakeFactory.ts`                          | 适配                           | T-201     |
| `src/utils/broadcast.ts` / `id.ts` / `unit.ts`        | 保留                           | —         |
| `src/hooks/useTodayData.ts`                           | 重写                           | T-116     |
| `src/hooks/useSupplementList.ts`                      | **新建**                       | T-116     |
| `src/hooks/usePauseData.ts`                           | **新建**                       | T-116     |
| `src/hooks/useCalendarMonth.ts`                       | **新建**                       | T-203     |
| `src/hooks/useIngredientSummary.ts`                   | **新建**                       | T-305     |
| `src/hooks/useMissedPlans.ts`                         | **删**                         | T-101     |
| `src/pages/today/index.tsx`                           | 重写 ★                         | T-118     |
| `src/pages/supplements/index.tsx`                     | 重写                           | T-119     |
| `src/pages/pausePeriods/index.tsx`                    | 重写                           | T-120     |
| `src/pages/settings/index.tsx`                        | 重写                           | T-121     |
| `src/pages/calendar/index.tsx`                        | 重写                           | T-204     |
| `src/pages/ingredients/index.tsx`                     | 重写                           | T-304     |
| `src/pages/plans/`                                    | **删目录**                     | T-101     |
| `src/components/layout/AppShell.tsx`                  | 改（导航 + 栅格）              | T-122     |
| `src/components/ui/*.tsx`                             | 保留                           | —         |
| `src/components/common/*`                             | **新建 5 个**                  | T-117     |
| `src/components/recycle/`                             | **删目录**                     | T-101     |
| `src/components/backfill/BackfillDialog.tsx`          | 重写                           | T-205     |
| `src/components/backfill/MissedPlansBanner.tsx`       | **删**                         | T-101     |
| `src/components/today/*` / `supplement/*` / `pause/*` | **新建**                       | T-118~120 |
| `src/routes/index.tsx`                                | 改                             | T-122     |
| `src/styles/index.css`                                | 加四态色 token                 | T-117     |
| `src/test/**`                                         | 按 §12 重写                    | 各阶段    |
| `docs/DECISIONS.md`                                   | **新建**                       | T-123     |
| `v12.0-需求重梳理.md` / `原型线框-v12.2.html`         | **只读，不改**                 | R-07      |

### 16.2 术语表

| 术语         | 含义                                          | 反例（不要这样用）                           |
| ------------ | --------------------------------------------- | -------------------------------------------- |
| **补剂**     | 我有哪些（名字 + 每次多少 + 单位 + 余量）     | 不要说「药品」「商品」                       |
| **计划**     | 我该什么时候吃（节奏 + 时段）                 | 不要叫「规则」「配置」                       |
| **节奏**     | 计划的属性：每天 / 隔天 / 每 N 天 / 吃 N 停 M | 不要叫「周期」「频率模式」                   |
| **记录**     | 我吃了吗（一次服用的事实）                    | 不要叫「日志」「打卡记录」                   |
| **停药**     | 我什么时候不该吃（有起止的暂停）              | 不要说「禁用」「暂停服用」                   |
| **今天休息** | 节奏排到的不吃日                              | ❌ 不能说「停药中」（P1）                    |
| **停用中**   | 落在停药期内                                  | ❌ 不能说「今天休息」（P1）                  |
| **余量**     | 一个整数，可能为空                            | 不要说「库存」「存量」（避免库存系统的联想） |
| **打卡**     | 点一下记录已服用                              | 不要叫「签到」                               |

### 16.3 变更留痕要求

| 场景               | 要求                                                                             |
| ------------------ | -------------------------------------------------------------------------------- |
| 发现新的实现化偏离 | 追加 `DIFF-06` 到 `docs/DECISIONS.md`，说明原文、实施、理由                      |
| 自行决定的事项     | 在完成报告「偏离与决策」表中记一行                                               |
| 需求需要变更       | **不改需求文档**。把诉求写进完成报告的「遗留问题」，由用户决定是否出新版需求文档 |
| 砍掉某个 M3 项     | 在完成报告里写明「未实施 + 需求允许的依据」                                      |

### 16.4 一句话总结

> **这个产品的全部价值，是一屏能回答「今天吃什么、吃了吗、为什么不用吃、下次什么时候」。
> 任何不服务于这四个问题的工作，都不属于本次实施。**

---

> 本指导书为产品实施参考，具体实施请结合合规与法务要求确认。
> 产品定性为**记录工具**：所有阈值由用户自行设定，系统仅做记录与提示，不构成任何医学建议。
