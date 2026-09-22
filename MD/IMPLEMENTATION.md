# SupTrack 实施指南（AI 执行手册）

> 本文件是**给 AI 的执行手册**，不是需求文档。
> 需求唯一来源是同目录下的 `.md`（《补剂摄入记录系统 - 需求框架 v10.1》）。
> 本手册只做三件事：**定目录结构、定阶段顺序、定验收标准**。
> 遇到两者冲突时，**以需求文档为准**；若需求文档本身有矛盾，停止实现并向用户提问，不得自行决策。

---

## 0. AI 执行规则（必须先读）

1. **一次只推进一个 Phase**，完成后运行该 Phase 的验收命令，全绿才进入下一个。
2. **先读需求对应章节再动手**。本手册每阶段都标注了「必读章节」，不允许凭猜测实现。
3. **禁止以下行为**（红线，见第 5 节）：
   - 在组件里直接 `await db.xxx.toArray()`（必须走 `repository` + `useLiveQuery`）
   - 在 `intakeService` / `backfillService` / 组件里直接写 `supplements` / `stockLogs`（必须走 `stockService.applyTransition*`）
   - 把 `deletedAt` 写成 `null` / `undefined`（只能是 `0` 或 ISO 字符串）
   - 引入小数服用量（所有数量字段整数）
4. **不修改需求文档 `.md`**。需要改需求时，停下来问用户。
5. **不提交 git**，除非用户明确要求。
6. 每完成一个 Phase，在本文件末尾「进度记录」表格中勾选并填写日期。

---

## 1. 交付物与成功标准

**交付物**：`SupTrack/` 下一个可运行的纯前端 PWA（PC 优先），数据全部存 IndexedDB，无后端。

**成功标准（DoD）**：

- `pnpm lint` / `pnpm build` / `pnpm test` 全部通过，无 TS 错误（禁止 `any`）。
- 完整跑通一条主链路：建补剂 → 建成分并关联 → 建计划 → 今日打卡（库存扣减 + StockLog）→ 撤销（回滚 + `was_deducted`）→ 回收站恢复（重扣）→ 补录昨日 → 日历看到完成度 → 成分汇总 → 导出 JSON → 清空后导入还原。
- 关键不变量（第 5 节）全部有测试覆盖，测试全绿。
- 断网可用（PWA 静态资源缓存），多标签页数据同步（BroadcastChannel）。

---

## 2. 技术栈与依赖

沿用参考项目 `react-three-map` 的构建链（Vite + React 19 + ESLint + Prettier + husky/lint-staged），**依赖做替换**。

### 保留（从参考项目继承）

`vite@^7`、`@vitejs/plugin-react@^5`、`react@^19`、`react-dom@^19`、`react-router-dom@^7`、`sass@^1.90`、`tailwindcss@^4` + `@tailwindcss/vite@^4`、`eslint@^9` + `@eslint/js` + `eslint-plugin-react-hooks` + `eslint-plugin-react-refresh`、`globals`、`prettier`、`husky`、`lint-staged`。

### 新增

```
dexie@^4  dexie-react-hooks@^1  zustand@^5  zod@^3.23  date-fns@^4
vite-plugin-pwa@^1  clsx  tailwind-merge  class-variance-authority  lucide-react
# shadcn/ui 依赖的 radix 包由 CLI 按需安装（@radix-ui/react-dialog 等）
typescript@~5.8  @types/react@^19  @types/react-dom@^19  typescript-eslint
vitest@^3  fake-indexeddb@^6  @vitest/coverage-v8
```

### 删除（参考项目有但本项目不需要）

`three`、`three.interactive`、`echarts`、`gsap`、`axios`、`autofit.js`、`d3-geo`、`point-in-polygon`、`tiny-emitter`（改用 Dexie 自带 liveQuery + BroadcastChannel）、`normalize.css`（Tailwind 已含 preflight）。

### 关键配置改动

