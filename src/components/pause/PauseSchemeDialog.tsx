import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ALL_SUPPLEMENTS, PAUSE_CYCLE_MODE, type PauseCycleMode } from '@/constants/enums'
import { createScheme, updateScheme } from '@/services/pauseService'
import { toast } from '@/stores/toastStore'
import type { PausePeriod, PauseScheme, Supplement } from '@/types'
import { today } from '@/utils/date'
import { newId } from '@/utils/id'

/**
 * 停药方案组编辑（§8.3 / T-206）。
 *
 * ★ 「跟随方案」与「独立起止」**必须行内可见** —— 这是全篇最容易混淆的一处：
 *   跟随方案 = 开始日由「执行方案组」那一刻决定，停止时一起结束；
 *   独立起止 = 不管方案组什么时候执行，这段停用有自己的起止。
 *   两者的区别只在 startDate 是否为空，但用户看不到字段，只能看到这个单选。
 *   把这句话藏进折叠区或帮助文档，用户就一定会建出「执行了方案但没停用」的组合。
 *
 * 条目整体重建（删了再建），不做增量 diff：条目少、界面一次性提交，
 * 「哪条对应哪条」的匹配复杂度换不来任何用户价值（pauseService.updateScheme 同理）。
 */

interface EntryDraft {
  /** 仅前端用的稳定 key，避免用下标当 key 造成输入框串值 */
  key: string
  supplementId: string
  /** follow = 跟随方案组（startDate 为空）；own = 独立起止 */
  mode: 'follow' | 'own'
  startDate: string
  endDate: string
  reason: string
}

function emptyEntry(): EntryDraft {
  return {
    key: newId(),
    supplementId: '',
    mode: 'follow',
    startDate: today(),
    endDate: '',
    reason: '',
  }
}

interface PauseSchemeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  supplements: Supplement[]
  /** 传入则为编辑 */
  scheme?: PauseScheme | null
  /** 编辑时该组已有的条目 */
  entries?: PausePeriod[]
}

