new Promise(function (res) {
  var NOW = new Date().toISOString()
  var u = function () {
    return crypto.randomUUID()
  }
  var S = function (id, name, unitType, stock, expiry) {
    return {
      id: id,
      name: name,
      unitType: unitType,
      stockCount: stock,
      stockUnit: null,
      unitsPerStock: null,
      expiryDate: expiry,
      notes: null,
      createdAt: NOW,
      updatedAt: NOW,
    }
  }
  var P = function (id, supp, amount, slots, mode, on, off, anchor) {
    return {
      id: id,
      supplementId: supp,
      amountPerTime: amount,
      timeSlots: slots,
      rateMode: mode,
      rateOnDays: on,
      rateOffDays: off,
      rateAnchorDate: anchor,
      isActive: true,
      notes: null,
      createdAt: NOW,
      updatedAt: NOW,
    }
  }
  var I = function (id, name, unit, rec) {
    return {
      id: id,
      name: name,
      unit: unit,
      recommendedDailyIntake: rec,
      upperLimit: null,
      notes: null,
      createdAt: NOW,
      updatedAt: NOW,
    }
  }
  var L = function (supp, ing, amount) {
    return {
      id: u(),
      supplementId: supp,
      ingredientId: ing,
      amountPerServing: amount,
      effectiveFrom: '2026-09-01',
      effectiveTo: null,
      createdAt: NOW,
      updatedAt: NOW,
    }
  }
  var K = function (supp, planId, slot, amount, origin) {
    return {
      id: u(),
      date: '2026-09-22',
      supplementId: supp,
      planId: planId,
      timeSlot: slot,
      amount: amount,
      taken: true,
      isExtra: origin !== 'checkin',
      origin: origin,
      notes: null,
      createdAt: NOW,
      updatedAt: NOW,
    }
  }

  var supplements = [
    S('s1', '维生素 D3', 'pill', -1, null),
    S('s2', '鱼油', 'capsule', 20, '2026-09-28'),
    S('s3', '钙片', 'tablet', 2, null),
    S('s4', '复合维生素', 'tablet', 30, null),
    S('s5', '维生素 C', 'tablet', 30, null),
  ]
  var plans = [
    P('p1', 's1', 1, ['morning'], 'daily', null, null, null),
    P('p2', 's2', 2, ['morning', 'evening'], 'daily', null, null, null),
    P('p3', 's3', 1, ['noon'], 'cyclic', 1, 1, '2026-09-21'),
    P('p4', 's4', 1, ['noon'], 'daily', null, null, null),
    P('p5', 's5', 1, ['bedtime'], 'daily', null, null, null),
  ]
  var ingredients = [
    I('i1', '维生素 D3', 'IU', 800),
    I('i2', '钙', 'mg', 600),
    I('i3', '镁', 'mg', null),
  ]
  var links = [L('s1', 'i1', 1000), L('s2', 'i2', 800), L('s2', 'i3', 200)]
  var intakes = [
    K('s1', 'p1', 'morning', 1, 'checkin'),
    K('s2', 'p2', 'morning', 2, 'checkin'),
    K('s5', null, 'morning', 1, 'manual'),
  ]
  var periods = [
    {
      id: u(),
      schemeId: null,
      supplementId: 's4',
      startDate: '2026-09-22',
      endDate: '2026-09-29',
      reason: '抗生素期间',
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]

  var r = indexedDB.open('suptrack-v12')
  r.onsuccess = function () {
    var db = r.result
    var stores = [
      'supplements',
      'dosagePlans',
      'dailyIntakes',
      'pausePeriods',
      'ingredients',
      'supplementIngredients',
    ]
    var tx = db.transaction(stores, 'readwrite')
    var out = {}
    var put = function (store, rows) {
      rows.forEach(function (row) {
        tx.objectStore(store).put(row)
      })
      out[store] = rows.length
    }
    put('supplements', supplements)
    put('dosagePlans', plans)
    put('ingredients', ingredients)
    put('supplementIngredients', links)
    put('dailyIntakes', intakes)
    put('pausePeriods', periods)
    tx.oncomplete = function () {
      res(JSON.stringify(out))
    }
    tx.onerror = function () {
      res('tx-error')
    }
  }
  r.onerror = function () {
    res('open-error')
  }
})