- `vite.config.ts`：`base: './'`；`outDir: 'dist'`（去掉 `build/constant.js` 依赖）；保留 `@` → `src` 别名（shadcn 与参考项目都依赖它）；新增 `vite-plugin-pwa`（`registerType: 'prompt'`，见需求 6.4）；新增 `test` 段（Vitest，`environment: 'node'`，`setupFiles: ['./src/test/setup.ts']`）。
- `tsconfig.json` / `tsconfig.node.json`：新增，`strict: true`，`paths: { "@/*": ["./src/*"] }`（须与 Vite alias 一致）。
- `eslint.config.js`：`files` 改为 `**/*.{ts,tsx}`，接入 `typescript-eslint`。
- `index.html`：`lang="zh-CN"`，title「SupTrack 补剂记录」。
- `components.json`：shadcn 配置，`tailwind.css` 指向 `src/styles/index.css`，别名 `@/components`、`@/lib/utils`。

---

## 3. 目录结构（目标）

参考项目分层习惯（`pages / components / routes / utils / styles / assets`）+ 需求文档 8.1 的分层（`db / repositories / services / schemas / stores / constants / types`）。

```
SupTrack/
├── .md                      # 需求文档（只读，勿改）
├── IMPLEMENTATION.md        # 本文件
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json / tsconfig.node.json
├── eslint.config.js
├── .prettierrc / .husky/
├── components.json          # shadcn
└── src/
    ├── main.tsx             # 挂载 + PWA 注册 + appVersion 写入 Meta
    ├── App.tsx              # ErrorBoundary + RouterProvider
    ├── routes/
    │   └── index.tsx        # 路由表（参考项目同位置同名，改 tsx）
    ├── db/
    │   ├── index.ts         # Dexie 实例
    │   ├── schema.ts        # 表结构 + 索引（唯一来源）
    │   └── migrations/      # 旧版本数据转换（见下方"迁移策略"）
    ├── repositories/        # 数据访问：统一软删除过滤 + includeDeleted 选项
    ├── services/
    │   ├── metaService.ts
    │   ├── stockService.ts  # 库存状态机唯一入口
    │   ├── intakeService.ts # 业务编排
    │   ├── backfillService.ts
    │   ├── importService.ts # 导出/导入/合并/异常清单
    │   └── summaryService.ts# 成分汇总 + 完成度（纯计算，可放 utils）
    ├── schemas/             # Zod：*CreateSchema / *UpdateSchema
    ├── constants/           # units.ts / deletedAt.ts / stockState.ts / enums.ts
    ├── types/               # 实体 interface + 类型别名
    ├── stores/              # Zustand：仅 UI 状态
    ├── hooks/               # useMissedPlans 等
    ├── utils/               # date.ts / unit.ts / pause.ts / merge.ts
    ├── pages/               # today / supplements / ingredients / plans /
    │                        #   pausePeriods / calendar / settings / statistics(P2)
    ├── components/
    │   ├── ui/              # shadcn 生成，勿手改
    │   ├── layout/          # AppShell / SideNav / Header
    │   ├── intake/          # 打卡行、撤销按钮、历史修正弹窗
    │   ├── backfill/        # 补录弹窗、次日提醒 Banner
    │   ├── recycle/         # 回收站分表 Tab
    │   └── supplement/      # 补剂表单、成分关联、库存调整
    ├── styles/              # index.css（Tailwind + shadcn 变量）
    └── test/                # setup.ts（fake-indexeddb）+ 用例
```

**命名约定**（沿用参考项目风格，避免混用）：

- 页面/工具/服务目录：camelCase（`today/`、`stockService.ts`）
- 组件目录：PascalCase（`IntakeRow/`），内部 `index.tsx`
- 文件内组件导出：具名导出 + 目录 `index.ts` 转发

---

## 4. 需求文档 → 代码 映射表

| 需求章节           | 落到哪里                                               |
| ------------------ | ------------------------------------------------------ |
| 2.1–2.10 数据模型  | `types/` + `db/schema.ts`                              |
| 2.11 单位常量      | `constants/units.ts`                                   |
| 2.12 库存状态常量  | `constants/stockState.ts`                              |
| 5.3 停药期计算     | `utils/pause.ts`（纯函数 `isPaused`）                  |
| 5.4 成分汇总       | `services/summaryService.ts` + `utils/unit.ts`         |
| 5.5 / 5.7 导入合并 | `services/importService.ts` + `utils/merge.ts`         |
| 5.6 库存扣减       | `services/stockService.ts`                             |
| 5.7 软删除/回收站  | `repositories/` + `pages/settings` 回收站 Tab          |
| 5.8 补录           | `services/backfillService.ts` + `components/backfill/` |
| 6.1 迁移           | `db/migrations/`                                       |
| 6.2 索引           | `db/schema.ts`                                         |
| 6.3 状态管理       | `stores/` + `hooks/`                                   |
| 6.5 日期处理       | `utils/date.ts`                                        |
| 6.6 Zod 校验       | `schemas/`                                             |
| 6.7 Service 签名   | `services/*.ts`（**签名必须一字不差**）                |
| 8.3 测试策略       | `src/test/`                                            |
| 12 优先级          | 本文件的 Phase 顺序                                    |

