import { useEffect, useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { countRelatedRecords, deleteSupplement } from '@/services/supplementService'
import { exportToFile } from '@/services/importExportService'
import { toast } from '@/stores/toastStore'
import type { Supplement } from '@/types'

/**
 * 删除补剂确认（§8.2）。这是唯一的防误删闸门，所以必须认真做：
 * - 正文里的 N 是**实时算出的真实数字**（RK-01）：抽象提示不构成有效确认
 * - 「同时删除历史记录」默认勾选
 * - 提示「建议先导出备份再删除」
 */
interface DeleteSupplementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  supplement: Supplement | null
}

export function DeleteSupplementDialog({
  open,
  onOpenChange,
  supplement,
}: DeleteSupplementDialogProps) {
  const [deleteRecords, setDeleteRecords] = useState(true)
  const [recordCount, setRecordCount] = useState(0)

  useEffect(() => {
    if (!open || !supplement) return
    setDeleteRecords(true)
    let cancelled = false
    void countRelatedRecords(supplement.id).then((count) => {
      if (!cancelled) setRecordCount(count)
    })
    return () => {
      cancelled = true
    }
  }, [open, supplement])

  if (!supplement) return null

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      strength="medium"
      title="删除补剂"
      confirmLabel="删除"
      onConfirm={async () => {
        try {
          await deleteSupplement(supplement.id, deleteRecords)
        } catch (error) {
          toast((error as Error).message, { variant: 'destructive' })
          throw error
        }
      }}
      description={
        <>
          将删除 {supplement.name}、它的计划，以及{' '}
          <span className="text-foreground font-medium tabular-nums">{recordCount}</span>{' '}
          条历史记录。
        </>
      }
    >
      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          checked={deleteRecords}
          onCheckedChange={(checked) => setDeleteRecords(checked === true)}
        />
        <span>
          同时删除该补剂的 <span className="tabular-nums">{recordCount}</span> 条历史记录
          <span className="text-muted-foreground mt-1 block text-xs">
            取消勾选则保留历史记录，但补剂会被隐藏，成分汇总里这些记录将无法解析来源。
          </span>
        </span>
      </label>

      <p className="text-muted-foreground text-xs">
        建议先导出备份再删除。
        <button
          type="button"
          className="ml-1 underline underline-offset-2"
          onClick={() => void exportToFile()}
        >
          前往导出
        </button>
      </p>
    </ConfirmDialog>
  )
}

export default DeleteSupplementDialog
