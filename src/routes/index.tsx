import type { RouteObject } from 'react-router-dom'
import AppShell from '@/components/layout/AppShell'
import CalendarPage from '@/pages/calendar'
import PausePeriodsPage from '@/pages/pausePeriods'
import SettingsPage from '@/pages/settings'
import SupplementsPage from '@/pages/supplements'
import TodayPage from '@/pages/today'

/**
 * 路由（§8.3 / T-122 / T-211）。
 *
 * M1：今日 / 补剂 / 停药 / 设置（4 项）
 * M2：+ 日历，插在设置之前（5 项）
 * M3：+ 成分库（6 项）
 * 已移除 /plans（功能并入补剂页）。任何阶段导航都不允许有「点不进去的死链」。
 */
const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <TodayPage /> },
      { path: 'supplements', element: <SupplementsPage /> },
      { path: 'pause-periods', element: <PausePeriodsPage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
]

export default routes