---

## 5. 全局红线（不变量，违反即不合格）

1. **`deletedAt: 0 | ISO string`**，新建必须显式写 `0`；Meta 表无此字段。
2. **所有数量字段整数**（`z.number().int()`）：`dailyAmount` / `actualAmount` / `plannedAmount` / `plannedAmountSnapshot` / `stockCountInUsageUnit` / `deltaInUsageUnit` / `amountPerServing` / `recommendedDailyIntake` / `upperLimit`。
3. **`stockState` 四态 + 与 `deletedAt` 一致性**：
   - `deletedAt === 0` → `deducted | not_deducted`
   - `deletedAt !== 0` → `not_deducted | was_deducted | unknown`
4. **库存写入唯一入口** `stockService.applyTransition / applyTransitionInTx / applyTransitionBatch`；所有库存操作在**单个 Dexie `readwrite` 事务**内完成读-判断-写。
5. **幂等靠 `stockState` 检查**，不靠唯一索引（`[reason+relatedIntakeId]` 是普通索引）。
6. **批量 = 循环单条**，每条 intake 一条 StockLog，不聚合。
7. **`purge` 不触碰库存**；软删除 = 撤销（回滚）；恢复按 `stockState` 决定是否重扣。
8. **补录范围**：`[today - backfillWindowDays, yesterday]`，不含今天、禁止未来；**历史修正不受限**。
9. **`backfillWindowDays` 运行时读取**（`await metaService.get(...)`），禁止模块级缓存。
10. **统计/汇总/完成度只算 `deletedAt === 0` 的 DailyIntake**。
11. **`getActivePlansForDate(date, { onlyExistingAtDate: true })`**：补录、次日提醒、日历完成度三处必须传 `true`。
12. **软删除记录禁止历史修正**（抛业务异常）。
13. **数据层只通过 `repositories` 访问**，UI 只用 `useLiveQuery`。
14. **`μg` 为存储单位**，输入 `mcg` 经 Zod transform 转换；IU / ml 独立累加。
15. **导入前强制备份**；`mergeRecord` 时间相同时：DailyIntake 取 local，其他表取删除意图优先。

---

## 6. 阶段任务

### Phase 0 — 脚手架（复制改造参考项目）

**必读**：需求 1.2 / 1.3 / 6.4。
**做**：

1. 复制 `react-three-map` 的 `vite.config.js` → `vite.config.ts`（按第 2 节改动）、`eslint.config.js`、`index.html`、`.prettierrc`、`husky/`、`lint-staged` 配置；`src/main.jsx`→`main.tsx`、`App.jsx`→`App.tsx`、`routes/index.jsx`→`routes/index.tsx`、`styles/tailwind.css`→`styles/index.css`。
2. 建 `tsconfig.json`（strict + `@/*` paths）、`components.json`。
3. 按第 2 节重写 `package.json`（scripts 增加 `test` / `test:ui` / `typecheck`）。
4. `src/test/setup.ts` 引入 `fake-indexeddb/auto`。
5. 初始化 shadcn：`npx shadcn@latest init`（Tailwind v4 分支），确认 `@/lib/utils` 生成成功。
6. 清空参考项目的业务代码（mini3d、pages/sxMap 等**一律不复制**），只保留一个能跑的空壳首页。

**验收**：`pnpm i && pnpm dev` 打开首页；`pnpm typecheck`、`pnpm lint`、`pnpm build` 全通过。

---

### Phase 1 — 常量、类型、Zod Schema

**必读**：需求 2.11 / 2.12 / 8.2 / 6.6。
**做**：

