import type { RouteObject } from 'react-router-dom'
import AppShell from '@/components/layout/AppShell'
import CalendarPage from '@/pages/calendar'
import IngredientsPage from '@/pages/ingredients'
import PausePeriodsPage from '@/pages/pausePeriods'
import PlansPage from '@/pages/plans'
import SettingsPage from '@/pages/settings'
import SupplementsPage from '@/pages/supplements'
import TodayPage from '@/pages/today'

const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <TodayPage /> },
      { path: 'supplements', element: <SupplementsPage /> },
      { path: 'ingredients', element: <IngredientsPage /> },
      { path: 'plans', element: <PlansPage /> },
      { path: 'pause-periods', element: <PausePeriodsPage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
]

export default routes
