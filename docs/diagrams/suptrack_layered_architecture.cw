# session_id: f7c03d7f-59b9-4438-8326-c2324351fcb9
classes: {
  zone_1: {
    style: {
      fill: "#F1F5FF"
      stroke: "#4E81FF"
      font-color: "#333333"
      border-radius: 8
    }
  }
  zone_2: {
    style: {
      fill: "#F3F7FF"
      stroke: "#4E81FF"
      font-color: "#333333"
      border-radius: 8
    }
  }
  zone_3: {
    style: {
      fill: "#F6F9FF"
      stroke: "#4E81FF"
      font-color: "#333333"
      border-radius: 8
    }
  }
  zone_4: {
    style: {
      fill: "#F9FBFF"
      stroke: "#4E81FF"
      font-color: "#333333"
      border-radius: 8
    }
  }
  zone_5: {
    style: {
      fill: "#FCFDFF"
      stroke: "#4E81FF"
      font-color: "#333333"
      border-radius: 8
    }
  }
  entity: {
    style: {
      fill: "#FFFFFF"
      stroke: "#E8ECF5"
      font-color: "#333333"
      border-radius: 6
      shadow: true
    }
  }
  signal: {
    style: {
      fill: transparent
      font-color: "#6B7280"
    }
  }
  accent_1: {
    style: {
      fill: "#FCEEE0"
      stroke: "#E8912D"
      font-color: "#333333"
      border-radius: 6
      shadow: true
    }
  }
  accent_2: {
    style: {
      fill: "#EBE4F9"
      stroke: "#7A4DD4"
      font-color: "#333333"
      border-radius: 6
      shadow: true
    }
  }
}

direction: down

title: SupTrack 分层架构（v0.2.0 · 前端即全栈 · 纯本地离线） {
  shape: text
  style.font-size: 28
  style.bold: true
}

body: {
  label: ""
  style.fill: transparent
  style.stroke: transparent
  direction: right

  stack: {
    label: ""
    style.fill: transparent
    style.stroke: transparent
    direction: down

    L1_bootstrap: {
      class: zone_1
      label: "第 1 层 · 应用入口与外壳（bootstrap）"

      "main.tsx": "main.tsx — 异步 bootstrap：元数据默认值 → 写版本号 → 注册 SW → 挂载根节点（唯一启动闸门）"
      "App.tsx": "App.tsx — ErrorBoundary 顶层组件，useRoutes 消费路由表"
      "routes/index.tsx": "routes/index.tsx — 路由表：6 页面挂 AppShell 下（HashRouter）"
      "components/ErrorBoundary": "ErrorBoundary — 渲染期异常兜底"
    }

    L2_presentation: {
      class: zone_2
      label: "第 2 层 · 布局与 UI 组件层（presentation · 不直接查库、不判业务状态）"
      direction: down

      "components/layout/AppShell": "AppShell — PC 侧栏 220px + 内容限宽 720px；窄屏 <860px 收为顶部下拉；含 OfflineBanner"

      pages: {
        label: "pages · 6 个页面（只渲染，不判状态）"
        class: entity
        "pages/Today": "今日"
        "pages/Supplements": "补剂"
        "pages/PausePeriods": "停药"
        "pages/Calendar": "日历"
        "pages/Ingredients": "成分库"
        "pages/Settings": "设置"
      }

      "components/today": "components/today — 打卡清单 / 手动录入 / 备份提醒"
      "components/supplement": "components/supplement — 补剂与成分关联"
      "components/pause": "components/pause — 停药方案"
      "components/ingredient": "components/ingredient — 成分"
      "components/backfill": "components/backfill — 补录"
      "components/common": "components/common — 空态 / 错误态 / 骨架 / 断网条"
      "components/ui": "components/ui — 23 个 Radix 基础组件"
    }

    L3_hooks: {
      class: zone_3
      label: "第 3 层 · 状态订阅与派生层（hooks + stores · 只做取材→纯函数推导）"
      direction: right

      hooks: {
        label: "数据 hooks · useLiveQuery 订阅 Dexie"
        class: entity
        "hooks/useTodayData": "useTodayData — 今日清单/分组/统计/预警一次组装"
        "hooks/useCalendarMonth": "useCalendarMonth — 42 格月历"
        "hooks/usePauseData": "usePauseData"
        "hooks/useSupplementList": "useSupplementList"
        "hooks/useIngredientSummary": "useIngredientSummary"
      }

      stores: {
        label: "Zustand stores"
        class: entity
        "stores/dataVersion": "dataVersion — 跨标签页一致性计数器（BroadcastChannel 触发重查）"
        "stores/toastStore": "toastStore — 全局轻提示队列"
      }
    }

    L4_service_repo: {
      class: zone_4
      label: "第 4 层 · 领域服务与仓储层（service + repository · 业务规则与事务边界所在）"

      services: {
        label: "服务层 · 11 个 service"
        class: entity
        direction: right

        intakePlanGroup: {
          label: "打卡 / 计划 / 停药 / 补录"
          class: zone_4
          "intakeService": "intakeService — 打卡/追加/撤销/改量"
          "planService": "planService — 计划与节奏"
          "pauseService": "pauseService — 停药方案组"
          "backfillService": "backfillService — 补录"
        }

        catalogGroup: {
          label: "补剂 / 成分 / 汇总 / 统计"
          class: zone_4
          "supplementService": "supplementService"
          "ingredientService": "ingredientService"
          "summaryService": "summaryService — 成分汇总"
          "statsService": "statsService"
          "stockAdjust": "stockAdjust — 余量联动唯一入口"
        }

        systemGroup: {
          label: "导入导出 / 元数据"
          class: zone_4
          "importExportService": "importExportService — 导入导出/备份恢复"
          "metaService": "metaService — 元数据"
        }
      }

      repositories: {
        label: "仓储层 · 9 个 repository（不含业务规则）"
        class: entity
        "base.ts": "base.ts — 表级通用 CRUD"
        "dailyIntakeRepository": "dailyIntakeRepository — listByDate / listByDateRange / findActive"
        "supplementIngredientRepository": "supplementIngredientRepository — effectiveAt 按日匹配当时配方"
        "otherRepositories": "其它实体仓储 ×7 — 专用查询扩展"
      }

      "schemas": "schemas — 8 个 Zod schema，写入口统一 parseOrThrow 校验"
    }

    L5_persistence: {
      class: zone_5
      label: "第 5 层 · 数据持久化与领域模型（persistence + domain）"

      "db/schema": {
        class: accent_2
        label: "db/schema — Dexie 库 suptrack-v12，8 张表：supplements / dosagePlans / dailyIntakes / pausePeriods / pauseSchemes / meta / ingredients / supplementIngredients（带生效区间）；索引 [date+supplementId]、[date+timeSlot]"
      }

      "types/index.ts": "types/index.ts — 领域模型定义（Supplement / DosagePlan / DailyIntake / PausePeriod / PauseScheme / Ingredient / SupplementIngredient）"
      "constants/": "constants/ — 值域枚举（时段/节奏/停药周期/记录来源）+ 阈值（补录 7 天 / 余量偏低 5 天 / 临期 30 天）"
    }
  }

  utils_rail: {
    class: entity
    label: "横切层 · 纯函数领域逻辑（utils）—— 只 import types / constants，可被单独单测，被 services 与 hooks 调用"
    grid-columns: 1

    "utils/dayState": {
      class: accent_1
      label: "utils/dayState ★判定核心 — 四态判定（已服 > 停用 > 休息 > 待服）+ 日级状态推导；今日页与日历页共用，永不各说各话"
    }
    "utils/rate": "utils/rate — 节奏匹配（每日 / 循环 N 吃 M 休）、下次应服日、日均密度"
    "utils/pause": "utils/pause — 停药区间与方案组命中、周期进度"
    "utils/stock": "utils/stock — 余量预警、预计可用天数"
    "utils/summary": "utils/summary — 成分汇总与上限超限判定"
    "utils/calendar": "utils/calendar"
    "utils/date": "utils/date"
    "utils/id": "utils/id"
    "utils/unit": "utils/unit"
    "utils/broadcast": "utils/broadcast — publishDataChange 广播"
    "utils/intakeFactory": "utils/intakeFactory"
  }
}

