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

  // ===== デモデータ生成 =====

  function seedDemoData() {
    if (!confirm('デモデータを投入します。既存データに追加されます。よろしいですか？')) return;

    var products = [
      { code: 'P001', name: '製品A', category: '組立品' },
      { code: 'P002', name: '製品B', category: '加工品' },
      { code: 'P003', name: '製品C', category: '成形品' },
      { code: 'P004', name: '製品D', category: '電子部品' },
      { code: 'P005', name: '製品E', category: '加工品' }
    ];

    var processes = [
      { name: '受入検査', order: 1, department: '品質管理' },
      { name: '加工', order: 2, department: '製造' },
      { name: '組立', order: 3, department: '製造' },
      { name: '塗装', order: 4, department: '製造' },
      { name: '検査', order: 5, department: '品質管理' },
      { name: '出荷前検査', order: 6, department: '品質管理' }
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

    app.db.transaction('rw', app.db.products, app.db.processes, app.db.defectTypes, app.db.rootCauses, app.db.defectRecords, function() {
      // 既存マスタクリア → 再投入
      app.db.products.clear();
      app.db.processes.clear();
      app.db.defectTypes.clear();
      app.db.rootCauses.clear();
      app.db.defectRecords.clear();

      return Promise.all([
        app.db.products.bulkAdd(products).then(function() { return app.db.products.toArray(); }),
        app.db.processes.bulkAdd(processes).then(function() { return app.db.processes.toArray(); }),
        app.db.defectTypes.bulkAdd(defectTypes).then(function() { return app.db.defectTypes.toArray(); }),
        app.db.rootCauses.bulkAdd(rootCauses).then(function() { return app.db.rootCauses.toArray(); })
      ]).then(function(results) {
        pIds = results[0].map(function(r) { return r.id; });
        prIds = results[1].map(function(r) { return r.id; });
        dtIds = results[2].map(function(r) { return r.id; });
        rcIds = results[3].map(function(r) { return r.id; });

        // 不良記録生成（過去180日分、約200件）
        var records = generateDemoRecords(pIds, prIds, dtIds, rcIds, 220);
        return app.db.defectRecords.bulkAdd(records);
      });
    }).then(function() {
      alert('デモデータを投入しました');
      app.onDataReloaded();
    }).catch(function(err) {
      alert('デモデータ投入中にエラーが発生しました: ' + err.message);
    });
  }

  /** デモ不良記録を生成 */
  function generateDemoRecords(pIds, prIds, dtIds, rcIds, count) {
    var records = [];
    var severities = ['重大', '重度', '軽度', '軽微'];
    var sevWeights = [5, 15, 40, 40]; // 軽度・軽微が多い
    var detections = ['目視', '測定', '試験', '顧客指摘'];
    var detWeights = [40, 30, 20, 10];
    var statuses = ['未対応', '対応中', '完了'];
    var statWeights = [20, 15, 65];
    var operators = ['田中', '鈴木', '佐藤', '山田', '高橋', '伊藤', '渡辺', '中村'];

    // 不良種別の重み（パレート的偏り: 寸法不良と外観不良が多い）
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

      // 計測値: 基準値50±ランダム偏差（管理図用）
      var baseValue = 50;
      var measurement = u.round(baseValue + (Math.random() - 0.5) * 6, 2);
      // たまに管理外の値を発生させる
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
    if (!confirm('すべてのデータ（マスタ・不良記録）を削除します。この操作は取り消せません。実行しますか？')) return;
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
