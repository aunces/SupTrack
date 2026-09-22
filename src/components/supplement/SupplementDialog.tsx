import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { TIME_SLOT_LABEL, TIME_SLOT_VALUES, type TimeSlot } from '@/constants/enums'
import { UNIT_TYPE_LABEL, UNIT_TYPE_VALUES, type UnitType } from '@/constants/units'
import { RATE_PRESETS, type RateParams } from '@/utils/rate'
import { IngredientLinksSection } from './IngredientLinksSection'
import { createSupplement, updateSupplement } from '@/services/supplementService'
import { savePlanForSupplement } from '@/services/planService'
import { toast } from '@/stores/toastStore'
import { today } from '@/utils/date'
import type { DosagePlan, Supplement } from '@/types'

/**
 * 新增 / 编辑补剂（§8.2）。
 *
 * 节奏在数据上属于「计划」，但在用户心里它就是「这个补剂怎么吃」——
 * 所以两者合并在同一个入口、同一个表单，不单独开「服用计划」页面。
 *
 * W-06：9 个字段平铺，不做折叠区，顺序不可调。
 */

interface SupplementFormState {
  name: string
  unitType: UnitType
  amountPerTime: string
  stockCount: string
  timeSlots: TimeSlot[]
  rateKey: string
  everyN: string
  onDays: string
  offDays: string
  anchorDate: string
  expiryDate: string
  notes: string
  isActive: boolean
}

interface FieldErrors {
  name?: string
  amountPerTime?: string
  timeSlots?: string
  rate?: string
}

function initialState(
  supplement?: Supplement | null,
  plan?: DosagePlan | null,
): SupplementFormState {
  const rateKey =
    !plan || plan.rateMode === 'daily'
      ? 'daily'
      : plan.rateOnDays === 1 && plan.rateOffDays === 1
        ? 'everyOther'
        : plan.rateOnDays === 1
          ? 'everyN'
          : 'onOff'

  return {
    name: supplement?.name ?? '',
    unitType: supplement?.unitType ?? 'pill',
    amountPerTime: plan ? String(plan.amountPerTime) : '1',
    stockCount: supplement?.stockCount == null ? '' : String(supplement.stockCount),
    timeSlots: plan?.timeSlots ?? ['morning'],
    rateKey,
    everyN: plan?.rateOnDays === 1 && plan.rateOffDays != null ? String(plan.rateOffDays + 1) : '2',
    onDays: plan?.rateOnDays != null ? String(plan.rateOnDays) : '5',
    offDays: plan?.rateOffDays != null ? String(plan.rateOffDays) : '2',
    anchorDate: plan?.rateAnchorDate ?? today(),
    expiryDate: supplement?.expiryDate ?? '',
    notes: supplement?.notes ?? '',
    isActive: plan?.isActive ?? true,
  }
}

interface SupplementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 传入则为编辑，否则为新增 */
  supplement?: Supplement | null
  plan?: DosagePlan | null
  /** 从补剂页「修正」入口进来：直接提示补齐节奏参数（R-08 的落地） */
  fixRate?: boolean
}