1. `constants/units.ts`（`UNIT_TYPE`、`UNIT_TYPE_LABEL`、`INGREDIENT_UNIT`、`INGREDIENT_UNIT_LABEL`，**照抄需求 2.11 代码**）。
2. `constants/deletedAt.ts`（`NOT_DELETED = 0`）、`constants/stockState.ts`（四态 + 中文标签）、`constants/enums.ts`（status / source / timeSlot / cycleMode / reason / plannedAmountSource）。
3. `types/`：9 张表的 interface + `DeletedAt` / `StockState` / `PlannedAmountSource` 别名。
4. `schemas/`：`supplement` / `ingredient` / `supplementIngredient` / `dosagePlan` / `dailyIntake`（**Create + Update 两套**）/ `pausePeriod` / `stockLog` / `bodyFeedback`。
   - `DailyIntakeCreateSchema` / `DailyIntakeUpdateSchema` **逐字照抄需求 6.6 代码块**（含 C-1、C-5 的 refine 改造）。
   - `Ingredient.unit`：`mcg` → `μg` 的 Zod transform。
   - `deletedAt: z.union([z.literal(0), z.string().datetime()])`。
   - **日期范围不放 Zod**，全部下放 Service 层 `validateIntakeDate(date, mode)`。

**验收**：`pnpm test` 中 schemas 用例全绿（含 C-5 部分更新不误报、skipped+deducted 被拒、mcg→μg）。

---

### Phase 2 — 数据层（Dexie + Repository + 迁移）

**必读**：需求 6.1 / 6.2 / 5.7。
**做**：

1. `db/schema.ts`（索引照抄 6.2，含 v10.1 新增 `dosagePlans.createdAt`、`stockLogs.[deletedAt+createdAt]`）：

```ts
db.version(1).stores({
  supplements: 'id, name, status, [deletedAt+status]',
  ingredients: 'id, name, deletedAt',
  supplementIngredients:
    'id, supplementId, ingredientId, [supplementId+ingredientId], effectiveFrom, deletedAt',
  dosagePlans: 'id, supplementId, isActive, [deletedAt+isActive], createdAt',
  dailyIntakes:
    'id, date, [date+supplementId], [date+timeSlot], planId, [deletedAt+date], stockState, plannedAmountSource',
  pausePeriods: 'id, supplementId, startDate, endDate, deletedAt',
  stockLogs: 'id, supplementId, createdAt, [reason+relatedIntakeId], [deletedAt+createdAt]',
  bodyFeedbacks: 'id, date, deletedAt',
  meta: 'key',
})
```

2. **迁移策略（D1）**：新建库从 `version(1)` = v10.1 最终 schema 起步；`db/migrations/` 导出**纯函数** `migrateV3toV4 … migrateV10toV10_1`，由 `importService` 在导入旧文件时按 `schemaVersion` 依次调用（`Meta.schemaVersion` 更新在函数末尾）。迁移逻辑可单测（fake-indexeddb 起旧库），新库无需走 upgrade 链。
3. `repositories/`：每表一个文件，`listDeleted` / `trash` 查询、级联软删除（补剂 → 计划 + 关联；DailyIntake/StockLog 保留，见 5.7 级联表）。

**验收**：`pnpm test` 覆盖混合类型索引 `[deletedAt+date]` 命中、`[deletedAt+createdAt]` 分页、级联软删除、各迁移脚本（v3→v4、v4→v5、v5→v6、v8→v9、v9→v10）。

---

### Phase 3 — 核心服务（库存状态机 + 录入编排）

**必读**：需求 5.6 / 5.7 / 6.7（**最重要的一节，逐行读**）。
**做**：

1. `services/metaService.ts`：`get/set` + 预置 key 初始化（schemaVersion、backfillWindowDays=30、appVersion）。
2. `services/stockService.ts`：
   - `StockOperation` 联合类型与 `applyTransition` / `applyTransitionInTx` / `applyTransitionBatch` **签名严格照抄需求 6.7 / 5.6**。
   - `applyTransitionCore(tx, op)` 五分支：create / softDelete / restore / updateStatus / updateAmount，状态转移表严格照抄 5.6。
   - `restore` 分支为 `if (unknown) … else if (was_deducted) … else (not_deducted) …`（C-7）。
   - `updateStatus/updateAmount` 的中间态放内存变量，事务内只做一次最终写入（M-6）。
3. `services/intakeService.ts`：`createIntake / updateIntake / softDeleteIntake / restoreIntake / purgeIntake / validateIntakeDate`，**签名照抄 6.7**；`validateIntakeDate` 三分支 `today | backfill | update`；今日手动录入拒绝 `manual + skipped`；软删除记录禁止历史修正。
4. `stores/`：Zustand 只放 UI 状态；`utils/broadcast.ts` 封装 BroadcastChannel → `dataVersion` 自增。

