/**
 * 品質管理アプリ - ヒストグラム
 * 不良記録・検査データ両対応、USL/LSL表示、Cpk算出
 */
window.QualityApp = window.QualityApp || {};

(function(app) {
  "use strict";

  var data = app.data;
  var u = app.utils;
  var chart = null;

  function populateFilters() {
    return data.loadAllMasters().then(function(m) {
      fillOpt('hist-product', m.products);
      fillOpt('hist-process', m.processes);
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

  /** 検査データの測定項目ドロップダウンを更新 */
  function populateInspectionTypes() {
    return data.getInspectionTypes().then(function(types) {
      var sel = document.getElementById('hist-mtype');
      sel.innerHTML = '<option value="">全項目</option>';
      types.forEach(function(t) {
        var opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        sel.appendChild(opt);
      });
    });
  }

  /** データソース切替時のUI表示切替 */
  function onSourceChange() {
    var source = document.getElementById('hist-source').value;
    var isInspection = source === 'inspection';
    document.getElementById('hist-variable-group').style.display = isInspection ? 'none' : '';
    document.getElementById('hist-mtype-group').style.display = isInspection ? '' : 'none';
    document.getElementById('hist-cpk-item').style.display = isInspection ? '' : 'none';
    if (isInspection) populateInspectionTypes();
  }

  function draw() {
    var source = document.getElementById('hist-source').value;
    if (source === 'inspection') {
      drawInspection();
    } else {
      drawDefect();
    }
  }

  // ===== 不良記録ヒストグラム（従来） =====

  function drawDefect() {
    var filters = {
      dateFrom: document.getElementById('hist-date-from').value || undefined,
      dateTo: document.getElementById('hist-date-to').value || undefined,
      productId: parseInt(document.getElementById('hist-product').value, 10) || undefined,
      processId: parseInt(document.getElementById('hist-process').value, 10) || undefined
    };
    var variable = document.getElementById('hist-variable').value;
    var numBins = parseInt(document.getElementById('hist-bins').value, 10) || 10;

    data.queryDefects(filters).then(function(records) {
      var values = records.map(function(r) { return r[variable]; }).filter(function(v) { return v != null && !isNaN(v); });
      renderHistogram(values, numBins, null, null);
    });
  }

  // ===== 検査データヒストグラム =====

  function drawInspection() {
    var filters = {
      dateFrom: document.getElementById('hist-date-from').value || undefined,
      dateTo: document.getElementById('hist-date-to').value || undefined,
      productId: parseInt(document.getElementById('hist-product').value, 10) || undefined,
      processId: parseInt(document.getElementById('hist-process').value, 10) || undefined,
      measurementType: document.getElementById('hist-mtype').value || undefined
    };
    var numBins = parseInt(document.getElementById('hist-bins').value, 10) || 10;

    data.queryInspections(filters).then(function(records) {
      var values = records.map(function(r) { return r.measuredValue; }).filter(function(v) { return v != null && !isNaN(v); });

      // USL/LSLを取得 (同一測定項目なら全レコード共通)
      var usl = null, lsl = null;
      if (records.length > 0 && records[0].usl != null) {
        usl = records[0].usl;
        lsl = records[0].lsl;
      }

      renderHistogram(values, numBins, usl, lsl);
    });
  }

  // ===== 共通描画 =====

  function renderHistogram(values, numBins, usl, lsl) {
    if (!values.length) {
      clearStats();
      renderChart([], [], null, null);
      return;
    }

    // 統計量
    var mn = u.mean(values);
    var sd = u.stddev(values);
    var med = u.median(values);
    var minVal = Math.min.apply(null, values);
    var maxVal = Math.max.apply(null, values);

    document.getElementById('hist-n').textContent = values.length;
    document.getElementById('hist-mean').textContent = u.round(mn, 4);
    document.getElementById('hist-std').textContent = u.round(sd, 4);
    document.getElementById('hist-min').textContent = u.round(minVal, 4);
    document.getElementById('hist-max').textContent = u.round(maxVal, 4);
    document.getElementById('hist-median').textContent = u.round(med, 4);

    // Cpk算出 (検査データでUSL/LSLがある場合)
    var cpkEl = document.getElementById('hist-cpk');
    if (usl !== null && lsl !== null && sd > 0) {
      var cpU = (usl - mn) / (3 * sd);
      var cpL = (mn - lsl) / (3 * sd);
      var cpk = u.round(Math.min(cpU, cpL), 3);
      cpkEl.textContent = cpk;
      cpkEl.style.color = cpk >= 1.33 ? 'var(--success)' : cpk >= 1.0 ? 'var(--warning)' : 'var(--danger)';
    } else {
      cpkEl.textContent = '-';
      cpkEl.style.color = '';
    }

    // ビン計算
    var range = maxVal - minVal;
    if (range === 0) range = 1;
    var binWidth = range / numBins;
    var bins = [];
    var labels = [];

    for (var i = 0; i < numBins; i++) {
      var low = minVal + i * binWidth;
      var high = low + binWidth;
      bins.push(0);
      labels.push(u.round(low, 3) + '〜' + u.round(high, 3));
    }

    values.forEach(function(v) {
      var idx = Math.floor((v - minVal) / binWidth);
      if (idx >= numBins) idx = numBins - 1;
      if (idx < 0) idx = 0;
      bins[idx]++;
    });

    renderChart(labels, bins, usl, lsl);
  }

  function clearStats() {
    ['hist-n', 'hist-mean', 'hist-std', 'hist-min', 'hist-max', 'hist-median', 'hist-cpk'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) { el.textContent = '-'; el.style.color = ''; }
    });
  }

  function renderChart(labels, bins, usl, lsl) {
    var ctx = document.getElementById('chart-histogram');
    if (!ctx) return;
    if (chart) chart.destroy();

    if (!labels.length) {
      chart = new Chart(ctx, {
        type: 'bar',
        data: { labels: ['データなし'], datasets: [{ data: [0] }] },
        options: { responsive: true, maintainAspectRatio: false }
      });
      return;
    }

    // USL/LSL アノテーション
    var annotations = {};
    if (usl !== null) {
      annotations.uslLine = {
        type: 'line', scaleID: 'x',
        value: findBinIndex(labels, usl),
        borderColor: '#ef4444', borderWidth: 2, borderDash: [6, 4],
        label: { display: true, content: 'USL = ' + usl, position: 'start', backgroundColor: 'rgba(239,68,68,0.8)', color: '#fff', font: { size: 10 } }
      };
    }
    if (lsl !== null) {
      annotations.lslLine = {
        type: 'line', scaleID: 'x',
        value: findBinIndex(labels, lsl),
        borderColor: '#ef4444', borderWidth: 2, borderDash: [6, 4],
        label: { display: true, content: 'LSL = ' + lsl, position: 'end', backgroundColor: 'rgba(239,68,68,0.8)', color: '#fff', font: { size: 10 } }
      };
    }

    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: '度数',
          data: bins,
          backgroundColor: 'rgba(76, 139, 245, 0.7)',
          borderColor: '#4c8bf5',
          borderWidth: 1,
          borderRadius: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1a2233', titleColor: '#e6edf3',
            bodyColor: '#c9d1d9', borderColor: '#22304a', borderWidth: 1
          },
          annotation: { annotations: annotations }
        },
        scales: {
          x: {
            grid: { color: 'rgba(34,48,74,0.5)' },
            ticks: { color: '#7d8590', font: { size: 10 }, maxRotation: 45 },
            title: { display: true, text: '階級', color: '#7d8590' }
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(34,48,74,0.5)' },
            ticks: { color: '#7d8590', stepSize: 1 },
            title: { display: true, text: '度数', color: '#7d8590' }
          }
        }
      }
    });
  }

  /** USL/LSLの値がどのビンのインデックスに対応するか算出 */
  function findBinIndex(labels, value) {
    for (var i = 0; i < labels.length; i++) {
      var parts = labels[i].split('〜');
      var low = parseFloat(parts[0]);
      var high = parseFloat(parts[1]);
      if (value >= low && value <= high) return i;
      if (value < low) return Math.max(0, i - 0.5);
    }
    return labels.length - 0.5;
  }

  function init() {
    populateFilters();
    document.getElementById('btn-hist-draw').addEventListener('click', draw);
    document.getElementById('hist-source').addEventListener('change', onSourceChange);
  }

  app.histogram = {
    init: init,
    draw: draw,
    populateFilters: populateFilters
  };

})(window.QualityApp);
