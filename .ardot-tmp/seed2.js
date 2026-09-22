new Promise(function (res) {
  var NOW = new Date().toISOString()
  var r = indexedDB.open('suptrack-v12')
  r.onsuccess = function () {
    var db = r.result
    var tx = db.transaction(['pauseSchemes', 'pausePeriods', 'supplements'], 'readwrite')
    var schemeId = crypto.randomUUID()
    tx.objectStore('pauseSchemes').put({
      id: schemeId,
      name: '抗生素期间',
      note: null,
      isActive: true,
      activatedAt: '2026-09-22',
      endedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    })
    var periods = tx.objectStore('pausePeriods')
    var all = periods.getAll()
    all.onsuccess = function () {
      all.result.forEach(function (p) {
        p.schemeId = schemeId
        p.startDate = null
        p.endDate = '2026-09-29'
        periods.put(p)
      })
    }
    var sups = tx.objectStore('supplements')
    var got = sups.get('s2')
    got.onsuccess = function () {
      var s = got.result
      s.unitType = 'pill'
      sups.put(s)
    }
    tx.oncomplete = function () {
      res('ok')
    }
    tx.onerror = function () {
      res('tx-error')
    }
  }
})
