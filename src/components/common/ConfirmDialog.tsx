import { type ReactNode, useEffect, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * 三档确认强度（§8.7）：
 * - light  轻：一次确认框。用于「撤销」之外的普通删除（W-07：删除记录用轻确认）
 * - medium 中：危险色主按钮 + 不可恢复提示。用于删除补剂
 * - heavy  重：要求逐字输入指定文本才能启用按钮。用于「清除全部数据」——
 *               破坏面太大，不用普通 confirm
 *
 * 「撤销」永远不走这里：它只是删一条记录，随时可以重做（§4.6）。
 */
export type ConfirmStrength = 'light' | 'medium' | 'heavy'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  /** 额外内容（如「同时删除 N 条历史记录」的勾选项） */
  children?: ReactNode
  strength?: ConfirmStrength
  confirmLabel?: string
  cancelLabel?: string
  /** strength='heavy' 时必填：要求用户逐字输入 */
  confirmText?: string
  onConfirm: () => void | Promise<void>
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  strength = 'light',
  confirmLabel = '确认',
  cancelLabel = '取消',
  confirmText,
  onConfirm,
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false)
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (open) setTyped('')
  }, [open])

  const dangerous = strength !== 'light'
  const needText = strength === 'heavy'
  const canConfirm = (!needText || typed === confirmText) && !pending

  async function handleConfirm(event: React.MouseEvent<HTMLButtonElement>) {
    // 手动控制关闭时机：失败时保持打开，用户能看清错误
    event.preventDefault()
    setPending(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription asChild>
              <div className="space-y-2">{description}</div>
            </AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>

        {children ? <div className="space-y-3">{children}</div> : null}

        {needText ? (
          <div className="space-y-2">
            <Label htmlFor="confirm-text">输入「{confirmText}」以确认</Label>
            <Input
              id="confirm-text"
              value={typed}
              autoComplete="off"
              onChange={(event) => setTyped(event.target.value)}
            />
          </div>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant={dangerous ? 'destructive' : 'default'}
            disabled={!canConfirm}
            onClick={handleConfirm}
          >
            {pending ? '处理中…' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
