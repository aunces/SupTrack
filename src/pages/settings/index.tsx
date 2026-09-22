import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { clearAllData, exportToFile, importFromFile } from '@/services/importExportService'
import { useDataVersion } from '@/stores/dataVersion'
import { toast } from '@/stores/toastStore'
import { formatDate, formatTime } from '@/utils/date'
import { useLiveQuery } from 'dexie-react-hooks'
import { metaService } from '@/services/metaService'

/**
 * 设置页（§8.6）。三个分区，M1 不放任何开关。
 *
 * 「上次导出时间」必须常驻显示：这个产品的数据只存在本机，没有第二份，
 * 导出是唯一的保险；这行时间让「多久没备份了」变得可感知。
 */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-card mb-4 rounded-xl border">
      <header className="border-b px-4 py-2.5 text-sm font-medium">{title}</header>
      <div className="space-y-3 px-4 py-4">{children}</div>
    </section>
  )
}

export function SettingsPage() {
  const version = useDataVersion((s) => s.version)
  const fileRef = useRef<HTMLInputElement>(null)
  const [clearOpen, setClearOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const lastExportAt = useLiveQuery(() => metaService.getLastExportAt(), [version], undefined)

  async function handleExport() {
    setBusy(true)
    try {
      await exportToFile()
      toast('已导出备份')
    } catch (error) {
      toast((error as Error).message, { variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  async function handleImport(file: File) {
    setBusy(true)
    try {
      const result = await importFromFile(file)
      const total = Object.values(result.imported).reduce((sum, count) => sum + count, 0)
      toast(
        result.issues.length > 0
          ? `已导入 ${total} 条，跳过 ${result.issues.length} 条不合法的数据`
          : `已导入 ${total} 条`,
      )
    } catch (error) {
      toast((error as Error).message, { variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[720px] p-6">
      <h1 className="mb-4 text-xl font-semibold">设置</h1>

      <Section title="数据">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExport} disabled={busy}>
            导出 JSON
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
            导入 JSON
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void handleImport(file)
            }}
          />
        </div>

        <p className="text-muted-foreground text-sm tabular-nums">
          上次导出：
          {lastExportAt
            ? `${formatDate(new Date(lastExportAt))} ${formatTime(lastExportAt)}`
            : '还没有导出过'}
        </p>
        <p className="text-muted-foreground text-xs">
          导入将清空当前数据并替换为备份内容（导入前会自动备份）
        </p>
      </Section>

      <Section title="危险区">
        <div className="space-y-1">
          <Button variant="destructive" onClick={() => setClearOpen(true)} disabled={busy}>
            清除全部数据
          </Button>
          <p className="text-muted-foreground text-xs">需输入「清除」二次确认，且不可恢复</p>
        </div>
      </Section>

      <Section title="关于">
        <p className="text-sm tabular-nums">版本 {import.meta.env.VITE_APP_VERSION ?? '0.2.0'}</p>
        <Separator />
        <div className="text-muted-foreground space-y-1 text-xs">
          <p>全部数据只存在本机浏览器，不上传、不联网、不收集信息</p>
          <p>本应用是记录工具，不是医疗建议。</p>
          <p>删除后无法恢复，请定期导出备份。</p>
        </div>
      </Section>

      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        strength="heavy"
        confirmText="清除"
        title="清除全部数据"
        confirmLabel="清除全部数据"
        description="这会删掉所有补剂、计划、记录与停药设置，且无法恢复。建议先导出备份。"
        onConfirm={async () => {
          try {
            await clearAllData()
            toast('已清除全部数据')
          } catch (error) {
            toast((error as Error).message, { variant: 'destructive' })
            throw error
          }
        }}
      />
    </div>
  )
}

export default SettingsPage