export function PauseSchemeDialog({
  open,
  onOpenChange,
  supplements,
  scheme,
  entries,
}: PauseSchemeDialogProps) {
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [cycleMode, setCycleMode] = useState<PauseCycleMode>(PAUSE_CYCLE_MODE.CONTINUOUS)
  const [onDays, setOnDays] = useState('21')
  const [offDays, setOffDays] = useState('7')
  const [drafts, setDrafts] = useState<EntryDraft[]>([emptyEntry()])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(scheme?.name ?? '')
    setNote(scheme?.note ?? '')
    setCycleMode(scheme?.cycleMode ?? PAUSE_CYCLE_MODE.CONTINUOUS)
    // 默认吃 21 停 7：最常见的疗程间歇，改起来也只是两个数字
    setOnDays(scheme?.cycleOnDays == null ? '21' : String(scheme.cycleOnDays))
    setOffDays(scheme?.cycleOffDays == null ? '7' : String(scheme.cycleOffDays))
    setDrafts(
      entries && entries.length > 0
        ? entries.map((entry) => ({
            key: newId(),
            supplementId: entry.supplementId,
            mode: entry.startDate == null ? 'follow' : 'own',
            startDate: entry.startDate ?? today(),
            endDate: entry.endDate ?? '',
            reason: entry.reason ?? '',
          }))
        : [emptyEntry()],
    )
    setSaving(false)
  }, [open, scheme, entries])

  function patchDraft(key: string, patch: Partial<EntryDraft>) {
    setDrafts((list) => list.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)))
  }

  async function handleSubmit() {
    const trimmedName = name.trim()
    if (trimmedName === '') {
      toast('请填写方案名称', { variant: 'warning' })
      return
    }
    if (drafts.length === 0) {
      toast('至少添加一项要停用的补剂', { variant: 'warning' })
      return
    }
    const cyclic = cycleMode === PAUSE_CYCLE_MODE.CYCLIC
    if (cyclic) {
      const on = Number(onDays)
      const off = Number(offDays)
      if (!Number.isInteger(on) || on < 1 || !Number.isInteger(off) || off < 1) {
        toast('周期方案必须填写「吃几天 / 停几天」，且都是不小于 1 的整数', { variant: 'warning' })
        return
      }
    }
    for (const draft of drafts) {
      if (!draft.supplementId) {
        toast('有一项还没选补剂', { variant: 'warning' })
        return
      }
      if (draft.mode === 'own' && !draft.startDate) {
        toast('「独立起止」必须填写开始日期', { variant: 'warning' })
        return
      }
      if (draft.endDate && draft.mode === 'own' && draft.endDate < draft.startDate) {
        toast('结束日期不能早于开始日期', { variant: 'warning' })
        return
      }
    }

    const payload = {
      name: trimmedName,
      note: note.trim() === '' ? null : note.trim(),
      // 周期（D-44）：起点复用「执行日」，所以这里只有吃/停天数
      cycleMode,
      cycleOnDays: cyclic ? Number(onDays) : null,
      cycleOffDays: cyclic ? Number(offDays) : null,
      entries: drafts.map((draft) => ({
        supplementId: draft.supplementId,
        // ★ 这一行就是「跟随方案」的全部实现：startDate = null 时，
        //   utils/pause.ts::resolveEffectiveRange 会去取方案组的 activatedAt / endedAt
        startDate: draft.mode === 'follow' ? null : draft.startDate,
        endDate: draft.endDate === '' ? null : draft.endDate,
        reason: draft.reason.trim() === '' ? null : draft.reason.trim(),
      })),
    }

    setSaving(true)
    try {
      if (scheme) await updateScheme(scheme.id, payload)
      else await createScheme(payload)
      onOpenChange(false)
    } catch (error) {
      toast((error as Error).message, { variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{scheme ? '编辑方案组' : '新建方案组'}</DialogTitle>
          <DialogDescription>
            一套情景可以同时停多种补剂。建好之后，需要时一键执行。 也可以做成「吃 21 天停 7
            天」这样的周期疗程。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="scheme-name">方案名称 *</Label>
            <Input
              id="scheme-name"
              value={name}
              placeholder="例如：抗生素期间"
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="scheme-note">备注（可留空）</Label>
            <Input
              id="scheme-note"
              value={note}
              placeholder="帮未来的你想起为什么定这套方案"
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          {/* 周期（D-44）：从健康角度的「吃 21 天停 7 天」。
              与补剂页的「服用节奏」不是同一件事：那边是给药排班（判为「今天不用吃」），
              这边是疗程间歇（判为「停用中」，带方案名与原因）。 */}
          <div className="space-y-2">
            <Label>停药方式 *</Label>
            <RadioGroup
              value={cycleMode}
              onValueChange={(value) => setCycleMode(value as PauseCycleMode)}
              className="flex gap-6"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem id="scheme-cycle-continuous" value={PAUSE_CYCLE_MODE.CONTINUOUS} />
                <Label htmlFor="scheme-cycle-continuous" className="font-normal">
                  连续
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  id="scheme-cycle-cyclic"
                  value={PAUSE_CYCLE_MODE.CYCLIC}
                  aria-label="周期"
                />
                <Label htmlFor="scheme-cycle-cyclic" className="font-normal">
                  周期（吃 N 停 M）
                </Label>
              </div>
            </RadioGroup>

            {cycleMode === PAUSE_CYCLE_MODE.CONTINUOUS ? (
              <p className="text-muted-foreground text-xs">执行后一直停用，直到你手动停止。</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span>吃</span>
                  <Input
                    className="w-20"
                    type="number"
                    min={1}
                    step={1}
                    value={onDays}
                    aria-label="吃几天"
                    onChange={(event) => setOnDays(event.target.value)}
                  />
                  <span>天，停</span>
                  <Input
                    className="w-20"
                    type="number"
                    min={1}
                    step={1}
                    value={offDays}
                    aria-label="停几天"
                    onChange={(event) => setOffDays(event.target.value)}
                  />
                  <span>天</span>
                </div>
                {/* 「执行日就是第 1 天」必须写出来：用户会去找一个「周期起点」输入框 */}
                <p className="text-muted-foreground text-xs">
                  从「执行」那天算第 1 天开始循环。吃 21 停 7 = 执行后吃 21 天，第 22–28 天停用，第
                  29 天恢复。
                </p>
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label>覆盖哪些补剂 *</Label>

            <div className="space-y-3">
              {drafts.map((draft) => (
                <div key={draft.key} className="space-y-3 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Select
                      value={draft.supplementId}
                      onValueChange={(value) => patchDraft(draft.key, { supplementId: value })}
                    >
                      <SelectTrigger className="w-full" aria-label="要停用的补剂">
                        <SelectValue placeholder="选择补剂" />
                      </SelectTrigger>
                      <SelectContent>
                        {supplements.map((supplement) => (
                          <SelectItem key={supplement.id} value={supplement.id}>
                            {supplement.name}
                          </SelectItem>
                        ))}
                        <SelectSeparator />
                        <SelectItem value={ALL_SUPPLEMENTS}>全部补剂</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="删除这一项"
                      disabled={drafts.length <= 1}
                      onClick={() =>
                        setDrafts((list) => list.filter((item) => item.key !== draft.key))
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>

                  {/* ★ 全篇最容易混淆处，必须行内可见 */}
                  <RadioGroup
                    value={draft.mode}
                    onValueChange={(value) =>
                      patchDraft(draft.key, { mode: value as 'follow' | 'own' })
                    }
                    className="flex gap-6"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem
                        id={`${draft.key}-follow`}
                        value="follow"
                        aria-label="跟随方案"
                      />
                      <Label htmlFor={`${draft.key}-follow`} className="font-normal">
                        跟随方案
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem id={`${draft.key}-own`} value="own" aria-label="独立起止" />
                      <Label htmlFor={`${draft.key}-own`} className="font-normal">
                        独立起止
                      </Label>
                    </div>
                  </RadioGroup>

                  {draft.mode === 'follow' ? (
                    <p className="text-muted-foreground text-xs">
                      执行方案时开始，停止方案时结束。不填开始日。
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">从哪天开始 *</Label>
                        <Input
                          type="date"
                          value={draft.startDate}
                          aria-label="独立起止的开始日期"
                          onChange={(event) =>
                            patchDraft(draft.key, { startDate: event.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">到哪天为止（含当天）</Label>
                        <Input
                          type="date"
                          value={draft.endDate}
                          aria-label="独立起止的结束日期"
                          onChange={(event) =>
                            patchDraft(draft.key, { endDate: event.target.value })
                          }
                        />
                      </div>
                    </div>
                  )}

                  {draft.mode === 'follow' ? (
                    <div className="space-y-1.5">
                      <Label className="text-xs">到哪天为止（含当天）</Label>
                      <Input
                        type="date"
                        value={draft.endDate}
                        aria-label="跟随方案的结束日期"
                        onChange={(event) => patchDraft(draft.key, { endDate: event.target.value })}
                      />
                      <p className="text-muted-foreground text-xs">留空 = 跟着方案一起结束</p>
                    </div>
                  ) : null}

                  <div className="space-y-1.5">
                    <Label className="text-xs">原因（可留空）</Label>
                    <Input
                      value={draft.reason}
                      placeholder="帮未来的你想起为什么停"
                      aria-label="停用原因"
                      onChange={(event) => patchDraft(draft.key, { reason: event.target.value })}
                    />
                  </div>
                </div>
              ))}
            </div>

            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              onClick={() => setDrafts((list) => [...list, emptyEntry()])}
            >
              <Plus className="size-4" />
              添加一项
            </Button>
          </div>

          {scheme ? (
            <p className="text-muted-foreground text-xs">修改只影响未来判定，已产生的记录不变。</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default PauseSchemeDialog
