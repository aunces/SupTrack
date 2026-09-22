import { useIngredientSummary } from '@/hooks/useIngredientSummary'

/**
 * 今日摄入成分（§6.6 / T-305）。
 *
 * ★ 合规红线（R-02）—— 这一屏只允许出现「数字并列」，不允许出现任何判断：
 *   ❌ 禁止：「已超标」「过量」「有害」「建议减少」「已达 XX%」
 *   ❌ 禁止：进度条着色、超限变红、告警图标、健康评分
 *   ✅ 允许：「参考值 800 / 今日 1400 IU」
 *   ✅ 允许：「未设参考值」「来源：A 1000 + B 400」
 *
 * 所以这块**没有颜色、没有图标、没有条**：连「今日」那个数字都不加粗，
 * 因为加粗也是一种「它更重要 / 它有问题」的暗示。
 * 参考值与上限由用户自己填；填了也只是摆在同一行，工具不替用户下结论。
 */

export function IngredientSummaryCard({
  date,
  title = '今日摄入成分',
  emptyHint = '今日记录的补剂尚未关联成分',
}: {
  date: string
  /** 日历页用「当日成分摄入」（§8.4 设计稿的措辞） */
  title?: string
  emptyHint?: string
}) {
  const { totals, loading } = useIngredientSummary(date)

  if (loading) return null

  return (
    <section className="bg-card mb-4 rounded-xl border">
      <header className="border-b px-4 py-2.5">
        <span className="text-sm font-medium">{title}</span>
      </header>

      <div className="divide-y">
        {totals.length === 0 ? (
          <p className="text-muted-foreground px-4 py-4 text-xs">{emptyHint}</p>
        ) : (
          totals.map((total) => (
            <div key={total.ingredientId} className="px-4 py-3">
              <p className="text-sm font-medium">{total.name}</p>

              {/* 纯数字并列：参考值 + 今日合计。没有「超出 / 达标 / 剩余」这类词 */}
              <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
                {total.recommendedDailyIntake == null
                  ? '未设参考值'
                  : `参考值 ${total.recommendedDailyIntake}`}
                {' / '}
                今日 {total.displayValue} {total.displayUnit}
                {total.upperLimit == null ? '' : `（上限 ${total.upperLimit}）`}
              </p>

              <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
                来源：
                {total.sources
                  .map((source) => `${source.supplementName} ${source.amount}`)
                  .join(' + ')}
              </p>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

export default IngredientSummaryCard