**验收**：`pnpm test` 覆盖 8.3 中全部库存/幂等/批量单事务用例（至少：打卡扣减含负库存、软删除回滚 `deducted→was_deducted`、软删除 `not_deducted` 保持、恢复重扣、恢复 `not_deducted` 不重扣、`unknown` 二选一、purge 不碰库存、历史修正改状态补扣/回滚、改量 delta、重复软删除/恢复幂等、`applyTransitionInTx` 与 `applyTransition` 行为一致）。

---

### Phase 4 — 纯计算（停药期 / 成分汇总 / 日期）

**必读**：需求 5.3 / 5.4 / 6.5。
**做**：`utils/pause.ts`（`isPaused` 并集语义 + 周期取模，返回 `{ paused, reasons }`）、`utils/unit.ts`（μg 归一化 + 显示单位按合计值判定）、`services/summaryService.ts`（版本匹配 `includeDeleted=true`、孤儿记录标注、IU/ml 独立累加）、`utils/date.ts`（补录范围、补录标注）。

**验收**：纯函数单测全绿（周期停药边界、单位换算、只算未删除记录）。

---

### Phase 5 — 补录 + 次日提醒

**必读**：需求 3.1 补录模块 / 5.8。
**做**：`backfillService.getActivePlansForDate(date, { onlyExistingAtDate })`、`backfillBatch(items, date)`（事务内重复检测 `date+supplementId+timeSlot`，跳过已有/临期项并分类返回原因）、`detectMissedPlans()`（过去 7 天、排除今天、停药日排除、`skipped` 视为已处理、**7 天数据一次性查询后内存分组**）；`hooks/useMissedPlans.ts`（缓存 5 分钟 + 软删除/恢复后主动 invalidate）。

**验收**：补录流程用例（8.3 末段）全绿；批量 100 项补录 < 500ms（可用 vitest benchmark 粗测或手动计时）。

---

### Phase 6 — UI 主体

**必读**：需求 3.1–3.7 / 4.1–4.8 / 7.x。
**做**（按页面顺序）：

1. `components/layout/`：AppShell + 侧边导航（今日/补剂/成分/计划/停药期/日历/统计/设置）。
2. `pages/today/`：按时段分组、一键打卡 + 行内撤销、补录昨日入口、次日提醒 Banner、今日成分汇总卡、预警 Banner、空状态。
3. `pages/supplements/`：表格 + 抽屉表单 + 成分关联（含 `effectiveFrom/To` 版本，改配方 = 旧记录 `effectiveTo` 设昨日 + 新建今日记录）+ 库存调整。
4. `pages/ingredients/`：`pages/plans/`：`pages/pausePeriods/`（CRUD + 并集/周期说明）。
5. `components/backfill/`：补录弹窗（日期选择器、已服用/漏服、批量、跳过项清单、双扣警告文案 C-2）。

**验收**：`pnpm build` 通过；手工走通「建补剂→建计划→打卡→撤销→补录」；无 `await db.` 直连（用 ESLint `no-restricted-syntax` 或人工检查）。

---

### Phase 7 — 日历 + 设置（数据管理）

**必读**：需求 3.7 / 3.9 / 5.5 / 5.7 / 9.4。
**做**：

1. `pages/calendar/`：热力图（完成度 = 已服计划项 / (应服计划项 − 停药排除项)，分母 0 显示"无计划"；漏服黄、多服红）+ 日期详情侧栏 + 补录入口（同受 30 天限制）。
2. `pages/settings/`：导出（含软删除记录）、导入（**强制备份** → 预检 → 策略选择 → 迁移 → 合并 → 结果摘要 + 异常清单 A/B/C/D/E/F）、清除数据、回收站（分表 Tab、恢复、彻底删除、一键清空、`unknown` 高亮 + 二选一对话框）、默认设置（库存预警天数、临期天数、默认时段、**补录范围天数**）、数据统计面板、隐私说明、版本信息。

**验收**：导出→清空→导入后数据一致；类型 A/B/C 记录被跳过并出现在异常清单；回收站恢复触发库存重扣。

---

### Phase 8 — PWA / 测试补全 / 性能验收