export function SupplementDialog({
  open,
  onOpenChange,
  supplement,
  plan,
  fixRate = false,
}: SupplementDialogProps) {
  const [form, setForm] = useState<SupplementFormState>(() => initialState(supplement, plan))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(initialState(supplement, plan))
    setErrors({})
  }, [open, supplement, plan])

  function update<K extends keyof SupplementFormState>(key: K, value: SupplementFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const isCyclic = form.rateKey !== 'daily'

  /** 校验放在保存时做：行内报错、不关 Dialog（§8.2） */
  function validate(): FieldErrors {
    const next: FieldErrors = {}
    if (!form.name.trim()) next.name = '请填写补剂名称'

    const amount = Number(form.amountPerTime)
    if (!Number.isInteger(amount) || amount < 1) next.amountPerTime = '每次服用量至少为 1'
    if (form.timeSlots.length === 0) next.timeSlots = '请至少选择一个服用时段'

    if (isCyclic) {
      const anchor = form.anchorDate.trim()
      if (!anchor) next.rate = '节奏参数不完整，请补齐「起点」'
      else if (form.rateKey === 'everyN') {
        const n = Number(form.everyN)
        if (!Number.isInteger(n) || n < 2) next.rate = '「每 N 天一次」的 N 必须是不小于 2 的整数'
      } else if (form.rateKey === 'onOff') {
        const on = Number(form.onDays)
        const off = Number(form.offDays)
        if (!Number.isInteger(on) || on < 1 || !Number.isInteger(off) || off < 1) {
          next.rate = '节奏参数不完整，请补齐「吃几天 / 停几天」'
        }
      }
    }
    return next
  }

  function buildRateParams(): RateParams {
    const preset = RATE_PRESETS.find((item) => item.key === form.rateKey) ?? RATE_PRESETS[0]
    const anchor = form.anchorDate.trim() || today()
    if (form.rateKey === 'everyN') return preset.toParams(anchor, Number(form.everyN))
    if (form.rateKey === 'onOff')
      return preset.toParams(anchor, Number(form.onDays), Number(form.offDays))
    return preset.toParams(anchor)
  }

  async function handleSubmit() {
    const nextErrors = validate()
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const stockRaw = form.stockCount.trim()
    const draft = {
      name: form.name.trim(),
      unitType: form.unitType,
      stockCount: stockRaw === '' ? null : Number(stockRaw),
      stockUnit: supplement?.stockUnit ?? null,
      unitsPerStock: supplement?.unitsPerStock ?? null,
      expiryDate: form.expiryDate.trim() === '' ? null : form.expiryDate.trim(),
      notes: form.notes.trim() === '' ? null : form.notes.trim(),
    }
    const planInput = {
      amountPerTime: Number(form.amountPerTime),
      timeSlots: form.timeSlots,
      ...buildRateParams(),
      isActive: form.isActive,
      notes: null,
    }

    setSaving(true)
    try {
      if (supplement) {
        await updateSupplement(supplement.id, draft)
        await savePlanForSupplement(supplement.id, planInput)
      } else {
        await createSupplement(draft, planInput)
      }
      onOpenChange(false)
    } catch (error) {
      toast((error as Error).message, { variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{supplement ? '编辑补剂' : '新增补剂'}</DialogTitle>
          <DialogDescription>补剂与它的服用节奏一起保存。</DialogDescription>
        </DialogHeader>

        {/* 三个 Tab 只重排 JSX，state / handler / 校验 / 保存逻辑一概不动（§8.2） */}
        <Tabs defaultValue="basic">
          <TabsList className="w-full">
            <TabsTrigger value="basic">基本信息</TabsTrigger>
            <TabsTrigger value="plan">服用计划</TabsTrigger>
            <TabsTrigger value="ingredient">成分</TabsTrigger>
          </TabsList>

          <TabsContent value="basic">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="supplement-name">名称 *</Label>
                <Input
                  id="supplement-name"
                  value={form.name}
                  onChange={(event) => update('name', event.target.value)}
                />
                {errors.name ? <p className="text-destructive text-xs">{errors.name}</p> : null}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="supplement-unit">单位 *</Label>
                  <Select
                    value={form.unitType}
                    onValueChange={(value) => update('unitType', value as UnitType)}
                  >
                    <SelectTrigger id="supplement-unit" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNIT_TYPE_VALUES.map((unit) => (
                        <SelectItem key={unit} value={unit}>
                          {UNIT_TYPE_LABEL[unit]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="supplement-amount">每次服用量 *</Label>
                  <Input
                    id="supplement-amount"
                    type="number"
                    min={1}
                    step={1}
                    value={form.amountPerTime}
                    onChange={(event) => update('amountPerTime', event.target.value)}
                  />
                  {errors.amountPerTime ? (
                    <p className="text-destructive text-xs">{errors.amountPerTime}</p>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="supplement-stock">余量（可留空）</Label>
                <Input
                  id="supplement-stock"
                  type="number"
                  step={1}
                  value={form.stockCount}
                  onChange={(event) => update('stockCount', event.target.value)}
                />
                <p className="text-muted-foreground text-xs">留空 = 不记录余量</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="supplement-expiry">过期日（可留空）</Label>
                <Input
                  id="supplement-expiry"
                  type="date"
                  value={form.expiryDate}
                  onChange={(event) => update('expiryDate', event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="supplement-notes">备注（可留空）</Label>
                <Input
                  id="supplement-notes"
                  value={form.notes}
                  onChange={(event) => update('notes', event.target.value)}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="plan">
            <div className="space-y-4">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.isActive}
                  onCheckedChange={(checked) => update('isActive', checked === true)}
                />
                启用这个计划
              </label>

              <div className="space-y-2">
                <Label>服用时段 *</Label>
                <ToggleGroup
                  type="multiple"
                  className="flex-wrap"
                  value={form.timeSlots}
                  onValueChange={(value) => update('timeSlots', value as TimeSlot[])}
                >
                  {TIME_SLOT_VALUES.map((slot) => (
                    <ToggleGroupItem key={slot} value={slot}>
                      {TIME_SLOT_LABEL[slot]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <p className="text-muted-foreground text-xs">
                  一天吃两次就选两个时段，不要建两条计划
                </p>
                {errors.timeSlots ? (
                  <p className="text-destructive text-xs">{errors.timeSlots}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label>服用节奏 *</Label>
                {fixRate ? (
                  <p className="text-xs font-medium text-amber-600">配置异常，请补齐节奏参数</p>
                ) : null}
                <ToggleGroup
                  type="single"
                  className="flex-wrap"
                  value={form.rateKey}
                  onValueChange={(value) => {
                    if (value) update('rateKey', value)
                  }}
                >
                  {RATE_PRESETS.map((preset) => (
                    <ToggleGroupItem key={preset.key} value={preset.key}>
                      {preset.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>

                {form.rateKey === 'everyN' ? (
                  <div className="flex items-center gap-2 text-sm">
                    <span>每</span>
                    <Input
                      className="w-20"
                      type="number"
                      min={2}
                      step={1}
                      value={form.everyN}
                      onChange={(event) => update('everyN', event.target.value)}
                    />
                    <span>天</span>
                  </div>
                ) : null}

                {form.rateKey === 'onOff' ? (
                  <div className="flex items-center gap-2 text-sm">
                    <span>吃</span>
                    <Input
                      className="w-20"
                      type="number"
                      min={1}
                      step={1}
                      value={form.onDays}
                      onChange={(event) => update('onDays', event.target.value)}
                    />
                    <span>天，停</span>
                    <Input
                      className="w-20"
                      type="number"
                      min={1}
                      step={1}
                      value={form.offDays}
                      onChange={(event) => update('offDays', event.target.value)}
                    />
                    <span>天</span>
                  </div>
                ) : null}

                {isCyclic ? (
                  <div className="space-y-2">
                    <Label htmlFor="supplement-anchor" className="text-xs">
                      起点 *
                    </Label>
                    <Input
                      id="supplement-anchor"
                      type="date"
                      value={form.anchorDate}
                      onChange={(event) => update('anchorDate', event.target.value)}
                    />
                    <p className="text-muted-foreground text-xs">起点之前该补剂不出现，不报错</p>
                  </div>
                ) : null}

                {errors.rate ? <p className="text-destructive text-xs">{errors.rate}</p> : null}

                {/* 与停药页的分工必须在这里说清，否则用户一定会在两处都配一遍（D-44） */}
                <p className="text-muted-foreground text-xs">
                  这里是「按规划怎么吃」，今日页显示「今天不用吃」。从健康角度的疗程间歇（如吃 21
                  天停 7 天）请到<strong className="font-medium">停药页</strong>
                  按方案组配置 —— 那里显示「停用中」，可带原因、可一次覆盖多种补剂。
                </p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="ingredient">
            <div className="space-y-4">
              {/* §8.5：配方变更写在补剂编辑区内，不单独开页面 */}
              <IngredientLinksSection supplementId={supplement?.id ?? null} />
            </div>
          </TabsContent>
        </Tabs>

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

export default SupplementDialog
