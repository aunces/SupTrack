import {
  Calendar,
  ChevronDown,
  CirclePause,
  ClipboardCheck,
  FlaskConical,
  Pill,
  Settings,
  type LucideIcon,
} from 'lucide-react'
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
 * 侧栏的尺寸、间距、配色逐项对齐 Ardot《SupTrack · UI 设计稿 v1.0》的
 * 「侧栏 · 220」组件（30:20）：
 *   品牌标识 20×20、圆角 6、#161616、白色胶囊字形；品牌名 15px Bold
 *   导航项 高 36、圆角 6、左右内边距 12、图标 16 与文字间距 8、文字 14px
 *   侧栏内边距 左右 16 / 上下 20，品牌区与导航间距 22
 * 颜色不额外硬编码：设计稿的中性灰正是本项目的 `muted-foreground`
 * （oklch 0.556）与 `foreground`，所以图标直接继承文字色。
 *
 * M1 = 4 项，M2 加「日历」，M3 加「成分库」，现为 6 项。
 */

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end: boolean
}

const NAV: NavItem[] = [
  // 图标语义与设计稿一致：图标 / 今日 / 补剂 / 停药 / 日历 / 成分库 / 设置
  { to: '/', label: '今日', icon: ClipboardCheck, end: true },
  { to: '/supplements', label: '补剂', icon: Pill, end: false },
  { to: '/pause-periods', label: '停药', icon: CirclePause, end: false },
  { to: '/calendar', label: '日历', icon: Calendar, end: false },
  { to: '/ingredients', label: '成分库', icon: FlaskConical, end: false },
  { to: '/settings', label: '设置', icon: Settings, end: false },
]

function navItemClass(isActive: boolean): string {
  return cn(
    // 圆角写死 6px 而不是用 rounded-md：设计稿这一处用的是 shadcn 默认
    // --radius: 0.5rem（rounded-md = 6px），本项目是 0.625rem（= 8px）。
    // 按「与设计稿对齐」取 6px，且与品牌标识的圆角保持一致。
    'flex h-9 items-center gap-2 rounded-[6px] px-3 text-sm transition-colors',
    isActive ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:bg-accent/50',
  )
}

/** 品牌标识（设计稿 30:22）：深色圆角方块 + 白色胶囊字形。品牌色固定，不走语义 token */
function BrandMark() {
  return (
    <span className="grid size-5 shrink-0 place-items-center rounded-[6px] bg-[#161616]">
      <Pill className="size-3 text-white" aria-hidden />
    </span>
  )
}

export function AppShell() {
  const location = useLocation()
  const current = NAV.find((item) =>
    item.end ? location.pathname === item.to : location.pathname.startsWith(item.to),
  )
  /** 今日页是满宽看板（设计稿 3:1023），其余页面保持 §8 的「内容区 720 居中」 */
  const wide = location.pathname === '/'

  return (
    <div className="flex h-screen">
      <aside className="hidden w-[220px] shrink-0 flex-col border-r md:flex">
        <div className="flex items-center gap-2 px-4 pt-5">
          <BrandMark />
          <span className="text-[15px] font-bold">SupTrack</span>
        </div>

        <nav className="mt-[22px] flex flex-col gap-1 px-4">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => navItemClass(isActive)}
            >
              <item.icon className="size-4 shrink-0" aria-hidden />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="text-muted-foreground mt-auto px-4 pb-5 text-xs tabular-nums">
          v{import.meta.env.VITE_APP_VERSION ?? '0.2.0'}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-4 py-3 md:hidden">
          <span className="flex items-center gap-2">
            <BrandMark />
            <span className="text-[15px] font-bold">SupTrack</span>
          </span>
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
                  {/* 窄屏下拉与侧栏用同一组图标，避免两套导航长得不一样 */}
                  <NavLink to={item.to} end={item.end} className="flex items-center gap-2">
                    <item.icon className="size-4 shrink-0" aria-hidden />
                    {item.label}
                  </NavLink>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto">
          {/* 断网提示条（§8.7）：不阻塞、不弹窗；在线时整块不占位。
              左右留白跟随所在页面的内容区：今日页按设计稿是满宽（32），其余页面仍是 720 居中。 */}
          <div
            className={cn(
              'w-full empty:hidden',
              wide ? 'px-8 pt-8' : 'mx-auto max-w-[720px] px-6 pt-6',
            )}
          >
            <OfflineBanner />
          </div>
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default AppShell