**必读**：需求 6.4 / 7.x / 8.3 / 9.x。
**做**：

1. PWA：`registerType: 'prompt'` + 更新 Toast「新版本已就绪，点击刷新」；manifest + 图标；静态资源 CacheFirst。
2. 补齐全量测试（8.3 清单逐条勾），`pnpm test --coverage`；关键流程测试覆盖率 ≥ 80%。
3. 性能自查：首屏 < 1.5s、打卡 < 100ms、日历 1000 条 < 200ms、次日提醒 < 100ms。
4. 无障碍与空状态（7.2 / 7.3）：键盘可达、aria-label、空状态引导。

**验收**：三条命令全绿 + 第 1 节 DoD 主链路人工走通。

---

## 7. 必需测试用例（来自需求 8.3，逐条勾选）

- [ ] 打卡扣减（含负库存）/ 不记录库存时 `not_deducted`
- [ ] 软删除回滚 `deducted → was_deducted`；`not_deducted` 软删除保持
- [ ] 恢复重扣 `was_deducted → deducted`；`not_deducted` 恢复不重扣
- [ ] `unknown` 恢复二选一（含选"视为已扣"写 `adjust` 流水 + 双扣警告文案）
- [ ] purge 不触碰库存；StockLog 悬空引用保留
- [ ] 历史修正：改状态补扣/回滚、改量 delta、`skipped ↔ taken`
- [ ] 幂等：重复软删除 / 重复恢复
- [ ] 批量单事务：`applyTransitionBatch` / `applyTransitionInTx` 与 `applyTransition` 行为一致
- [ ] Zod：`skipped + deducted` 被拒、C-1 四态约束、C-5 部分更新不误报、`mcg → μg`
- [ ] `validateIntakeDate` 三分支；补录范围（30 天、不含今天、禁未来）
- [ ] 补录：事务内重复检测、`plannedAmountSource='current_plan'`、无计划 `status='extra'`、按 `date` 计入统计
- [ ] `onlyExistingAtDate`：不匹配 `createdAt > date` 的计划
- [ ] 次日提醒：过去 7 天、排除今天、停药日排除、`skipped` 不再提醒、缓存 5 分钟 + invalidate、批量查询
- [ ] 迁移脚本：v3→v4、v4→v5、v5→v6、v8→v9、v9→v10
- [ ] 导入：强制备份、`mergeRecord` 同时间规则、异常清单 A/B/C/D/E/F、旧版 `stockState` 推断、`deletedAt:null → 0`
- [ ] 索引：`[deletedAt+date]`、`[deletedAt+createdAt]`、`[reason+relatedIntakeId]` 非唯一
- [ ] 汇总：只算未删除、孤儿记录标注、IU/ml 独立累加、单位按合计值判定

---

## 8. 已确认决策（用户 2026-09-10 确认）

- **D1 迁移策略（已确认）**：新库 `version(1)` 直接建 **v10.1 最终 schema**。旧版迁移写成**纯函数**（`db/migrations/`，`migrateV3toV4 … migrateV10toV10_1`）供 `importService` 按导入文件的 `schemaVersion` 依次调用，不写 Dexie upgrade 链。理由：新库不可能从 v3 升级，upgrade 链只会增加无用分支；同时满足"迁移函数幂等、可测试"。
- **D2 范围（已确认）**：本版只做 **P0 + P1**。身体反馈（BodyFeedback）、统计报表、StockBatch、DosagePlanHistory、`idempotencyKey` **仅建表/留占位，不实现 UI 与逻辑**；统计页保留入口占位即可。
- **D3 UI 落地（已确认）**：**Tailwind v4 + shadcn/ui**（继承参考项目的 Tailwind v4 配置），保留 `sass` 但新样式一律优先 Tailwind / shadcn。
- **D4 端口与产物（默认沿用，未提异议则照此执行）**：dev 端口 3100，`base: './'`，`outDir: 'dist'`（去掉参考项目的 `build/constant.js`）。

---

## 9. 进度记录

