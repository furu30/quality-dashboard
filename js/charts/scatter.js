/**
 * 品質管理アプリ - 散布図
 */
window.QualityApp = window.QualityApp || {};

(function(app) {
  "use strict";

  var data = app.data;
  var u = app.utils;
  var chart = null;

  var FIELD_LABELS = {
    quantity: '不良数',
    lotSize: 'ロットサイズ',
    measurementValue: '計測値'
  };

  function populateFilters() {
    // 散布図は期間フィルタのみ（軸は選択式）
  }

  function draw() {
    var filters = {
      dateFrom: document.getElementById('scatter-date-from').value || undefined,
      dateTo: document.getElementById('scatter-date-to').value || undefined
    };
    var xField = document.getElementById('scatter-x').value;
    var yField = document.getElementById('scatter-y').value;
    var groupBy = document.getElementById('scatter-group').value;

    data.loadAllMasters().then(function(masters) {
      data.queryDefects(filters).then(function(records) {
        // 有効なデータのみ抽出
        var points = records.filter(function(r) {
          return r[xField] != null && r[yField] != null && !isNaN(r[xField]) && !isNaN(r[yField]);
        });

        if (!points.length) {
          clearStats();
          renderEmptyChart();
          return;
        }

        var xs = points.map(function(r) { return r[xField]; });
        var ys = points.map(function(r) { return r[yField]; });

        // 統計
        var r_val = u.correlationCoefficient(xs, ys);
        var r2 = r_val * r_val;
        var reg = u.linearRegression(xs, ys);

        document.getElementById('scatter-n').textContent = points.length;
        document.getElementById('scatter-r').textContent = u.round(r_val, 4);
        document.getElementById('scatter-r2').textContent = u.round(r2, 4);
        document.getElementById('scatter-eq').textContent = 'y = ' + u.round(reg.a, 3) + ' + ' + u.round(reg.b, 3) + 'x';

        // データセット作成
        var datasets;
        if (groupBy) {
          datasets = buildGroupedDatasets(points, xField, yField, groupBy, masters);
        } else {
          datasets = [{
            label: 'データ',
            data: points.map(function(r) { return { x: r[xField], y: r[yField] }; }),
            backgroundColor: 'rgba(76, 139, 245, 0.7)',
            borderColor: '#4c8bf5',
            pointRadius: 5,
            pointHoverRadius: 7
          }];
        }

        // 回帰直線データセット
        var xMin = Math.min.apply(null, xs);
        var xMax = Math.max.apply(null, xs);
        datasets.push({
          label: '回帰直線',
          data: [
            { x: xMin, y: reg.a + reg.b * xMin },
            { x: xMax, y: reg.a + reg.b * xMax }
          ],
          type: 'line',
          borderColor: '#f59e0b',
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false
        });

        renderChart(datasets, xField, yField);
      });
    });
  }

  function buildGroupedDatasets(points, xField, yField, groupBy, masters) {
    var groups = {};
    points.forEach(function(r) {
      var key;
      if (groupBy === 'product') key = r.productId;
      else if (groupBy === 'process') key = r.processId;
      else if (groupBy === 'defectType') key = r.defectTypeId;
      if (!key) key = 'unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push({ x: r[xField], y: r[yField] });
    });

    var masterMap;
    if (groupBy === 'product') masterMap = masters.products;
    else if (groupBy === 'process') masterMap = masters.processes;
    else if (groupBy === 'defectType') masterMap = masters.defectTypes;

    var idx = 0;
    return Object.keys(groups).map(function(key) {
      var name = masterMap && masterMap[key] ? masterMap[key].name : key;
      var color = u.CHART_COLORS[idx % u.CHART_COLORS.length];
      idx++;
      return {
        label: name,
        data: groups[key],
        backgroundColor: color + 'B3',
        borderColor: color,
        pointRadius: 5,
        pointHoverRadius: 7
      };
    });
  }

  function clearStats() {
    ['scatter-n', 'scatter-r', 'scatter-r2', 'scatter-eq'].forEach(function(id) {
      document.getElementById(id).textContent = '-';
    });
  }

  function renderEmptyChart() {
    var ctx = document.getElementById('chart-scatter');
    if (!ctx) return;
    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: 'scatter',
      data: { datasets: [{ data: [] }] },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  function renderChart(datasets, xField, yField) {
    var ctx = document.getElementById('chart-scatter');
    if (!ctx) return;
    if (chart) chart.destroy();

    chart = new Chart(ctx, {
      type: 'scatter',
      data: { datasets: datasets },
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
            ticks: { color: '#7d8590' },
            title: { display: true, text: FIELD_LABELS[xField] || xField, color: '#7d8590' }
          },
          y: {
            grid: { color: 'rgba(34,48,74,0.5)' },
            ticks: { color: '#7d8590' },
            title: { display: true, text: FIELD_LABELS[yField] || yField, color: '#7d8590' }
          }
        }
      }
    });
  }

  function init() {
    populateFilters();
    document.getElementById('btn-scatter-draw').addEventListener('click', draw);
  }

  app.scatter = {
    init: init,
    draw: draw,
    populateFilters: populateFilters
  };

})(window.QualityApp);
