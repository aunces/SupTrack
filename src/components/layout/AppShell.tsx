import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/', label: '今日', end: true },
  { to: '/supplements', label: '补剂库', end: false },
  { to: '/ingredients', label: '成分库', end: false },
  { to: '/plans', label: '服用计划', end: false },
  { to: '/pause-periods', label: '停药期', end: false },
  { to: '/calendar', label: '日历', end: false },
  { to: '/settings', label: '设置', end: false },
]

export function AppShell() {
  return (
    <div className="flex min-h-screen">
      <aside className="w-48 shrink-0 border-r p-4">
        <div className="mb-6 text-base font-semibold">SupTrack</div>
        <nav className="flex flex-col gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'rounded-md px-3 py-2 text-sm transition-colors',
                  isActive ? 'bg-accent font-medium' : 'hover:bg-accent/50',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  )
}

export default AppShell