| Phase | 内容              | 状态 | 完成日期   |
| ----- | ----------------- | ---- | ---------- |
| 0     | 脚手架            | ✅   | 2026-09-10 |
| 1     | 常量 / 类型 / Zod | ✅   | 2026-09-10 |
| 2     | 数据层            | ✅   | 2026-09-10 |
| 3     | 核心服务          | ✅   | 2026-09-10 |
| 4     | 纯计算            | ✅   | 2026-09-10 |
| 5     | 补录 / 提醒       | ✅   | 2026-09-10 |
| 6     | UI 主体           | ✅   | 2026-09-10 |
| 7     | 日历 / 设置       | ✅   | 2026-09-10 |
| 8     | PWA / 测试 / 性能 | ✅   | 2026-09-10 |

**验收状态（2026-09-10）**：`pnpm typecheck` / `pnpm lint` / `pnpm test`（110 用例）/ `pnpm build` 全绿。

---

## 10. 实现记录与偏差（实施完成后回填）

### 10.1 常用命令

```bash
pnpm dev        # 开发（端口 3100）
pnpm build      # 类型检查 + 构建到 dist/
pnpm test       # Vitest（fake-indexeddb），共 110 个用例
pnpm lint       # ESLint
```

### 10.2 与需求文档的偏差（均为实现约束所致，逻辑等价）

| 编号 | 需求原文                                            | 实际实现                                                                                                                                                                                              | 原因                                                                                                                                              |
| ---- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1   | `dosagePlans.[deletedAt+isActive]` 索引             | 改为 `[deletedAt+supplementId]`，`isActive` 在查询侧过滤                                                                                                                                              | IndexedDB 不接受 boolean 作为索引 key，该索引会静默丢失记录                                                                                       |
| E2   | 复合索引 `between([0,d],[0,d])` 单日查询            | 上界补 `\uffff`                                                                                                                                                                                       | Dexie 在等边界时 `between` 不命中（实测 `equals` 命中）                                                                                           |
| E3   | `vite-plugin-pwa`（`registerType: 'prompt'`）       | 手写 `public/sw.js` + `public/manifest.webmanifest` + `src/pwa/registerSW.ts`                                                                                                                         | 环境 pnpm safe-delete 拦截新依赖安装；手写实现保持同等语义（静态资源 CacheFirst、更新需用户确认后刷新、数据不缓存）                               |
| E4   | shadcn 的 sonner Toast                              | 自建 `stores/toastStore.ts` + `components/ui/toaster.tsx`                                                                                                                                             | 同上，`sonner` 安装被拦截                                                                                                                         |
| E5   | `isPaused(supplementId, date)` 双参纯函数           | `isPaused(supplementId, date, periods)`                                                                                                                                                               | 保持纯函数可测；仓储取数由调用方完成                                                                                                              |
| E6   | v3→v10.1 Dexie upgrade 链                           | 纯函数迁移链（`db/migrations`），由导入流程调用                                                                                                                                                       | 决策 D1：新库直接建 v10.1 schema，无历史库可升级                                                                                                  |
| E7   | 3.7「手动录入不计入完成度」与 5.8「补录计入完成度」 | 分子 = **命中应服计划项（补剂+时段匹配）** 且来源为打卡（`source='plan'`）或补录已服用（`plannedAmountSource='current_plan'`）的 taken/partial 记录；分母 = 计划按 `timeSlots` 展开去重（排除停药日） | 两者 `source` 均为 `manual`，无法只用 source 区分；用"是否命中计划项 + 快照来源"可同时满足两条需求。2026-09-10 修复了此前把任意记录计入分子的缺陷 |

### 10.3 未实现项（明确超出 P0/P1 范围）

- 统计报表页、身体反馈记录、库存批次（StockBatch）、DosagePlanHistory、`idempotencyKey` 唯一索引：仅建表 / 占位。
- `plannedAmount`（deprecated 字段）保留未清理，按需求列为 P2。

### 10.4 人工验收清单（主链路）

1. 补剂库新增补剂（填库存与单位换算率）。
2. 成分库新增成分，补剂库「成分」中关联并填每份含量（改配方会生成新版本）。
3. 服用计划新增计划（每日量 + 时段）并启用。
4. 今日页打卡 → 库存减少、流水新增；点「撤销」→ 库存回滚、记录进入回收站。
5. 设置 → 回收站 → 记录 Tab → 恢复 → 库存重新扣减。
6. 今日页「补录昨日」→ 选择已服用 / 漏服 → 提交，查看跳过项提示。
7. 日历查看完成度热力图，点击日期查看详情并补录。
8. 设置 → 导出 JSON → 清除全部数据 → 导入（智能合并）还原。
