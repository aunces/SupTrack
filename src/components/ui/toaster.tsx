import { useToastStore } from '@/stores/toastStore'
import { cn } from 'cn'
import { X } from 'lucide-react'

const VARIANT_CLASS = {
  default: 'border-border bg-background text-foreground',
  destructive: 'border-destructive bg-destructive text-white',
  warning: 'border-amber-500 bg-amber-50 text-amber-900',
} as const

export function Toaster() {
  const items = useToastStore((s) => s.items)
  const dismiss = useToastStore((s) => s.dismiss)

  if (items.length === 0) return null

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-96 flex-col gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          className={cn(
            'pointer-events-auto rounded-md border p-3 shadow-lg',
            VARIANT_CLASS[item.variant],
          )}
          role="status"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="text-sm font-medium">{item.title}</div>
            <button
              className="opacity-60 hover:opacity-100"
              onClick={() => dismiss(item.id)}
              aria-label="关闭提示"
            >
              <X className="size-4" />
            </button>
          </div>
          {item.description ? (
            <div className="mt-1 text-xs opacity-80">{item.description}</div>
          ) : null}
        </div>
      ))}
    </div>
  )
}
