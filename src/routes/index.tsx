import type { RouteObject } from 'react-router-dom'
import AppShell from '@/components/layout/AppShell'
import PausePeriodsPage from '@/pages/pausePeriods'
import SettingsPage from '@/pages/settings'
import SupplementsPage from '@/pages/supplements'
import TodayPage from '@/pages/today'

/**
 * 路由（§8.3 / T-122）。
 *
 * M1 只有 4 项：今日 / 补剂 / 停药 / 设置。
 * 日历在 M2（T-204）、成分库在 M3（T-304）加入；已移除 /plans（功能并入补剂页）。
 * M1 阶段导航不允许有「点不进去的死链」。
 */
const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <TodayPage /> },
      { path: 'supplements', element: <SupplementsPage /> },
      { path: 'pause-periods', element: <PausePeriodsPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
]

export default routes
