/**
 * 品質管理アプリ - 管理図 (np管理図, p管理図, X管理図)
 */
window.QualityApp = window.QualityApp || {};

(function(app) {
  "use strict";

  var data = app.data;
  var u = app.utils;
  var chart = null;

  function populateFilters() {
    return data.loadAllMasters().then(function(m) {
      fillOpt('ctrl-process', m.processes);
      fillOpt('ctrl-product', m.products);
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
      dateFrom: document.getElementById('ctrl-date-from').value || undefined,
      dateTo: document.getElementById('ctrl-date-to').value || undefined,
      processId: parseInt(document.getElementById('ctrl-process').value, 10) || undefined,
      productId: parseInt(document.getElementById('ctrl-product').value, 10) || undefined
    };
    var chartType = document.getElementById('ctrl-type').value;

    data.queryDefects(filters).then(function(records) {
      // 日付順にソート
      records.sort(function(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });

      // 日別に集計
      var dayMap = {};
      records.forEach(function(r) {
        if (!dayMap[r.date]) dayMap[r.date] = { qty: 0, lot: 0, measurements: [] };
        dayMap[r.date].qty += (r.quantity || 0);
        dayMap[r.date].lot += (r.lotSize || 0);
        if (r.measurementValue != null) dayMap[r.date].measurements.push(r.measurementValue);
      });

      var dates = Object.keys(dayMap).sort();
      var values = [];
      var labels = dates.map(function(d) { return u.shortDate(d); });

      if (chartType === 'defect-count') {
        // np管理図: 不良数
        values = dates.map(function(d) { return dayMap[d].qty; });
      } else if (chartType === 'defect-rate') {
        // p管理図: 不良率
        values = dates.map(function(d) {
          var day = dayMap[d];
          return day.lot > 0 ? u.round((day.qty / day.lot) * 100, 2) : 0;
        });
      } else if (chartType === 'measurement') {
        // X管理図: 計測値の日平均
        values = dates.map(function(d) {
          var ms = dayMap[d].measurements;
          return ms.length > 0 ? u.round(u.mean(ms), 3) : null;
        });
        // null除外
        var filtered = [];
        var filteredLabels = [];
        for (var i = 0; i < values.length; i++) {
          if (values[i] !== null) {
            filtered.push(values[i]);
            filteredLabels.push(labels[i]);
          }
        }
        values = filtered;
        labels = filteredLabels;
      }

      if (!values.length) {
        clearStats();
        renderEmptyChart();
        return;
      }

      // 管理限界計算
      var cl = u.round(u.mean(values), 3);
      var sd = u.stddev(values);
      var ucl = u.round(cl + 3 * sd, 3);
      var lcl = u.round(cl - 3 * sd, 3);
      if (lcl < 0 && chartType !== 'measurement') lcl = 0;

      // 管理外点カウント
      var oor = values.filter(function(v) { return v > ucl || v < lcl; }).length;

      document.getElementById('ctrl-cl').textContent = cl;
      document.getElementById('ctrl-ucl').textContent = ucl;
      document.getElementById('ctrl-lcl').textContent = lcl;
      document.getElementById('ctrl-oor').textContent = oor + '点';

      renderChart(labels, values, cl, ucl, lcl);
    });
  }

  function clearStats() {
    ['ctrl-cl', 'ctrl-ucl', 'ctrl-lcl', 'ctrl-oor'].forEach(function(id) {
      document.getElementById(id).textContent = '-';
    });
  }

  function renderEmptyChart() {
    var ctx = document.getElementById('chart-control');
    if (!ctx) return;
    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: 'line',
      data: { labels: ['データなし'], datasets: [{ data: [0] }] },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  function renderChart(labels, values, cl, ucl, lcl) {
    var ctx = document.getElementById('chart-control');
    if (!ctx) return;
    if (chart) chart.destroy();

    // 管理外点のポイントカラー
    var pointColors = values.map(function(v) {
      return (v > ucl || v < lcl) ? '#ef4444' : '#4c8bf5';
    });
    var pointRadii = values.map(function(v) {
      return (v > ucl || v < lcl) ? 6 : 3;
    });

    chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: '実測値',
          data: values,
          borderColor: '#4c8bf5',
          backgroundColor: 'transparent',
          pointBackgroundColor: pointColors,
          pointRadius: pointRadii,
          pointHoverRadius: 6,
          tension: 0.1,
          borderWidth: 2
        }]
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
          },
          annotation: {
            annotations: {
              uclLine: {
                type: 'line',
                yMin: ucl,
                yMax: ucl,
                borderColor: '#ef4444',
                borderWidth: 2,
                borderDash: [6, 4],
                label: {
                  display: true,
                  content: 'UCL = ' + ucl,
                  position: 'start',
                  backgroundColor: 'rgba(239, 68, 68, 0.8)',
                  color: '#fff',
                  font: { size: 10 }
                }
              },
              clLine: {
                type: 'line',
                yMin: cl,
                yMax: cl,
                borderColor: '#34d399',
                borderWidth: 2,
                label: {
                  display: true,
                  content: 'CL = ' + cl,
                  position: 'start',
                  backgroundColor: 'rgba(52, 211, 153, 0.8)',
                  color: '#fff',
                  font: { size: 10 }
                }
              },
              lclLine: {
                type: 'line',
                yMin: lcl,
                yMax: lcl,
                borderColor: '#ef4444',
                borderWidth: 2,
                borderDash: [6, 4],
                label: {
                  display: true,
                  content: 'LCL = ' + lcl,
                  position: 'start',
                  backgroundColor: 'rgba(239, 68, 68, 0.8)',
                  color: '#fff',
                  font: { size: 10 }
                }
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(34,48,74,0.5)' },
            ticks: { color: '#7d8590', font: { size: 10 }, maxRotation: 45 }
          },
          y: {
            grid: { color: 'rgba(34,48,74,0.5)' },
            ticks: { color: '#7d8590' }
          }
        }
      }
    });
  }

  function init() {
    populateFilters();
    document.getElementById('btn-ctrl-draw').addEventListener('click', draw);
  }

  app.controlChart = {
    init: init,
    draw: draw,
    populateFilters: populateFilters
  };

})(window.QualityApp);