body.stack.(L2_presentation.pages.pages/Today -> L4_service_repo.services.intakeService): "用户打卡"
body.stack.L4_service_repo.(services.intakeService -> schemas): "parseOrThrow 运行时校验"
body.stack.L4_service_repo.(services.intakeService -> repositories): "db.transaction：insert 记录 + stockAdjust 扣减余量（同事务）"
body.stack.(L3_hooks.hooks.hooks/useTodayData -> L4_service_repo.repositories): "useLiveQuery 取材（依赖 5 个仓储）"
body.(stack.L3_hooks.hooks.hooks/useTodayData -> utils_rail.utils/dayState): "resolveDayItems 推导四态清单"
body.stack.(L5_persistence.db/schema -> L3_hooks.hooks.hooks/useTodayData): "liveQuery 同标签页自动重查"
body.stack.L3_hooks.(stores.stores/dataVersion -> hooks.hooks/useTodayData): "BroadcastChannel 跨页广播 → 版本自增触发重查"
body.(stack.L4_service_repo.services -> utils_rail): "调用纯函数（不依赖 db / React）"
body.stack.(L4_service_repo.services -> L5_persistence.constants/): "复用值域枚举与阈值"

note: |`md
  ## 支撑设施（零依赖边）
  - **PWA**：public/sw.js + Service Worker 注册，离线可用；新版本就绪等用户确认后再接管，避免打卡被打断
  - **测试**：Vitest（node + fake-indexeddb），src/test 覆盖 schema / repository / service 三层
  - **构建**：Vite 7，产物按 radix / icons / dexie / react 分包；ESLint + Prettier + Husky + lint-staged 守规范
  - **依赖纪律**：hooks → services → repositories → Dexie 严格单向向下，无反向依赖、无跨层跳级
`|
# layoutopt:v1 local-options={"auto_grid":true,"target_width":1600,"target_height":900,"min_font_size":10,"max_candidates":8,"budget_ms":10000,"constraints":{"allow_chain_reflow":true}}
