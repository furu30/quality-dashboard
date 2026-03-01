/**
 * 品質管理アプリ - ダッシュボードモジュール
 */
window.QualityApp = window.QualityApp || {};

(function(app) {
  "use strict";

  var data = app.data;
  var u = app.utils;
  var trendChart = null;

  /** KPIを計算・表示 */
  function updateKPIs() {
    var monthStart = u.monthStart();
    var today = u.today();

    return data.loadAllMasters().then(function(masters) {
      return data.queryDefects({}).then(function(allRecords) {
        // 今月の記録
        var monthRecords = allRecords.filter(function(r) { return r.date >= monthStart && r.date <= today; });

        // 今月の不良件数
        var monthCount = monthRecords.length;
        var monthQty = monthRecords.reduce(function(s, r) { return s + (r.quantity || 0); }, 0);
        document.getElementById('kpi-month-count').textContent = monthQty;
        document.getElementById('kpi-month-sub').textContent = monthCount + '件の記録';

        // 不良率
        var totalLot = monthRecords.reduce(function(s, r) { return s + (r.lotSize || 0); }, 0);
        var rate = totalLot > 0 ? u.round((monthQty / totalLot) * 100, 2) : 0;
        document.getElementById('kpi-defect-rate').textContent = rate + '%';
        document.getElementById('kpi-rate-sub').textContent = 'ロット合計 ' + totalLot;

        // 最多不良種別
        var typeCounts = {};
        monthRecords.forEach(function(r) {
          if (r.defectTypeId) {
            typeCounts[r.defectTypeId] = (typeCounts[r.defectTypeId] || 0) + (r.quantity || 1);
          }
        });
        var topTypeId = null;
        var topTypeCount = 0;
        Object.keys(typeCounts).forEach(function(id) {
          if (typeCounts[id] > topTypeCount) {
            topTypeCount = typeCounts[id];
            topTypeId = id;
          }
        });
        var topTypeName = topTypeId && masters.defectTypes[topTypeId] ? masters.defectTypes[topTypeId].name : 'なし';
        document.getElementById('kpi-top-defect').textContent = topTypeName;
        document.getElementById('kpi-top-sub').textContent = topTypeCount + '個';

        // 未対応件数
        var openCount = allRecords.filter(function(r) { return r.status === '未対応'; }).length;
        var progressCount = allRecords.filter(function(r) { return r.status === '対応中'; }).length;
        document.getElementById('kpi-open-count').textContent = openCount;
        document.getElementById('kpi-open-sub').textContent = '対応中 ' + progressCount + '件';

        // 推移グラフデータ作成
        updateTrendChart(allRecords);

        // 直近テーブル
        updateRecentTable(allRecords.slice(0, 10), masters);

        // 検査データKPI
        updateInspectionKPIs();
      });
    });
  }

  /** 検査データKPIを計算・表示 */
  function updateInspectionKPIs() {
    data.queryInspections({}).then(function(records) {
      var row = document.getElementById('kpi-inspection-row');
      if (!records.length) {
        if (row) row.style.display = 'none';
        return;
      }
      if (row) row.style.display = '';

      // 件数
      document.getElementById('kpi-insp-count').textContent = records.length;

      // 測定項目の一覧
      var typeSet = {};
      records.forEach(function(r) { if (r.measurementType) typeSet[r.measurementType] = true; });
      var typeNames = Object.keys(typeSet);
      document.getElementById('kpi-insp-types').textContent = typeNames.length;
      document.getElementById('kpi-insp-types-sub').textContent = typeNames.join(' / ');

      // 日付範囲
      var dates = records.map(function(r) { return r.date; }).sort();
      document.getElementById('kpi-insp-sub').textContent = u.formatDate(dates[0]) + ' 〜 ' + u.formatDate(dates[dates.length - 1]);

      // 測定項目ごとにCpkと規格外れ率を計算（最初の項目で代表表示）
      var firstType = typeNames[0];
      var firstRecords = records.filter(function(r) { return r.measurementType === firstType; });

      if (firstRecords.length > 0 && firstRecords[0].usl != null && firstRecords[0].lsl != null) {
        var vals = firstRecords.map(function(r) { return r.measuredValue; });
        var mn = u.mean(vals);
        var sd = u.stddev(vals);
        var usl = firstRecords[0].usl;
        var lsl = firstRecords[0].lsl;

        if (sd > 0) {
          var cpU = (usl - mn) / (3 * sd);
          var cpL = (mn - lsl) / (3 * sd);
          var cpk = u.round(Math.min(cpU, cpL), 3);
          var cpkEl = document.getElementById('kpi-insp-cpk');
          cpkEl.textContent = cpk;
          cpkEl.style.color = cpk >= 1.33 ? 'var(--success)' : cpk >= 1.0 ? 'var(--warning)' : 'var(--danger)';
          document.getElementById('kpi-insp-cpk-sub').textContent = firstType + '（USL=' + usl + ' / LSL=' + lsl + '）';
        }

        // 規格外れ率
        var oor = vals.filter(function(v) { return v > usl || v < lsl; }).length;
        var oorRate = u.round((oor / vals.length) * 100, 2);
        document.getElementById('kpi-insp-oor').textContent = oorRate + '%';
        document.getElementById('kpi-insp-oor-sub').textContent = firstType + '：' + oor + '/' + vals.length + '件';
      } else {
        document.getElementById('kpi-insp-cpk').textContent = '-';
        document.getElementById('kpi-insp-cpk-sub').textContent = '';
        document.getElementById('kpi-insp-oor').textContent = '-';
        document.getElementById('kpi-insp-oor-sub').textContent = '';
      }
    });
  }

  /** 30日推移グラフ */
  function updateTrendChart(allRecords) {
    var labels = [];
    var counts = [];
    var today = new Date();

    for (var i = 29; i >= 0; i--) {
      var d = new Date(today);
      d.setDate(d.getDate() - i);
      var dateStr = d.toISOString().slice(0, 10);
      labels.push(u.shortDate(dateStr));

      var dayCount = allRecords.filter(function(r) { return r.date === dateStr; })
        .reduce(function(s, r) { return s + (r.quantity || 0); }, 0);
      counts.push(dayCount);
    }

    var ctx = document.getElementById('chart-trend');
    if (!ctx) return;

    if (trendChart) trendChart.destroy();

    trendChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: '不良数',
          data: counts,
          borderColor: u.CHART_COLORS[0],
          backgroundColor: 'rgba(76, 139, 245, 0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 2,
          pointHoverRadius: 5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1a2233',
            titleColor: '#e6edf3',
            bodyColor: '#c9d1d9',
            borderColor: '#22304a',
            borderWidth: 1
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(34,48,74,0.5)' },
            ticks: { color: '#7d8590', font: { size: 10 }, maxRotation: 45 }
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(34,48,74,0.5)' },
            ticks: { color: '#7d8590', stepSize: 1 }
          }
        }
      }
    });
  }

  /** 直近の不良記録テーブル */
  function updateRecentTable(records, masters) {
    var tbody = document.querySelector('#table-recent tbody');
    if (!tbody) return;

    if (!records.length) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><div class="empty-state-text">データがありません。「デモデータ投入」ボタンまたは「不良記録」タブからデータを追加してください。</div></div></td></tr>';
      return;
    }

    tbody.innerHTML = records.map(function(r) {
      var product = masters.products[r.productId];
      var process = masters.processes[r.processId];
      var defectType = masters.defectTypes[r.defectTypeId];
      return '<tr>' +
        '<td>' + u.formatDate(r.date) + '</td>' +
        '<td>' + u.escHtml(product ? product.name : '') + '</td>' +
        '<td>' + u.escHtml(process ? process.name : '') + '</td>' +
        '<td>' + u.escHtml(defectType ? defectType.name : '') + '</td>' +
        '<td>' + r.quantity + '</td>' +
        '<td>' + u.severityBadge(r.severity) + '</td>' +
        '<td>' + u.statusBadge(r.status) + '</td>' +
      '</tr>';
    }).join('');
  }

  function init() {
    updateKPIs();
  }

  app.dashboard = {
    init: init,
    refresh: updateKPIs
  };

})(window.QualityApp);
