import { describe, expect, it } from 'vitest'
import type { DailyIntake, DosagePlan, PausePeriod, Supplement } from '@/types'
import { resolveDayItems, resolveDayStatus, type DayItem } from '@/utils/dayState'
import type { PauseContext } from '@/utils/pause'

const DATE = '2026-09-20'

function supplement(overrides: Partial<Supplement> = {}): Supplement {
  return {
    id: 'supp-1',
    name: '维生素 D3',
    unitType: 'pill',
    stockCount: 34,
    stockUnit: null,
    unitsPerStock: null,
    expiryDate: null,
    notes: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  }
}

function plan(overrides: Partial<DosagePlan> = {}): DosagePlan {
  return {
    id: 'plan-1',
    supplementId: 'supp-1',
    amountPerTime: 1,
    timeSlots: ['morning'],
    rateMode: 'daily',
    rateOnDays: null,
    rateOffDays: null,
    rateAnchorDate: null,
    isActive: true,
    notes: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  }
}

function record(overrides: Partial<DailyIntake> = {}): DailyIntake {
  return {
    id: 'rec-1',
    date: DATE,
    supplementId: 'supp-1',
    planId: 'plan-1',
    timeSlot: 'morning',
    amount: 1,
    taken: true,
    isExtra: false,
    origin: 'checkin',
    notes: null,
    createdAt: '2026-09-20T08:12:00.000Z',
    updatedAt: '2026-09-20T08:12:00.000Z',
    ...overrides,
  }
}

function pausePeriod(overrides: Partial<PausePeriod> = {}): PausePeriod {
  return {
    id: 'period-1',
    schemeId: null,
    supplementId: 'supp-1',
    startDate: '2026-09-19',
    endDate: '2026-09-21',
    reason: '胃不舒服',
    createdAt: '2026-09-19T00:00:00.000Z',
    updatedAt: '2026-09-19T00:00:00.000Z',
    ...overrides,
  }
}

const noPause: PauseContext = { periods: [], schemes: new Map() }

function run(input: {
  plans?: DosagePlan[]
  records?: DailyIntake[]
  pause?: PauseContext
  supplements?: Supplement[]
  date?: string
}) {
  return resolveDayItems({
    date: input.date ?? DATE,
    plans: input.plans ?? [plan()],
    supplements: new Map((input.supplements ?? [supplement()]).map((s) => [s.id, s])),
    records: input.records ?? [],
    pauseCtx: input.pause ?? noPause,
  })
}

