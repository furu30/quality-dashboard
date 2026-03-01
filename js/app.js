/**
 * 品質管理アプリ - メインアプリケーション
 * タブルーティング、ブートシーケンス、デモデータ生成
 */
window.QualityApp = window.QualityApp || {};

(function(app) {
  "use strict";

  var data = app.data;
  var u = app.utils;

  // ===== タブルーティング =====

  function initTabs() {
    var tabBar = document.querySelector('.tab-bar');
    if (!tabBar) return;

    tabBar.addEventListener('click', function(e) {
      var btn = e.target.closest('.tab-item');
      if (!btn) return;
      switchTab(btn.dataset.tab);
    });
  }

  function switchTab(tabId) {
    // タブボタン更新
    document.querySelectorAll('.tab-item').forEach(function(b) { b.classList.remove('active'); });
    var activeBtn = document.querySelector('.tab-item[data-tab="' + tabId + '"]');
    if (activeBtn) activeBtn.classList.add('active');

    // パネル更新
    document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
    var panel = document.getElementById(tabId);
    if (panel) panel.classList.add('active');

    // タブ切替時のリフレッシュ
    if (tabId === 'tab-dashboard') app.dashboard.refresh();
    if (tabId === 'tab-records') {
      app.records.populateDropdowns().then(function() { app.records.renderTable(); });
    }
    if (tabId === 'tab-masters') app.masters.renderAll();
    if (tabId === 'tab-stratify') app.stratify.draw();
  }

  // ===== マスタ変更コールバック =====

  app.onMasterChanged = function() {
    // ドロップダウンを再構築
    app.records.populateDropdowns();
    app.pareto.populateFilters();
    app.histogram.populateFilters();
    app.controlChart.populateFilters();
  };

  // ===== データ再読込コールバック（インポート後） =====

  app.onDataReloaded = function() {
    app.masters.renderAll();
    app.records.populateDropdowns().then(function() { app.records.renderTable(); });
    app.dashboard.refresh();
    app.pareto.populateFilters();
    app.histogram.populateFilters();
    app.controlChart.populateFilters();
  };

  // ===== ガウス乱数（Box-Muller変換） =====

  function gaussianRandom() {
    var u1 = Math.random();
    var u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  // ===== 稼働日リスト生成 =====

  /** 過去count日分の平日(月〜金)を古い順で返す */
  function getWorkingDays(count) {
    var days = [];
    var d = new Date();
    d.setDate(d.getDate() - 1);
    while (days.length < count) {
      var dow = d.getDay();
      if (dow !== 0 && dow !== 6) {
        days.unshift(d.toISOString().slice(0, 10));
      }
      d.setDate(d.getDate() - 1);
    }
    return days;
  }

  // ===== デモデータ生成 =====

  function seedDemoData() {
    if (!confirm('デモデータを投入します。既存データに追加されます。よろしいですか？')) return;

    var products = [
      { code: 'P001', name: '製品A', category: '組立品' },
      { code: 'P002', name: '製品B', category: '加工品' },
      { code: 'P003', name: '製品C', category: '成形品' },
      { code: 'P004', name: '製品D', category: '電子部品' },
      { code: 'P005', name: '製品E', category: '加工品' },
      { code: 'B-M6', name: 'M6×20六角ボルト', category: 'ボルト' }
    ];

    var processes = [
      { name: '受入検査', order: 1, department: '品質管理' },
      { name: '加工', order: 2, department: '製造' },
      { name: '組立', order: 3, department: '製造' },
      { name: '塗装', order: 4, department: '製造' },
      { name: '検査', order: 5, department: '品質管理' },
      { name: '出荷前検査', order: 6, department: '品質管理' },
      { name: 'CNC旋盤', order: 7, department: '製造' },
      { name: 'ネジ転造', order: 8, department: '製造' }
    ];

    var defectTypes = [
      { name: '寸法不良', category: '寸法' },
      { name: '外観不良', category: '外観' },
      { name: '機能不良', category: '機能' },
      { name: '組立不良', category: '組立' },
      { name: '塗装不良', category: '外観' },
      { name: '異物混入', category: '異物' },
      { name: '変形', category: '形状' },
      { name: '欠品', category: 'その他' }
    ];

    var rootCauses = [
      { name: '作業手順不遵守', category4M: '人' },
      { name: 'スキル不足', category4M: '人' },
      { name: '注意力低下', category4M: '人' },
      { name: 'コミュニケーション不足', category4M: '人' },
      { name: '設備劣化', category4M: '機械' },
      { name: '治工具不良', category4M: '機械' },
      { name: '校正ずれ', category4M: '機械' },
      { name: '材料不良', category4M: '材料' },
      { name: 'ロット差異', category4M: '材料' },
      { name: '保管条件不良', category4M: '材料' },
      { name: '作業手順書不備', category4M: '方法' },
      { name: '検査基準不明確', category4M: '方法' }
    ];

    // マスタ登録
    var pIds, prIds, dtIds, rcIds;
    var allProducts, allProcesses;

    app.db.transaction('rw',
      app.db.products, app.db.processes, app.db.defectTypes,
      app.db.rootCauses, app.db.defectRecords, app.db.inspectionRecords,
    function() {
      // 既存データクリア → 再投入
      app.db.products.clear();
      app.db.processes.clear();
      app.db.defectTypes.clear();
      app.db.rootCauses.clear();
      app.db.defectRecords.clear();
      app.db.inspectionRecords.clear();

      return Promise.all([
        app.db.products.bulkAdd(products).then(function() { return app.db.products.toArray(); }),
        app.db.processes.bulkAdd(processes).then(function() { return app.db.processes.toArray(); }),
        app.db.defectTypes.bulkAdd(defectTypes).then(function() { return app.db.defectTypes.toArray(); }),
        app.db.rootCauses.bulkAdd(rootCauses).then(function() { return app.db.rootCauses.toArray(); })
      ]).then(function(results) {
        allProducts = results[0];
        allProcesses = results[1];
        pIds = allProducts.map(function(r) { return r.id; });
        prIds = allProcesses.map(function(r) { return r.id; });
        dtIds = results[2].map(function(r) { return r.id; });
        rcIds = results[3].map(function(r) { return r.id; });

        // 不良記録生成（過去180日分、約220件）
        var defectRecords = generateDemoRecords(pIds, prIds, dtIds, rcIds, 220);

        // 検査データ生成（M6ボルト CNC旋盤工程 抜取検査）
        var boltProduct = allProducts.find(function(p) { return p.code === 'B-M6'; });
        var cncProcess = allProcesses.find(function(p) { return p.name === 'CNC旋盤'; });
        var inspRecords = generateInspectionRecords(boltProduct.id, cncProcess.id);

        return Promise.all([
          app.db.defectRecords.bulkAdd(defectRecords),
          app.db.inspectionRecords.bulkAdd(inspRecords)
        ]);
      });
    }).then(function() {
      alert('デモデータを投入しました（不良記録 + 検査データ）');
      app.onDataReloaded();
    }).catch(function(err) {
      alert('デモデータ投入中にエラーが発生しました: ' + err.message);
    });
  }

  // ===== 検査デモデータ生成 =====
  // シナリオ: M6×20 SUS304六角ボルト CNC旋盤加工 抜取検査
  //
  // - 30稼働日分、1日4回検査（9:00/11:00/13:00/15:00）、1回5サンプル
  // - 測定項目: ネジ外径 (5.974±0.030mm), 全長 (20.00±0.20mm)
  // - 刃具寿命: 約5000個で交換 → 摩耗による寸法ドリフト
  // - クーラント温度: 朝18°C→午後24°Cで変動 → 熱膨張の影響
  // - 作業者2名が週交代 → わずかな系統的バイアス

  function generateInspectionRecords(productId, processId) {
    var records = [];
    var inspTimes = ['09:00', '11:00', '13:00', '15:00'];
    var operators = ['佐藤', '高橋'];

    // 測定項目定義
    var types = [
      {
        name: 'ネジ外径',
        nominal: 5.974, usl: 6.004, lsl: 5.944, unit: 'mm',
        withinSigma: 0.005, betweenSigma: 0.003,
        toolWearRate: 0.003 / 1000  // +0.003mm per 1000個
      },
      {
        name: '全長',
        nominal: 20.00, usl: 20.20, lsl: 19.80, unit: 'mm',
        withinSigma: 0.03, betweenSigma: 0.02,
        toolWearRate: 0
      }
    ];

    var cutCount = 0;
    var toolChangeAt = 5000;
    var toolNum = 1;
    var toolId = 'T-001';
    var lotNum = 1;

    var workDays = getWorkingDays(30);

    workDays.forEach(function(dateStr, dayIdx) {
      var weekNum = Math.floor(dayIdx / 5);
      var operator = operators[weekNum % 2];
      var operatorBias = (weekNum % 2 === 0) ? 0.001 : -0.001;

      inspTimes.forEach(function(time, timeIdx) {
        // クーラント温度: 朝低→午後高 + 日変動
        var dayTempBase = 18 + (Math.random() - 0.5) * 2;
        var temp = u.round(dayTempBase + timeIdx * 1.8 + (Math.random() - 0.5) * 0.5, 1);

        // 異常日: day20でクーラント故障 → 温度上昇
        if (dayIdx === 20 && timeIdx >= 2) {
          temp = u.round(temp + 6, 1);
        }

        // 累積切削数: 2時間で約350〜450個生産
        cutCount += 350 + Math.floor(Math.random() * 100);

        // 刃具交換判定
        if (cutCount >= toolChangeAt) {
          cutCount = Math.floor(Math.random() * 200); // 交換後リセット
          toolNum++;
          toolId = 'T-' + String(toolNum).padStart(3, '0');
          toolChangeAt = 4500 + Math.floor(Math.random() * 1000);
          lotNum++;
        }

        var sgBase = dateStr + '_' + time;
        var lotNo = 'L' + String(lotNum).padStart(4, '0');

        types.forEach(function(mt) {
          // --- 系統変動 ---
          // 刃具摩耗: ネジ外径のみ累積切削に比例して正方向にドリフト
          var toolWearOffset = cutCount * mt.toolWearRate;

          // 温度影響: ネジ外径のみ (基準20°C比で+0.001mm/°C)
          var tempOffset = (mt.name === 'ネジ外径') ? (temp - 20) * 0.001 : 0;

          // 群間変動(サブグループ共通シフト)
          var subgroupShift = gaussianRandom() * mt.betweenSigma;

          var subgroupId = sgBase + '_' + mt.name;

          for (var s = 1; s <= 5; s++) {
            // 群内変動(個々のサンプル)
            var withinVar = gaussianRandom() * mt.withinSigma;
            var value = mt.nominal + toolWearOffset + tempOffset
                        + operatorBias + subgroupShift + withinVar;

            // まれに突発外れ値(1%確率): 材料ムラ等
            if (Math.random() < 0.01) {
              value += (Math.random() > 0.5 ? 1 : -1) * mt.withinSigma * 4;
            }

            var note = '';
            // 刃具交換直後
            if (cutCount < 200 && s === 1) note = '刃具交換後 初回検査';
            // 温度異常日
            if (dayIdx === 20 && timeIdx >= 2 && s === 1) note = 'クーラント温度異常';

            records.push({
              date: dateStr,
              time: time,
              productId: productId,
              processId: processId,
              measurementType: mt.name,
              nominalValue: mt.nominal,
              lsl: mt.lsl,
              usl: mt.usl,
              measuredValue: u.round(value, 4),
              unit: mt.unit,
              sampleNo: s,
              subgroupId: subgroupId,
              operatorName: operator,
              equipmentName: 'CNC旋盤 #1',
              toolId: toolId,
              toolCutCount: cutCount,
              equipmentTemp: temp,
              lotNo: lotNo,
              note: note,
              createdAt: new Date().toISOString()
            });
          }
        });
      });
    });

    return records;
  }

  // ===== 不良デモ記録生成 =====

  /** デモ不良記録を生成 */
  function generateDemoRecords(pIds, prIds, dtIds, rcIds, count) {
    var records = [];
    var severities = ['重大', '重度', '軽度', '軽微'];
    var sevWeights = [5, 15, 40, 40];
    var detections = ['目視', '測定', '試験', '顧客指摘'];
    var detWeights = [40, 30, 20, 10];
    var statuses = ['未対応', '対応中', '完了'];
    var statWeights = [20, 15, 65];
    var operators = ['田中', '鈴木', '佐藤', '山田', '高橋', '伊藤', '渡辺', '中村'];
    var dtWeights = [30, 25, 12, 10, 8, 7, 5, 3];

    for (var i = 0; i < count; i++) {
      var daysAgo = Math.floor(Math.random() * 180);
      var d = new Date();
      d.setDate(d.getDate() - daysAgo);
      var dateStr = d.toISOString().slice(0, 10);
      var hour = 8 + Math.floor(Math.random() * 9);
      var min = Math.floor(Math.random() * 60);
      var timeStr = String(hour).padStart(2, '0') + ':' + String(min).padStart(2, '0');

      var lotSize = [50, 100, 200, 500, 1000][Math.floor(Math.random() * 5)];
      var qty = 1 + Math.floor(Math.random() * Math.max(1, Math.floor(lotSize * 0.05)));
      var baseValue = 50;
      var measurement = u.round(baseValue + (Math.random() - 0.5) * 6, 2);
      if (Math.random() < 0.08) {
        measurement = u.round(baseValue + (Math.random() > 0.5 ? 1 : -1) * (8 + Math.random() * 4), 2);
      }

      records.push({
        date: dateStr,
        time: timeStr,
        productId: pIds[weightedRandom(pIds.length)],
        processId: prIds[Math.floor(Math.random() * prIds.length)],
        defectTypeId: dtIds[weightedRandomCustom(dtWeights)],
        severity: weightedChoice(severities, sevWeights),
        quantity: qty,
        lotSize: lotSize,
        measurementValue: measurement,
        detectionMethod: weightedChoice(detections, detWeights),
        operatorName: operators[Math.floor(Math.random() * operators.length)],
        description: '',
        rootCauseId: Math.random() < 0.7 ? rcIds[Math.floor(Math.random() * rcIds.length)] : null,
        correctiveAction: '',
        status: weightedChoice(statuses, statWeights),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
    return records;
  }

  function weightedRandom(max) {
    return Math.floor(Math.random() * max);
  }

  function weightedRandomCustom(weights) {
    var total = weights.reduce(function(a, b) { return a + b; }, 0);
    var r = Math.random() * total;
    var cum = 0;
    for (var i = 0; i < weights.length; i++) {
      cum += weights[i];
      if (r < cum) return i;
    }
    return weights.length - 1;
  }

  function weightedChoice(items, weights) {
    return items[weightedRandomCustom(weights)];
  }

  // ===== データリセット =====

  function clearAllData() {
    if (!confirm('すべてのデータ（マスタ・不良記録・検査データ）を削除します。この操作は取り消せません。実行しますか？')) return;
    data.clearAll().then(function() {
      alert('全データを削除しました');
      app.onDataReloaded();
    });
  }

  // ===== ブートシーケンス =====

  function boot() {
    // 各モジュール初期化
    app.masters.init();
    app.records.init();
    app.dashboard.init();
    app.pareto.init();
    app.histogram.init();
    app.controlChart.init();
    app.scatter.init();
    app.stratify.init();
    app.exportModule.init();

    // タブ
    initTabs();

    // ヘッダーボタン
    document.getElementById('btn-seed-demo').addEventListener('click', seedDemoData);
    document.getElementById('btn-clear-all').addEventListener('click', clearAllData);
  }

  document.addEventListener('DOMContentLoaded', boot);

})(window.QualityApp);
