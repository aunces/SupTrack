import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import RecycleBin from '@/components/recycle/RecycleBin'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DEFAULT_BACKFILL_WINDOW_DAYS, META_KEY } from '@/constants/enums'
import { db } from '@/db'
import {
  EXPORT_TABLES,
  exportToFile,
  importData,
  type ImportStrategy,
} from '@/services/importService'
import { metaService } from '@/services/metaService'
import { metaRepository } from '@/repositories'
import { toast } from '@/stores/toastStore'

export function SettingsPage() {
  const [strategy, setStrategy] = useState<ImportStrategy>('merge')
  const [summary, setSummary] = useState<string | null>(null)
  const [windowDays, setWindowDays] = useState<string>('')

  const storedWindowDays = useLiveQuery(
    () => metaService.getBackfillWindowDays(),
    [],
    DEFAULT_BACKFILL_WINDOW_DAYS,
  )
  const counts = useLiveQuery(
    async () => {
      const result: Record<string, number> = {}
      for (const table of EXPORT_TABLES) {
        result[table] = await db.table(table).count()
      }
      return result
    },
    [],
    {},
  )

  async function handleImport(file: File) {
    try {
      const text = await file.text()
      const result = await importData(text, strategy)
      const parts = [
        `新增 ${result.added} 条`,
        `覆盖 ${result.updated} 条`,
        `保留 ${result.kept} 条`,
      ]
      if (result.skipped > 0) parts.push(`跳过 ${result.skipped} 条状态异常记录`)
      setSummary(parts.join('，'))
      toast('导入完成（已自动备份当前数据）')
    } catch (error) {
      toast((error as Error).message, { variant: 'destructive' })
    }
  }

  async function clearAll() {
    if (!window.confirm('将清空全部本地数据（含回收站），且不可恢复。确认继续？')) return
    await db.delete()
    await db.open()
    await metaService.initDefaults()
    toast('数据已清空')
  }

  async function saveWindowDays() {
    const value = Number(windowDays)
    if (!Number.isInteger(value) || value <= 0) {
      toast('请输入正整数', { variant: 'destructive' })
      return
    }
    await metaRepository.set(META_KEY.BACKFILL_WINDOW_DAYS, value)
    toast('已保存')
  }

  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-semibold">设置</h1>

      <Tabs defaultValue="data">
        <TabsList>
          <TabsTrigger value="data">数据管理</TabsTrigger>
          <TabsTrigger value="recycle">回收站</TabsTrigger>
          <TabsTrigger value="defaults">默认设置</TabsTrigger>
          <TabsTrigger value="about">关于与隐私</TabsTrigger>
        </TabsList>

        <TabsContent value="data" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">导出 / 导入</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Button onClick={() => void exportToFile()}>导出 JSON</Button>
                <span className="text-muted-foreground text-xs">
                  包含已软删除记录；导入前会自动备份当前数据。
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept="application/json"
                  className="w-72"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void handleImport(file)
                  }}
                />
                <Select value={strategy} onValueChange={(v) => setStrategy(v as ImportStrategy)}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="merge">智能合并</SelectItem>
                    <SelectItem value="overwrite">覆盖全部</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {summary && <p className="text-sm">{summary}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">数据统计</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid grid-cols-3 gap-2 text-sm">
                {Object.entries(counts).map(([table, count]) => (
                  <li key={table} className="flex justify-between border-b py-1">
                    <span>{table}</span>
                    <span>{count}</span>
                  </li>
                ))}
              </ul>
              <Button variant="destructive" className="mt-4" onClick={clearAll}>
                清除全部数据
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recycle" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              <RecycleBin />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="defaults" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">补录范围</CardTitle>
            </CardHeader>
            <CardContent className="flex items-end gap-2">
              <div className="flex flex-col gap-1">
                <Label>可补录的天数（当前 {storedWindowDays} 天）</Label>
                <Input
                  type="number"
                  min={1}
                  value={windowDays}
                  placeholder={String(storedWindowDays)}
                  onChange={(e) => setWindowDays(e.target.value)}
                />
              </div>
              <Button onClick={saveWindowDays}>保存</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="about" className="mt-4">
          <Card>
            <CardContent className="space-y-2 pt-4 text-sm">
              <p>SupTrack · 纯前端补剂摄入记录工具</p>
              <p className="text-muted-foreground">
                所有数据仅存储在你的浏览器本地（IndexedDB），不会上传至任何服务器，也不提供云端同步。
              </p>
              <p className="text-muted-foreground">
                导出的 JSON 含健康摄入记录，属于敏感个人信息，请妥善保管并定期备份。
              </p>
              <p className="text-muted-foreground">本应用不使用任何第三方分析或追踪服务。</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default SettingsPage
