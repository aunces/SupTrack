import { useIngredientSummary } from '@/hooks/useIngredientSummary'
import { formatShortDate } from '@/utils/date'
import { cn } from 'cn'

/**
 * 今日摄入成分一览（设计稿首页 ⑧ / §6.6）。
 *
 * ★ 合规红线（R-02）—— 这一屏只允许出现「数字并列」，不允许出现任何判断：
 *   ❌ 禁止：「已超标」「过量」「有害」「建议减少」「已达 XX%」
 *   ❌ 禁止：进度条着色、超限变红、告警图标、健康评分
 *   ✅ 允许：「1000 IU」+「参考 800 IU」并列
 *   ✅ 允许：「未设参考值」
 *
 * 大数字（22px）只是排版层级，不是结论 —— 所以它**不带任何颜色**，
 * 超过参考值也和没超过长得一模一样。
 *
 * 口径（用户裁决）：**只累加已打卡的记录**；含量取自该日生效的配方。
 * 设计稿原文写的是「与实际是否服用无关」，按实施指导书 §6.6 改成下面这句。
 */

export function IngredientSummaryCard({
  date,
  title = '今日摄入成分一览',
  emptyHint = '今日记录的补剂尚未关联成分',
}: {
  date: string
  /** 日历页用「当日成分摄入」 */
  title?: string
  emptyHint?: string
}) {
  const { totals, loading } = useIngredientSummary(date)

  if (loading) return null

  return (
    <section className="rounded-xl border">
      <header className="flex items-center justify-between gap-3 px-5 py-3">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-muted-foreground text-xs">按 {formatShortDate(date)} 的配方累加</span>
      </header>

      <div className="bg-border h-px" />

      {totals.length === 0 ? (
        <p className="text-muted-foreground px-5 py-4 text-xs">{emptyHint}</p>
      ) : (
        <div className="flex gap-5 px-5 py-[18px]">
          {totals.map((total, index) => (
            <div
              key={total.ingredientId}
              className={cn('flex min-w-0 flex-1 flex-col gap-1.5', index > 0 && 'border-l pl-5')}
            >
              <span className="text-muted-foreground truncate text-xs">{total.name}</span>
              {/* 今日合计：只有数字与单位，没有「超标 / 达标 / 剩余」这类词 */}
              <span className="text-[22px] leading-[26px] font-semibold tabular-nums">
                {total.displayValue} {total.displayUnit}
              </span>
              <span className="text-muted-foreground text-[11px] leading-[15px] tabular-nums">
                {total.recommendedDailyIntake == null
                  ? '未设参考值'
                  : `参考 ${total.recommendedDailyIntake} ${total.unit}`}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="px-5 pt-2.5 pb-3">
        <p className="text-muted-foreground text-xs">
          只累加已打卡的记录，按当日生效的配方取数。参考值仅并列对照，高于也不着色、不提示；留空即不比较。
        </p>
      </div>
    </section>
  )
}

export default IngredientSummaryCard
