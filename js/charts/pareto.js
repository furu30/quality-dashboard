/**
 * 品質管理アプリ - パレート図
 */
window.QualityApp = window.QualityApp || {};

(function(app) {
  "use strict";

  var data = app.data;
  var u = app.utils;
  var chart = null;

  /** フィルタドロップダウン初期化 */
  function populateFilters() {
    return data.loadAllMasters().then(function(m) {
      fillOpt('pareto-product', m.products);
      fillOpt('pareto-process', m.processes);
    });
  }

  function fillOpt(selId, map) {
    var sel = document.getElementById(selId);
    if (!sel) return;
    var first = sel.querySelector('option');
    sel.innerHTML = '';
    if (first) sel.appendChild(first);
    Object.keys(map).forEach(function(id) {
      var opt = document.createElement('option');
      opt.value = id;
      opt.textContent = map[id].name;
      sel.appendChild(opt);
    });
  }

  /** パレート図を描画 */
  function draw() {
    var filters = {
      dateFrom: document.getElementById('pareto-date-from').value || undefined,
      dateTo: document.getElementById('pareto-date-to').value || undefined,
      productId: parseInt(document.getElementById('pareto-product').value, 10) || undefined,
      processId: parseInt(document.getElementById('pareto-process').value, 10) || undefined
    };
    var axis = document.getElementById('pareto-axis').value;

    data.loadAllMasters().then(function(masters) {
      data.queryDefects(filters).then(function(records) {
        // 集計
        var counts = {};
        records.forEach(function(r) {
          var key;
          if (axis === 'defectType') {
            key = r.defectTypeId;
          } else if (axis === 'process') {
            key = r.processId;
          } else if (axis === 'product') {
            key = r.productId;
          } else if (axis === 'rootCause') {
            key = r.rootCauseId;
          }
          if (key) counts[key] = (counts[key] || 0) + (r.quantity || 1);
        });

        // ソート（降順）
        var sorted = Object.keys(counts).map(function(key) {
          var masterMap;
          if (axis === 'defectType') masterMap = masters.defectTypes;
          else if (axis === 'process') masterMap = masters.processes;
          else if (axis === 'product') masterMap = masters.products;
          else if (axis === 'rootCause') masterMap = masters.rootCauses;
          var name = masterMap && masterMap[key] ? masterMap[key].name : 'ID:' + key;
          return { key: key, name: name, count: counts[key] };
        }).sort(function(a, b) { return b.count - a.count; });

        // 累積パーセント計算
        var total = sorted.reduce(function(s, item) { return s + item.count; }, 0);
        var cumulative = 0;
        sorted.forEach(function(item) {
          cumulative += item.count;
          item.percent = total > 0 ? u.round((item.count / total) * 100, 1) : 0;
          item.cumPercent = total > 0 ? u.round((cumulative / total) * 100, 1) : 0;
        });

        renderChart(sorted);
        renderTable(sorted);
      });
    });
  }

  /** Chart.js描画 */
  function renderChart(items) {
    var ctx = document.getElementById('chart-pareto');
    if (!ctx) return;
    if (chart) chart.destroy();

    var labels = items.map(function(i) { return i.name; });
    var barData = items.map(function(i) { return i.count; });
    var lineData = items.map(function(i) { return i.cumPercent; });

    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: '件数',
            data: barData,
            backgroundColor: u.CHART_COLORS.slice(0, items.length),
            borderRadius: 4,
            yAxisID: 'y'
          },
          {
            label: '累積 %',
            data: lineData,
            type: 'line',
            borderColor: '#f59e0b',
            backgroundColor: 'transparent',
            pointBackgroundColor: '#f59e0b',
            pointRadius: 4,
            tension: 0.2,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#c9d1d9' } },
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
            ticks: { color: '#7d8590', font: { size: 11 } }
          },
          y: {
            beginAtZero: true,
            position: 'left',
            grid: { color: 'rgba(34,48,74,0.5)' },
            ticks: { color: '#7d8590' },
            title: { display: true, text: '件数', color: '#7d8590' }
          },
          y1: {
            beginAtZero: true,
            max: 100,
            position: 'right',
            grid: { display: false },
            ticks: { color: '#f59e0b', callback: function(v) { return v + '%'; } },
            title: { display: true, text: '累積 %', color: '#f59e0b' }
          }
        }
      }
    });
  }

  /** パレートデータテーブル描画 */
  function renderTable(items) {
    var tbody = document.querySelector('#table-pareto tbody');
    if (!tbody) return;

    if (!items.length) {
      tbody.innerHTML = '<tr><td colspan="4"><div class="empty-state"><div class="empty-state-text">データがありません</div></div></td></tr>';
      return;
    }

    tbody.innerHTML = items.map(function(item) {
      return '<tr>' +
        '<td>' + u.escHtml(item.name) + '</td>' +
        '<td>' + item.count + '</td>' +
        '<td>' + item.percent + '%</td>' +
        '<td>' + item.cumPercent + '%</td>' +
      '</tr>';
    }).join('');
  }

  function init() {
    populateFilters();
    document.getElementById('btn-pareto-draw').addEventListener('click', draw);
  }

  app.pareto = {
    init: init,
    draw: draw,
    populateFilters: populateFilters
  };

})(window.QualityApp);
