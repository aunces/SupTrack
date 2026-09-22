import { ChevronDown } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { OfflineBanner } from '@/components/common/OfflineBanner'
import { cn } from 'cn'

/**
 * 应用骨架（§8 前言 / §8.3 布局）。
 *
 * PC 优先：侧栏 220px 固定（不随内容滚动），内容区限宽 720px 居中、内部独立滚动。
 * 窄屏（< 860px）：侧栏收为顶部下拉，内容区占满宽度。
 * 不做底部 Tab、不做触摸手势、不做 44px 热区（R-03）。
 *
 * M1 = 4 项，M2 加「日历」，M3 加「成分库」。
 */

const NAV = [
  { to: '/', label: '今日', end: true },
  { to: '/supplements', label: '补剂', end: false },
  { to: '/pause-periods', label: '停药', end: false },
  { to: '/calendar', label: '日历', end: false },
  { to: '/settings', label: '设置', end: false },
] as const

function navItemClass(isActive: boolean): string {
  return cn(
    'rounded-md px-3 py-2 text-sm transition-colors',
    isActive ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:bg-accent/50',
  )
}

export function AppShell() {
  const location = useLocation()
  const current = NAV.find((item) =>
    item.end ? location.pathname === item.to : location.pathname.startsWith(item.to),
  )

  return (
    <div className="flex h-screen">
      <aside className="hidden w-[220px] shrink-0 flex-col border-r md:flex">
        <div className="px-5 py-5 text-base font-semibold">SupTrack</div>
        <nav className="flex flex-col gap-1 px-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => navItemClass(isActive)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="text-muted-foreground mt-auto px-5 py-4 text-xs tabular-nums">
          v{import.meta.env.VITE_APP_VERSION ?? '0.2.0'}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-4 py-3 md:hidden">
          <span className="text-base font-semibold">SupTrack</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1">
                {current?.label ?? '今日'}
                <ChevronDown className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {NAV.map((item) => (
                <DropdownMenuItem key={item.to} asChild>
                  <NavLink to={item.to} end={item.end}>
                    {item.label}
                  </NavLink>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto">
          {/* 断网提示条（§8.7）：不阻塞、不弹窗；在线时整块不占位 */}
          <div className="mx-auto w-full max-w-[720px] px-6 pt-6 empty:hidden">
            <OfflineBanner />
          </div>
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default AppShell
