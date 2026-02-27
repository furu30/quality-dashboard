/**
 * 品質管理アプリ - ヒストグラム
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

  function draw() {
    var filters = {
      dateFrom: document.getElementById('hist-date-from').value || undefined,
      dateTo: document.getElementById('hist-date-to').value || undefined,
      productId: parseInt(document.getElementById('hist-product').value, 10) || undefined,
      processId: parseInt(document.getElementById('hist-process').value, 10) || undefined
    };
    var variable = document.getElementById('hist-variable').value;
    var numBins = parseInt(document.getElementById('hist-bins').value, 10) || 10;

    data.queryDefects(filters).then(function(records) {
      // 数値抽出
      var values = records.map(function(r) { return r[variable]; }).filter(function(v) { return v != null && !isNaN(v); });

      if (!values.length) {
        clearStats();
        renderChart([], []);
        return;
      }

      // 統計量
      var mn = u.mean(values);
      var sd = u.stddev(values);
      var med = u.median(values);
      var minVal = Math.min.apply(null, values);
      var maxVal = Math.max.apply(null, values);

      document.getElementById('hist-n').textContent = values.length;
      document.getElementById('hist-mean').textContent = u.round(mn, 3);
      document.getElementById('hist-std').textContent = u.round(sd, 3);
      document.getElementById('hist-min').textContent = u.round(minVal, 3);
      document.getElementById('hist-max').textContent = u.round(maxVal, 3);
      document.getElementById('hist-median').textContent = u.round(med, 3);

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
        labels.push(u.round(low, 2) + '〜' + u.round(high, 2));
      }

      values.forEach(function(v) {
        var idx = Math.floor((v - minVal) / binWidth);
        if (idx >= numBins) idx = numBins - 1;
        if (idx < 0) idx = 0;
        bins[idx]++;
      });

      renderChart(labels, bins);
    });
  }

  function clearStats() {
    ['hist-n', 'hist-mean', 'hist-std', 'hist-min', 'hist-max', 'hist-median'].forEach(function(id) {
      document.getElementById(id).textContent = '-';
    });
  }

  function renderChart(labels, bins) {
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

  function init() {
    populateFilters();
    document.getElementById('btn-hist-draw').addEventListener('click', draw);
  }

  app.histogram = {
    init: init,
    draw: draw,
    populateFilters: populateFilters
  };

})(window.QualityApp);
