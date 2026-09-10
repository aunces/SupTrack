import { Button } from '@/components/ui/button'
import { useMissedPlans } from '@/hooks/useMissedPlans'

interface Props {
  onBackfill: () => void
}

export function MissedPlansBanner({ onBackfill }: Props) {
  const { missed, loading } = useMissedPlans()

  if (loading || missed.length === 0) return null

  const days = new Set(missed.map((m) => m.date)).size

  return (
    <div className="mb-4 flex items-center justify-between rounded-md border border-amber-400 bg-amber-50 px-4 py-3">
      <div className="text-sm text-amber-900">
        过去 7 天有 {missed.length} 项计划未记录（分布在 {days} 天），是否补录？
      </div>
      <Button size="sm" onClick={onBackfill}>
        去补录
      </Button>
    </div>
  )
}

export default MissedPlansBanner