describe('resolveDayItems · 判定优先级', () => {
  it('该吃、无记录 → pending', () => {
    const [item] = run({})
    expect(item.state).toBe('pending')
    expect(item.takenAmount).toBe(0)
    expect(item.lastTakenAt).toBeNull()
    expect(item.nextRateDate).toBeNull()
    expect(item.offScheduleTake).toBe(false)
    expect(item.configError).toBe(false)
    expect(item.amountDue).toBe(1)
  })

  it('该吃、有 taken=true 记录 → taken 且 takenAmount 正确', () => {
    const [item] = run({ records: [record({ amount: 2 })] })
    expect(item.state).toBe('taken')
    expect(item.takenAmount).toBe(2)
    expect(item.lastTakenAt).toBe('2026-09-20T08:12:00.000Z')
  })

  it('该吃、两条记录（打卡 + 追加一次）→ takenAmount 为两条之和', () => {
    const [item] = run({
      records: [
        record({ id: 'r1', amount: 1 }),
        record({
          id: 'r2',
          amount: 2,
          isExtra: true,
          origin: 'extra',
          createdAt: '2026-09-20T20:00:00.000Z',
        }),
      ],
    })
    expect(item.state).toBe('taken')
    expect(item.takenAmount).toBe(3)
    // 最新一条的时间
    expect(item.lastTakenAt).toBe('2026-09-20T20:00:00.000Z')
    // 撤销按 LIFO 取最后一个
    expect(item.recordIds).toEqual(['r1', 'r2'])
  })

  it('休息日、无记录 → rest，且给出下次该吃日（P2）', () => {
    const cyclic = plan({
      rateMode: 'cyclic',
      rateOnDays: 1,
      rateOffDays: 1,
      rateAnchorDate: '2026-09-19',
    })
    const [item] = run({ plans: [cyclic] })
    expect(item.state).toBe('rest')
    expect(item.nextRateDate).toBe('2026-09-21')
  })

  it('停用中、无记录 → paused，且 pause.resumeDate 正确', () => {
    const [item] = run({ pause: { periods: [pausePeriod()], schemes: new Map() } })
    expect(item.state).toBe('paused')
    expect(item.pause?.reasonLabel).toBe('胃不舒服')
    expect(item.pause?.resumeDate).toBe('2026-09-22')
    expect(item.nextRateDate).toBeNull()
  })

  it('休息日 + 有记录 → taken 且 offScheduleTake=true（记录优先于节奏）', () => {
    const cyclic = plan({
      rateMode: 'cyclic',
      rateOnDays: 1,
      rateOffDays: 1,
      rateAnchorDate: '2026-09-19',
    })
    const [item] = run({
      plans: [cyclic],
      records: [record({ origin: 'forced', isExtra: true })],
    })
    expect(item.state).toBe('taken')
    expect(item.offScheduleTake).toBe(true)
  })

  it('停用中 + 有记录 → taken 且 offScheduleTake=true（记录优先于停用）', () => {
    const [item] = run({
      pause: { periods: [pausePeriod()], schemes: new Map() },
      records: [record({ origin: 'forced', isExtra: true })],
    })
    expect(item.state).toBe('taken')
    expect(item.offScheduleTake).toBe(true)
    expect(item.pause?.reasonLabel).toBe('胃不舒服')
  })

  it('节奏参数非法 → 按「该吃」处理且 configError=true（R-08）', () => {
    const broken = plan({
      rateMode: 'cyclic',
      rateOnDays: null,
      rateOffDays: 1,
      rateAnchorDate: null,
    })
    const [item] = run({ plans: [broken] })
    expect(item.state).toBe('pending')
    expect(item.configError).toBe(true)
  })

  it('节奏起点在未来 → 该日不出现（§6.2 / §8.2 / §13.2 走查第 4 步）', () => {
    const future = plan({
      rateMode: 'cyclic',
      rateOnDays: 1,
      rateOffDays: 1,
      rateAnchorDate: '2026-09-25',
    })
    expect(run({ plans: [future] })).toHaveLength(0)
  })

  it('节奏起点非法 → 仍然出现且标配置异常（R-08：不隐藏）', () => {
    const broken = plan({
      rateMode: 'cyclic',
      rateOnDays: 1,
      rateOffDays: 1,
      rateAnchorDate: '2026-9-25',
    })
    const items = run({ plans: [broken] })
    expect(items).toHaveLength(1)
    expect(items[0].configError).toBe(true)
    expect(items[0].state).toBe('pending')
  })

  it('起点当天算第 1 个该吃日，正常出现', () => {
    const anchored = plan({
      rateMode: 'cyclic',
      rateOnDays: 1,
      rateOffDays: 1,
      rateAnchorDate: DATE,
    })
    const items = run({ plans: [anchored] })
    expect(items).toHaveLength(1)
    expect(items[0].state).toBe('pending')
  })

  it('起点在未来，但当天已有记录（计划外补记）→ 记录仍要显示', () => {
    const future = plan({
      rateMode: 'cyclic',
      rateOnDays: 1,
      rateOffDays: 1,
      rateAnchorDate: '2026-09-25',
    })
    const items = run({
      plans: [future],
      records: [record({ planId: null, origin: 'manual', isExtra: true })],
    })
    expect(items).toHaveLength(1)
    expect(items[0].planId).toBe('')
    expect(items[0].state).toBe('taken')
  })

  it('补剂已被删除 → supplement 为 undefined，仍生成 item', () => {
    const [item] = run({ supplements: [] })
    expect(item.supplement).toBeUndefined()
    expect(item.state).toBe('pending')
  })

  it('一个计划多时段 → 展开成多行', () => {
    const items = run({ plans: [plan({ timeSlots: ['morning', 'evening'] })] })
    expect(items).toHaveLength(2)
    expect(items.map((i) => i.timeSlot)).toEqual(['morning', 'evening'])
  })

  it('同一时段有 3 条记录（打卡 + 追加两次）→ 计入 takenAmount', () => {
    const [item] = run({
      records: [
        record({ id: 'r1', amount: 1 }),
        record({ id: 'r2', amount: 1, isExtra: true, origin: 'extra' }),
        record({ id: 'r3', amount: 1, isExtra: true, origin: 'extra' }),
      ],
    })
    expect(item.takenAmount).toBe(3)
  })

  it('只有 taken=false 记录 → 仍判 pending（它使该日落入漏服）', () => {
    const items = run({
      plans: [],
      records: [record({ taken: false, origin: 'manual', isExtra: true, planId: null })],
    })
    expect(items.map((i) => i.state)).toEqual(['pending'])
  })

  it('计划外记录（planId 为空）→ 单独生成 item，planId 为空串、amountDue 为 0', () => {
    const items = run({
      plans: [],
      records: [record({ planId: null, origin: 'manual', isExtra: true, amount: 2 })],
    })
    expect(items).toHaveLength(1)
    expect(items[0].planId).toBe('')
    expect(items[0].amountDue).toBe(0)
    expect(items[0].state).toBe('taken')
    expect(items[0].takenAmount).toBe(2)
  })

  it('计划已不存在的历史记录 → 同样归入计划外分组，不会被丢掉', () => {
    const items = run({
      plans: [],
      records: [record({ planId: 'plan-removed' })],
    })
    expect(items).toHaveLength(1)
    expect(items[0].planId).toBe('')
  })
})

describe('resolveDayStatus · 日级状态', () => {
  function item(state: DayItem['state']): DayItem {
    return {
      date: DATE,
      supplementId: 'supp-1',
      supplement: supplement(),
      planId: 'plan-1',
      timeSlot: 'morning',
      amountDue: 1,
      state,
      takenAmount: state === 'taken' ? 1 : 0,
      lastTakenAt: null,
      recordIds: [],
      origin: state === 'taken' ? 'checkin' : null,
      nextRateDate: state === 'rest' ? '2026-09-22' : null,
      pause: null,
      offScheduleTake: false,
      configError: false,
    }
  }

  it('全 pending → missed（漏服不需要用户手动标记）', () => {
    expect(resolveDayStatus([item('pending'), item('pending')])).toBe('missed')
  })

  it('1 taken + 1 pending → partial', () => {
    expect(resolveDayStatus([item('taken'), item('pending')])).toBe('partial')
  })

  it('全 taken → done', () => {
    expect(resolveDayStatus([item('taken'), item('taken')])).toBe('done')
  })

  it('无应服项 + 有 paused → paused', () => {
    expect(resolveDayStatus([item('paused'), item('rest')])).toBe('paused')
  })

  it('无应服项 + 无 paused + 有 rest → rest', () => {
    expect(resolveDayStatus([item('rest')])).toBe('rest')
  })

  it('没有任何项 → empty', () => {
    expect(resolveDayStatus([])).toBe('empty')
  })

  it('paused 不计入完成度分母：只有 paused 与 taken 时 → done', () => {
    expect(resolveDayStatus([item('taken'), item('paused')])).toBe('done')
  })
})
