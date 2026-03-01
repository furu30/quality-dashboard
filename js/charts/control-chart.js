/**
 * 品質管理アプリ - 管理図
 * 不良記録: np管理図, p管理図, X管理図
 * 検査データ: X̄管理図, R管理図, 個別値管理図
 */
window.QualityApp = window.QualityApp || {};

(function(app) {
  "use strict";

  var data = app.data;
  var u = app.utils;
  var chart = null;

  // X̄-R管理図のA2, D3, D4定数 (n=2..10)
  var A2 = { 2:1.880, 3:1.023, 4:0.729, 5:0.577, 6:0.483, 7:0.419, 8:0.373, 9:0.337, 10:0.308 };
  var D3 = { 2:0, 3:0, 4:0, 5:0, 6:0, 7:0.076, 8:0.136, 9:0.184, 10:0.223 };
  var D4 = { 2:3.267, 3:2.574, 4:2.282, 5:2.114, 6:2.004, 7:1.924, 8:1.864, 9:1.816, 10:1.777 };

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

  /** 検査データの測定項目ドロップダウン更新 */
  function populateInspectionTypes() {
    return data.getInspectionTypes().then(function(types) {
      var sel = document.getElementById('ctrl-mtype');
      sel.innerHTML = '<option value="">全項目</option>';
      types.forEach(function(t) {
        var opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        sel.appendChild(opt);
      });
    });
  }

  /** グラフ種別変更時のUI切替 */
  function onTypeChange() {
    var type = document.getElementById('ctrl-type').value;
    var isInsp = type.indexOf('insp-') === 0;
    document.getElementById('ctrl-mtype-group').style.display = isInsp ? '' : 'none';
    if (isInsp) populateInspectionTypes();
  }

  function draw() {
    var chartType = document.getElementById('ctrl-type').value;
    if (chartType.indexOf('insp-') === 0) {
      drawInspection(chartType);
    } else {
      drawDefect(chartType);
    }
  }

  // ===== 不良記録ベースの管理図（従来） =====

  function drawDefect(chartType) {
    var filters = {
      dateFrom: document.getElementById('ctrl-date-from').value || undefined,
      dateTo: document.getElementById('ctrl-date-to').value || undefined,
      processId: parseInt(document.getElementById('ctrl-process').value, 10) || undefined,
      productId: parseInt(document.getElementById('ctrl-product').value, 10) || undefined
    };

    data.queryDefects(filters).then(function(records) {
      records.sort(function(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });

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
        values = dates.map(function(d) { return dayMap[d].qty; });
      } else if (chartType === 'defect-rate') {
        values = dates.map(function(d) {
          var day = dayMap[d];
          return day.lot > 0 ? u.round((day.qty / day.lot) * 100, 2) : 0;
        });
      } else if (chartType === 'measurement') {
        values = dates.map(function(d) {
          var ms = dayMap[d].measurements;
          return ms.length > 0 ? u.round(u.mean(ms), 3) : null;
        });
        var filtered = [], filteredLabels = [];
        for (var i = 0; i < values.length; i++) {
          if (values[i] !== null) { filtered.push(values[i]); filteredLabels.push(labels[i]); }
        }
        values = filtered;
        labels = filteredLabels;
      }

      if (!values.length) { clearStats(); renderEmptyChart(); return; }

      var cl = u.round(u.mean(values), 3);
      var sd = u.stddev(values);
      var ucl = u.round(cl + 3 * sd, 3);
      var lcl = u.round(cl - 3 * sd, 3);
      if (lcl < 0 && chartType !== 'measurement') lcl = 0;

      var oor = values.filter(function(v) { return v > ucl || v < lcl; }).length;
      showStats(cl, ucl, lcl, oor);
      renderChart(labels, values, cl, ucl, lcl, '実測値');
    });
  }

  // ===== 検査データベースの管理図 =====

  function drawInspection(chartType) {
    var filters = {
      dateFrom: document.getElementById('ctrl-date-from').value || undefined,
      dateTo: document.getElementById('ctrl-date-to').value || undefined,
      processId: parseInt(document.getElementById('ctrl-process').value, 10) || undefined,
      productId: parseInt(document.getElementById('ctrl-product').value, 10) || undefined,
      measurementType: document.getElementById('ctrl-mtype').value || undefined
    };

    data.queryInspections(filters).then(function(records) {
      if (!records.length) { clearStats(); renderEmptyChart(); return; }

      records.sort(function(a, b) {
        return a.date < b.date ? -1 : a.date > b.date ? 1 :
               a.time < b.time ? -1 : a.time > b.time ? 1 : 0;
      });

      if (chartType === 'insp-individual') {
        drawInspIndividual(records);
      } else {
        drawInspXbarR(records, chartType);
      }
    });
  }

  /** X̄管理図 / R管理図 */
  function drawInspXbarR(records, chartType) {
    // サブグループ別に集計
    var sgMap = {};
    var sgOrder = [];
    records.forEach(function(r) {
      var key = r.subgroupId;
      if (!sgMap[key]) {
        sgMap[key] = { values: [], date: r.date, time: r.time };
        sgOrder.push(key);
      }
      sgMap[key].values.push(r.measuredValue);
    });

    var n = 0; // サブグループサイズ
    var xbars = [], ranges = [], labels = [];

    sgOrder.forEach(function(key) {
      var sg = sgMap[key];
      var vals = sg.values;
      if (vals.length < 2) return;
      if (n === 0) n = vals.length;

      var xbar = u.mean(vals);
      var range = Math.max.apply(null, vals) - Math.min.apply(null, vals);
      xbars.push(u.round(xbar, 4));
      ranges.push(u.round(range, 4));
      labels.push(u.shortDate(sg.date) + ' ' + sg.time);
    });

    if (!xbars.length || n < 2 || n > 10) { clearStats(); renderEmptyChart(); return; }

    var xbarMean = u.mean(xbars);
    var rMean = u.mean(ranges);

    if (chartType === 'insp-xbar') {
      // X̄管理図
      var ucl = u.round(xbarMean + A2[n] * rMean, 4);
      var lcl = u.round(xbarMean - A2[n] * rMean, 4);
      var cl = u.round(xbarMean, 4);
      var oor = xbars.filter(function(v) { return v > ucl || v < lcl; }).length;
      showStats(cl, ucl, lcl, oor);
      renderChart(labels, xbars, cl, ucl, lcl, 'X̄ (サブグループ平均)');
    } else {
      // R管理図
      var uclR = u.round(D4[n] * rMean, 4);
      var lclR = u.round(D3[n] * rMean, 4);
      var clR = u.round(rMean, 4);
      var oorR = ranges.filter(function(v) { return v > uclR || v < lclR; }).length;
      showStats(clR, uclR, lclR, oorR);
      renderChart(labels, ranges, clR, uclR, lclR, 'R (サブグループ範囲)');
    }
  }

  /** 個別値管理図 */
  function drawInspIndividual(records) {
    var values = [];
    var labels = [];
    records.forEach(function(r) {
      values.push(r.measuredValue);
      labels.push(u.shortDate(r.date) + ' ' + r.time + ' #' + r.sampleNo);
    });

    if (!values.length) { clearStats(); renderEmptyChart(); return; }

    // 移動範囲法 (MR) で σ を推定
    var mrs = [];
    for (var i = 1; i < values.length; i++) {
      mrs.push(Math.abs(values[i] - values[i - 1]));
    }
    var mrMean = u.mean(mrs);
    var sigma = mrMean / 1.128; // d2 for n=2

    var cl = u.round(u.mean(values), 4);
    var ucl = u.round(cl + 3 * sigma, 4);
    var lcl = u.round(cl - 3 * sigma, 4);
    var oor = values.filter(function(v) { return v > ucl || v < lcl; }).length;

    showStats(cl, ucl, lcl, oor);
    renderChart(labels, values, cl, ucl, lcl, '個別値');
  }

  // ===== 共通UI =====

  function showStats(cl, ucl, lcl, oor) {
    document.getElementById('ctrl-cl').textContent = cl;
    document.getElementById('ctrl-ucl').textContent = ucl;
    document.getElementById('ctrl-lcl').textContent = lcl;
    document.getElementById('ctrl-oor').textContent = oor + '点';
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

  function renderChart(labels, values, cl, ucl, lcl, dataLabel) {
    var ctx = document.getElementById('chart-control');
    if (!ctx) return;
    if (chart) chart.destroy();

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
          label: dataLabel || '実測値',
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
            backgroundColor: '#1a2233', titleColor: '#e6edf3',
            bodyColor: '#c9d1d9', borderColor: '#22304a', borderWidth: 1
          },
          annotation: {
            annotations: {
              uclLine: {
                type: 'line', yMin: ucl, yMax: ucl,
                borderColor: '#ef4444', borderWidth: 2, borderDash: [6, 4],
                label: { display: true, content: 'UCL = ' + ucl, position: 'start', backgroundColor: 'rgba(239,68,68,0.8)', color: '#fff', font: { size: 10 } }
              },
              clLine: {
                type: 'line', yMin: cl, yMax: cl,
                borderColor: '#34d399', borderWidth: 2,
                label: { display: true, content: 'CL = ' + cl, position: 'start', backgroundColor: 'rgba(52,211,153,0.8)', color: '#fff', font: { size: 10 } }
              },
              lclLine: {
                type: 'line', yMin: lcl, yMax: lcl,
                borderColor: '#ef4444', borderWidth: 2, borderDash: [6, 4],
                label: { display: true, content: 'LCL = ' + lcl, position: 'start', backgroundColor: 'rgba(239,68,68,0.8)', color: '#fff', font: { size: 10 } }
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
    document.getElementById('ctrl-type').addEventListener('change', onTypeChange);
  }

  app.controlChart = {
    init: init,
    draw: draw,
    populateFilters: populateFilters
  };

})(window.QualityApp);
