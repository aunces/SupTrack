import { usePlannedIngredientSummary } from '@/hooks/useIngredientSummary'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { INGREDIENT_UNIT_LABEL } from '@/constants/units'
import { formatShortDate, today } from '@/utils/date'

/**
 * 成分库 · 每日成分汇总（设计稿 3:604 / 2026-09-22）。
 *
 * ★ 与首页「今日摄入成分一览」/ 日历「当日成分摄入」不同：这里**只记录计划数据**。
 *   今日合计 = 今天按启用计划应摄入的量（休息 / 停用 / 起点未到的补剂不计入），
 *   **不读打卡记录**，因此与「今天实际吃了多少」无关。
 *
 * 三列：成分 / 参考摄入量 / 今日合计。参考摄入量留空显示「—」。
 * 合规红线不变：只累加与并列，不出任何结论；参考摄入量由用户自填，不预置默认。
 */
export function PlannedIngredientSummaryCard() {
  const date = today()
  const { totals, loading } = usePlannedIngredientSummary(date)

  const hasMissingRecipe = totals.some((total) => total.missingRecipe)

  return (
    <section className="rounded-xl border bg-card">
      <header className="flex items-center justify-between gap-3 px-5 py-3">
        <span className="text-sm font-medium">每日成分汇总</span>
        <span className="text-muted-foreground text-xs">
          按 {formatShortDate(date)} 的计划与配方计算
        </span>
      </header>

      <div className="bg-border h-px" />

      <Table>
        <TableHeader>
          <TableRow className="bg-[#FAFAFA]">
            <TableHead>成分</TableHead>
            <TableHead className="w-[120px]">参考摄入量</TableHead>
            <TableHead className="w-[120px]">今日计划</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={3} className="text-muted-foreground py-4 text-xs">
                加载中…
              </TableCell>
            </TableRow>
          ) : totals.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="text-muted-foreground py-4 text-xs">
                当前没有启用计划要摄入的成分。
              </TableCell>
            </TableRow>
          ) : (
            totals.map((total) => (
              <TableRow key={total.ingredientId}>
                <TableCell className="text-sm font-medium">{total.name}</TableCell>
                <TableCell className="text-muted-foreground tabular-nums text-[13px]">
                  {total.recommendedDailyIntake == null
                    ? '—'
                    : `${total.recommendedDailyIntake} ${INGREDIENT_UNIT_LABEL[total.unit]}`}
                </TableCell>
                <TableCell className="font-medium tabular-nums text-[13px]">
                  {total.displayValue} {total.displayUnit}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div className="bg-border h-px" />

      <div className="px-5 pt-2.5 pb-3">
        <p className="text-muted-foreground text-xs">
          今日计划按启用计划应摄入的量计算（休息/停用不计入），与实际是否打卡无关。参考摄入量由你自填，留空即不做比较。本页只做累加与并列，不出任何结论。
        </p>
        {hasMissingRecipe ? (
          <p className="text-muted-foreground mt-1 text-xs">另有补剂未关联成分，未计入上述合计。</p>
        ) : null}
      </div>
    </section>
  )
}

export default PlannedIngredientSummaryCard
