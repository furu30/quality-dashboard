/**
 * 品質管理アプリ - 検査分析モジュール
 * サブタブ1: 要因別比較分析
 * サブタブ2: 管理図異常検出 (Western Electric Rules)
 * サブタブ3: Cpk推移
 */
window.QualityApp = window.QualityApp || {};

(function(app) {
  "use strict";

  var data = app.data;
  var u = app.utils;
  var factorChart = null;
  var westernChart = null;
  var cpkChart = null;

  // X̄-R管理図のA2定数 (n=2..10)
  var A2 = { 2:1.880, 3:1.023, 4:0.729, 5:0.577, 6:0.483, 7:0.419, 8:0.373, 9:0.337, 10:0.308 };

  // ===== 共通: 測定項目ドロップダウン更新 =====

  function populateInspectionTypes() {
    return data.getInspectionTypes().then(function(types) {
      ['ia-f-mtype', 'ia-w-mtype', 'ia-c-mtype'].forEach(function(selId) {
        var sel = document.getElementById(selId);
        if (!sel) return;
        sel.innerHTML = '<option value="">全項目</option>';
        types.forEach(function(t) {
          var opt = document.createElement('option');
          opt.value = t;
          opt.textContent = t;
          sel.appendChild(opt);
        });
      });
    });
  }

  // ===== 共通: フィルタ取得 =====

  function getFilters(prefix) {
    var sel = document.getElementById(prefix + '-mtype');
    var mtype = sel ? sel.value : '';
    // 全項目選択時は最初の測定項目を自動選択（異なるUSL/LSLが混在するのを防ぐ）
    if (!mtype && sel && sel.options.length > 1) {
      mtype = sel.options[1].value;
      sel.value = mtype;
    }
    return {
      dateFrom: document.getElementById(prefix + '-date-from').value || undefined,
      dateTo: document.getElementById(prefix + '-date-to').value || undefined,
      measurementType: mtype || undefined
    };
  }

  // ===== サブタブ切替 =====

  function initSubTabs() {
    var panel = document.getElementById('tab-insp-analysis');
    if (!panel) return;
    var bar = panel.querySelector('.sub-tab-bar');
    bar.addEventListener('click', function(e) {
      var btn = e.target.closest('.sub-tab-item');
      if (!btn) return;
      bar.querySelectorAll('.sub-tab-item').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      panel.querySelectorAll('.sub-tab-panel').forEach(function(p) { p.classList.remove('active'); });
      var target = document.getElementById(btn.dataset.subtab);
      if (target) target.classList.add('active');
    });
  }

  // ========================================================
  // サブタブ1: 要因別比較分析
  // ========================================================

  function drawFactor() {
    var filters = getFilters('ia-f');
    var groupBy = document.getElementById('ia-f-group').value;

    data.queryInspections(filters).then(function(records) {
      if (!records.length) { renderFactorEmpty(); return; }

      // USL/LSL取得
      var usl = null, lsl = null;
      for (var i = 0; i < records.length; i++) {
        if (records[i].usl != null) { usl = records[i].usl; lsl = records[i].lsl; break; }
      }

      // グループ化
      var groups = groupRecords(records, groupBy);
      var groupNames = Object.keys(groups).sort();

      if (!groupNames.length) { renderFactorEmpty(); return; }

      // 統計計算
      var statsData = groupNames.map(function(name) {
        var vals = groups[name];
        var mn = u.mean(vals);
        var sd = u.stddev(vals);
        var cpk = null;
        var oorRate = 0;
        if (usl !== null && lsl !== null && sd > 0) {
          var cpU = (usl - mn) / (3 * sd);
          var cpL = (mn - lsl) / (3 * sd);
          cpk = u.round(Math.min(cpU, cpL), 3);
          var oor = vals.filter(function(v) { return v > usl || v < lsl; }).length;
          oorRate = u.round((oor / vals.length) * 100, 2);
        }
        return { name: name, n: vals.length, mean: u.round(mn, 4), sd: u.round(sd, 4), cpk: cpk, oorRate: oorRate, values: vals };
      });

      // カードタイトル更新
      var GROUP_LABELS = {
        operator: '作業者別',
        shift: '時間帯（シフト）別',
        temp: '設備温度帯別',
        toolwear: '工具カット数帯別',
        lot: 'ロット別'
      };
      var mtypeName = filters.measurementType || '全項目';
      var groupLabel = GROUP_LABELS[groupBy] || groupBy;
      var titleEl = document.getElementById('ia-factor-chart-title');
      if (titleEl) titleEl.textContent = mtypeName + ' ─ ' + groupLabel + '比較（n=' + records.length + '）';

      // 散布図描画（ジッター付き）
      renderFactorChart(groupNames, statsData, usl, lsl);

      // 統計テーブル
      renderFactorTable(statsData);

      // インサイト生成
      renderFactorInsights(statsData, usl, lsl);
    });
  }

  function groupRecords(records, groupBy) {
    var groups = {};
    records.forEach(function(r) {
      var key;
      switch (groupBy) {
        case 'operator':
          key = r.operatorName || '(不明)';
          break;
        case 'shift':
          var h = parseInt(r.time, 10);
          if (h >= 6 && h < 14) key = '日勤(6-14時)';
          else if (h >= 14 && h < 22) key = '夕勤(14-22時)';
          else key = '夜勤(22-6時)';
          break;
        case 'temp':
          if (r.equipmentTemp == null) { key = '(温度データなし)'; }
          else { var bin = Math.floor(r.equipmentTemp / 5) * 5; key = bin + '-' + (bin + 5) + '°C'; }
          break;
        case 'toolwear':
          if (r.toolCutCount == null) { key = '(データなし)'; }
          else { var wBin = Math.floor(r.toolCutCount / 500) * 500; key = wBin + '-' + (wBin + 500) + '回'; }
          break;
        case 'lot':
          key = r.lotNo || '(不明)';
          break;
        default:
          key = '全体';
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(r.measuredValue);
    });
    return groups;
  }

  function renderFactorChart(groupNames, statsData, usl, lsl) {
    var ctx = document.getElementById('chart-ia-factor');
    if (!ctx) return;
    if (factorChart) factorChart.destroy();

    // グループごとに別データセットを作成（凡例でグループ名を表示）
    var datasets = statsData.map(function(g, gIdx) {
      var color = u.CHART_COLORS[gIdx % u.CHART_COLORS.length];
      var points = g.values.map(function(v) {
        var jitter = (Math.random() - 0.5) * 0.6;
        return { x: gIdx + jitter, y: v };
      });
      return {
        label: g.name,
        data: points,
        backgroundColor: color + '99',
        borderColor: color,
        pointRadius: 3,
        pointHoverRadius: 5
      };
    });

    // 平均値マーカー
    var meanData = statsData.map(function(g, i) {
      return { x: i, y: g.mean };
    });

    datasets.push({
      label: '平均',
      data: meanData,
      backgroundColor: '#fff',
      borderColor: '#fff',
      pointRadius: 7,
      pointStyle: 'rectRot',
      pointHoverRadius: 9,
      showLine: false
    });

    // アノテーション
    var annotations = {};
    if (usl !== null) {
      annotations.uslLine = {
        type: 'line', yMin: usl, yMax: usl,
        borderColor: '#ef4444', borderWidth: 2, borderDash: [6, 4],
        label: { display: true, content: 'USL=' + usl, position: 'start', backgroundColor: 'rgba(239,68,68,0.8)', color: '#fff', font: { size: 10 } }
      };
    }
    if (lsl !== null) {
      annotations.lslLine = {
        type: 'line', yMin: lsl, yMax: lsl,
        borderColor: '#ef4444', borderWidth: 2, borderDash: [6, 4],
        label: { display: true, content: 'LSL=' + lsl, position: 'start', backgroundColor: 'rgba(239,68,68,0.8)', color: '#fff', font: { size: 10 } }
      };
    }

    factorChart = new Chart(ctx, {
      type: 'scatter',
      data: { datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#c9d1d9' } },
          tooltip: {
            backgroundColor: '#1a2233', titleColor: '#e6edf3',
            bodyColor: '#c9d1d9', borderColor: '#22304a', borderWidth: 1,
            callbacks: {
              title: function(items) {
                var idx = Math.round(items[0].parsed.x);
                return groupNames[idx] || '';
              }
            }
          },
          annotation: { annotations: annotations }
        },
        scales: {
          x: {
            type: 'linear',
            min: -0.5,
            max: groupNames.length - 0.5,
            grid: { color: 'rgba(34,48,74,0.5)' },
            ticks: {
              color: '#e6edf3',
              font: { size: 13, weight: '600' },
              stepSize: 1,
              callback: function(val) { return groupNames[val] || ''; }
            }
          },
          y: {
            grid: { color: 'rgba(34,48,74,0.5)' },
            ticks: { color: '#7d8590' }
          }
        }
      }
    });
  }

  function renderFactorTable(statsData) {
    var tbody = document.querySelector('#table-ia-factor tbody');
    if (!tbody) return;
    tbody.innerHTML = statsData.map(function(g) {
      var cpkClass = g.cpk === null ? '' : g.cpk >= 1.33 ? 'cpk-excellent' : g.cpk >= 1.0 ? 'cpk-good' : g.cpk >= 0.67 ? 'cpk-marginal' : 'cpk-poor';
      return '<tr>' +
        '<td>' + u.escHtml(g.name) + '</td>' +
        '<td>' + g.n + '</td>' +
        '<td>' + g.mean + '</td>' +
        '<td>' + g.sd + '</td>' +
        '<td class="' + cpkClass + '">' + (g.cpk !== null ? g.cpk : '-') + '</td>' +
        '<td>' + (g.oorRate !== undefined ? g.oorRate + '%' : '-') + '</td>' +
      '</tr>';
    }).join('');
  }

  function renderFactorInsights(statsData, usl, lsl) {
    var container = document.getElementById('ia-f-insights');
    var card = document.getElementById('ia-f-insights-card');
    if (!container || !card) return;

    var insights = [];

    // 最もばらつきの大きいグループ
    var maxSd = statsData.reduce(function(max, g) { return g.sd > max.sd ? g : max; }, statsData[0]);
    var minSd = statsData.reduce(function(min, g) { return g.sd < min.sd ? g : min; }, statsData[0]);
    if (statsData.length > 1 && maxSd.sd > minSd.sd * 1.5) {
      insights.push({
        type: 'warn',
        title: 'ばらつき差',
        body: '「' + maxSd.name + '」のσ=' + maxSd.sd + 'は最小「' + minSd.name + '」(σ=' + minSd.sd + ')の' + u.round(maxSd.sd / minSd.sd, 1) + '倍です。ばらつきの要因を調査してください。'
      });
    }

    // 平均が偏っているグループ
    if (usl !== null && lsl !== null) {
      var target = (usl + lsl) / 2;
      var tolerance = (usl - lsl) / 2;
      statsData.forEach(function(g) {
        var offset = Math.abs(g.mean - target);
        if (offset > tolerance * 0.3) {
          insights.push({
            type: 'caution',
            title: '平均偏り: ' + g.name,
            body: '平均=' + g.mean + 'で規格中心(' + u.round(target, 4) + ')から' + u.round(offset, 4) + '偏っています。'
          });
        }
      });
    }

    // Cpk最低グループ
    var cpkGroups = statsData.filter(function(g) { return g.cpk !== null; });
    if (cpkGroups.length > 1) {
      var minCpk = cpkGroups.reduce(function(min, g) { return g.cpk < min.cpk ? g : min; }, cpkGroups[0]);
      if (minCpk.cpk < 1.33) {
        insights.push({
          type: minCpk.cpk < 1.0 ? 'warn' : 'caution',
          title: '工程能力不足: ' + minCpk.name,
          body: 'Cpk=' + minCpk.cpk + 'で' + (minCpk.cpk < 1.0 ? '最低基準(1.0)を下回っています。' : '目標(1.33)を下回っています。') + '優先的に改善してください。'
        });
      }
    }

    if (!insights.length) {
      insights.push({ type: 'ok', title: '特記事項なし', body: '各グループ間に有意な差は検出されませんでした。' });
    }

    card.style.display = '';
    container.innerHTML = insights.map(function(ins) {
      return '<div class="ia-insight ia-insight-' + ins.type + '">' +
        '<div class="ia-insight-title">' + u.escHtml(ins.title) + '</div>' +
        '<div class="ia-insight-body">' + u.escHtml(ins.body) + '</div>' +
      '</div>';
    }).join('');
  }

  function renderFactorEmpty() {
    if (factorChart) factorChart.destroy();
    var ctx = document.getElementById('chart-ia-factor');
    if (ctx) {
      factorChart = new Chart(ctx, {
        type: 'scatter',
        data: { datasets: [{ data: [] }] },
        options: { responsive: true, maintainAspectRatio: false }
      });
    }
    var tbody = document.querySelector('#table-ia-factor tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><div class="empty-state-text">検査データがありません。デモ②を投入してください。</div></td></tr>';
    var card = document.getElementById('ia-f-insights-card');
    if (card) card.style.display = 'none';
  }

  // ========================================================
  // サブタブ2: 管理図異常検出 (Western Electric Rules)
  // ========================================================

  var RULES = [
    { id: 1, name: '3σ超え', desc: '1点が管理限界(3σ)を超えている' },
    { id: 2, name: '連続9点同側', desc: '連続9点がCLの同じ側にある（偏り/シフト）' },
    { id: 3, name: '連続6点増減', desc: '連続6点が単調増加または単調減少（トレンド）' },
    { id: 4, name: '交互増減14点', desc: '連続14点が交互に増減（周期的変動）' },
    { id: 5, name: '2σ超え(3点中2点)', desc: '3点中2点が2σを超えている（同側、偏り傾向）' },
    { id: 6, name: '1σ超え(5点中4点)', desc: '5点中4点が1σを超えている（同側、偏り傾向）' },
    { id: 7, name: '1σ以内15点', desc: '連続15点がすべて1σ以内（層化/混合工程）' },
    { id: 8, name: '1σ超え8点(両側)', desc: '連続8点がすべて1σを超えている（散らばり拡大）' }
  ];

  function drawWestern() {
    var filters = getFilters('ia-w');
    var chartType = document.getElementById('ia-w-type').value;

    data.queryInspections(filters).then(function(records) {
      if (!records.length) { renderWesternEmpty(); return; }

      records.sort(function(a, b) {
        return a.date < b.date ? -1 : a.date > b.date ? 1 :
               a.time < b.time ? -1 : a.time > b.time ? 1 : 0;
      });

      var values, labels, cl, sigma;

      if (chartType === 'individual') {
        // 個別値管理図
        values = records.map(function(r) { return r.measuredValue; });
        labels = records.map(function(r) { return u.shortDate(r.date) + ' ' + r.time + ' #' + r.sampleNo; });
        cl = u.mean(values);

        // 移動範囲法でσ推定
        var mrs = [];
        for (var i = 1; i < values.length; i++) {
          mrs.push(Math.abs(values[i] - values[i - 1]));
        }
        sigma = u.mean(mrs) / 1.128;
      } else {
        // X̄管理図
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

        values = [];
        labels = [];
        var ranges = [];
        sgOrder.forEach(function(key) {
          var sg = sgMap[key];
          if (sg.values.length < 2) return;
          values.push(u.mean(sg.values));
          ranges.push(Math.max.apply(null, sg.values) - Math.min.apply(null, sg.values));
          labels.push(u.shortDate(sg.date) + ' ' + sg.time);
        });

        if (!values.length) { renderWesternEmpty(); return; }

        cl = u.mean(values);
        var n = records.length / sgOrder.length;
        n = Math.round(n);
        if (n < 2) n = 2;
        if (n > 10) n = 10;
        sigma = u.mean(ranges) / (A2[n] ? (A2[n] * Math.sqrt(n)) : 1);
        // 実際にはX̄管理図のσは R̄/d2 で推定
        // A2 = 3/(d2*√n) → σ_xbar = R̄ * A2 / 3 * √n ... 簡略化してσ直接使用
        sigma = u.stddev(values);
      }

      if (!values.length || sigma === 0) { renderWesternEmpty(); return; }

      var ucl = cl + 3 * sigma;
      var lcl = cl - 3 * sigma;

      // Western Electric Rules検出
      var violations = detectViolations(values, cl, sigma);

      // 描画
      renderWesternChart(labels, values, cl, sigma, ucl, lcl, violations);
      renderWesternSummary(violations, values.length);
      renderWesternTable(violations, labels, values);
    });
  }

  function detectViolations(values, cl, sigma) {
    var violations = [];
    var n = values.length;

    for (var i = 0; i < n; i++) {
      var v = values[i];

      // Rule 1: 1点が3σ超え
      if (v > cl + 3 * sigma || v < cl - 3 * sigma) {
        violations.push({ idx: i, rule: 1 });
      }

      // Rule 2: 連続9点がCLの同側
      if (i >= 8) {
        var allAbove = true, allBelow = true;
        for (var j = i - 8; j <= i; j++) {
          if (values[j] <= cl) allAbove = false;
          if (values[j] >= cl) allBelow = false;
        }
        if (allAbove || allBelow) {
          violations.push({ idx: i, rule: 2 });
        }
      }

      // Rule 3: 連続6点が単調増加/減少
      if (i >= 5) {
        var increasing = true, decreasing = true;
        for (var j = i - 4; j <= i; j++) {
          if (values[j] <= values[j - 1]) increasing = false;
          if (values[j] >= values[j - 1]) decreasing = false;
        }
        if (increasing || decreasing) {
          violations.push({ idx: i, rule: 3 });
        }
      }

      // Rule 4: 連続14点が交互に増減
      if (i >= 13) {
        var alternating = true;
        for (var j = i - 12; j <= i; j++) {
          var prev = values[j] - values[j - 1];
          var curr = values[j + 1 !== undefined ? j : j] - values[j - 1];
          if (j > i - 12) {
            var d1 = values[j - 1] - values[j - 2];
            var d2 = values[j] - values[j - 1];
            if ((d1 > 0 && d2 > 0) || (d1 < 0 && d2 < 0)) { alternating = false; break; }
          }
        }
        if (alternating) {
          violations.push({ idx: i, rule: 4 });
        }
      }

      // Rule 5: 3点中2点が2σ超え（同側）
      if (i >= 2) {
        var above2 = 0, below2 = 0;
        for (var j = i - 2; j <= i; j++) {
          if (values[j] > cl + 2 * sigma) above2++;
          if (values[j] < cl - 2 * sigma) below2++;
        }
        if (above2 >= 2 || below2 >= 2) {
          violations.push({ idx: i, rule: 5 });
        }
      }

      // Rule 6: 5点中4点が1σ超え（同側）
      if (i >= 4) {
        var above1 = 0, below1 = 0;
        for (var j = i - 4; j <= i; j++) {
          if (values[j] > cl + sigma) above1++;
          if (values[j] < cl - sigma) below1++;
        }
        if (above1 >= 4 || below1 >= 4) {
          violations.push({ idx: i, rule: 6 });
        }
      }

      // Rule 7: 連続15点が1σ以内
      if (i >= 14) {
        var allWithin = true;
        for (var j = i - 14; j <= i; j++) {
          if (Math.abs(values[j] - cl) > sigma) { allWithin = false; break; }
        }
        if (allWithin) {
          violations.push({ idx: i, rule: 7 });
        }
      }

      // Rule 8: 連続8点が1σ超え（両側）
      if (i >= 7) {
        var allBeyond1 = true;
        for (var j = i - 7; j <= i; j++) {
          if (Math.abs(values[j] - cl) <= sigma) { allBeyond1 = false; break; }
        }
        if (allBeyond1) {
          violations.push({ idx: i, rule: 8 });
        }
      }
    }

    // 重複除去（同じidxで同じruleは1つだけ）
    var seen = {};
    return violations.filter(function(v) {
      var key = v.idx + '_' + v.rule;
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function renderWesternChart(labels, values, cl, sigma, ucl, lcl, violations) {
    var ctx = document.getElementById('chart-ia-western');
    if (!ctx) return;
    if (westernChart) westernChart.destroy();

    // 違反インデックスセット
    var violationIdxSet = {};
    var violationRuleMap = {};
    violations.forEach(function(v) {
      violationIdxSet[v.idx] = true;
      if (!violationRuleMap[v.idx]) violationRuleMap[v.idx] = [];
      violationRuleMap[v.idx].push(v.rule);
    });

    var pointColors = values.map(function(v, i) {
      return violationIdxSet[i] ? '#ef4444' : '#4c8bf5';
    });
    var pointRadii = values.map(function(v, i) {
      return violationIdxSet[i] ? 7 : 3;
    });

    var annotations = {
      uclLine: {
        type: 'line', yMin: ucl, yMax: ucl,
        borderColor: '#ef4444', borderWidth: 2, borderDash: [6, 4],
        label: { display: true, content: 'UCL=' + u.round(ucl, 4), position: 'start', backgroundColor: 'rgba(239,68,68,0.8)', color: '#fff', font: { size: 10 } }
      },
      clLine: {
        type: 'line', yMin: cl, yMax: cl,
        borderColor: '#34d399', borderWidth: 2,
        label: { display: true, content: 'CL=' + u.round(cl, 4), position: 'start', backgroundColor: 'rgba(52,211,153,0.8)', color: '#fff', font: { size: 10 } }
      },
      lclLine: {
        type: 'line', yMin: lcl, yMax: lcl,
        borderColor: '#ef4444', borderWidth: 2, borderDash: [6, 4],
        label: { display: true, content: 'LCL=' + u.round(lcl, 4), position: 'start', backgroundColor: 'rgba(239,68,68,0.8)', color: '#fff', font: { size: 10 } }
      },
      // ±1σゾーン
      zone1Upper: {
        type: 'box', yMin: cl + sigma, yMax: cl + 2 * sigma,
        backgroundColor: 'rgba(76, 139, 245, 0.04)', borderWidth: 0
      },
      zone1Lower: {
        type: 'box', yMin: cl - 2 * sigma, yMax: cl - sigma,
        backgroundColor: 'rgba(76, 139, 245, 0.04)', borderWidth: 0
      },
      // ±2σゾーン
      zone2Upper: {
        type: 'box', yMin: cl + 2 * sigma, yMax: cl + 3 * sigma,
        backgroundColor: 'rgba(245, 158, 11, 0.06)', borderWidth: 0
      },
      zone2Lower: {
        type: 'box', yMin: cl - 3 * sigma, yMax: cl - 2 * sigma,
        backgroundColor: 'rgba(245, 158, 11, 0.06)', borderWidth: 0
      },
      // σ線
      plus1s: {
        type: 'line', yMin: cl + sigma, yMax: cl + sigma,
        borderColor: 'rgba(76,139,245,0.3)', borderWidth: 1, borderDash: [3, 3]
      },
      minus1s: {
        type: 'line', yMin: cl - sigma, yMax: cl - sigma,
        borderColor: 'rgba(76,139,245,0.3)', borderWidth: 1, borderDash: [3, 3]
      },
      plus2s: {
        type: 'line', yMin: cl + 2 * sigma, yMax: cl + 2 * sigma,
        borderColor: 'rgba(245,158,11,0.4)', borderWidth: 1, borderDash: [3, 3]
      },
      minus2s: {
        type: 'line', yMin: cl - 2 * sigma, yMax: cl - 2 * sigma,
        borderColor: 'rgba(245,158,11,0.4)', borderWidth: 1, borderDash: [3, 3]
      }
    };

    westernChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: '測定値',
          data: values,
          borderColor: '#4c8bf5',
          backgroundColor: 'transparent',
          pointBackgroundColor: pointColors,
          pointRadius: pointRadii,
          pointHoverRadius: 8,
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
            bodyColor: '#c9d1d9', borderColor: '#22304a', borderWidth: 1,
            callbacks: {
              afterBody: function(items) {
                var idx = items[0].dataIndex;
                if (violationRuleMap[idx]) {
                  return 'ルール違反: #' + violationRuleMap[idx].join(', #');
                }
                return '';
              }
            }
          },
          annotation: { annotations: annotations }
        },
        scales: {
          x: {
            grid: { color: 'rgba(34,48,74,0.5)' },
            ticks: { color: '#7d8590', font: { size: 10 }, maxRotation: 45, maxTicksLimit: 30 }
          },
          y: {
            grid: { color: 'rgba(34,48,74,0.5)' },
            ticks: { color: '#7d8590' }
          }
        }
      }
    });
  }

  function renderWesternSummary(violations, totalPoints) {
    var card = document.getElementById('ia-w-summary-card');
    var container = document.getElementById('ia-w-summary');
    if (!card || !container) return;

    card.style.display = '';

    // ルール別集計
    var ruleCounts = {};
    violations.forEach(function(v) {
      ruleCounts[v.rule] = (ruleCounts[v.rule] || 0) + 1;
    });
    var violatedPoints = {};
    violations.forEach(function(v) { violatedPoints[v.idx] = true; });
    var uniqueViolations = Object.keys(violatedPoints).length;

    var badgeClass, badgeText;
    if (violations.length === 0) {
      badgeClass = 'ia-summary-badge-ok';
      badgeText = '工程安定';
    } else if (uniqueViolations <= 3 && !ruleCounts[1]) {
      badgeClass = 'ia-summary-badge-caution';
      badgeText = '要注意';
    } else {
      badgeClass = 'ia-summary-badge-alert';
      badgeText = '異常あり';
    }

    var ruleTexts = Object.keys(ruleCounts).map(function(ruleId) {
      var rule = RULES.find(function(r) { return r.id === parseInt(ruleId); });
      return 'ルール#' + ruleId + '(' + (rule ? rule.name : '') + '): ' + ruleCounts[ruleId] + '点';
    });

    container.innerHTML =
      '<span class="ia-summary-badge ' + badgeClass + '">' + badgeText + '</span>' +
      '<span class="ia-summary-text">' +
        totalPoints + '点中 ' + uniqueViolations + '点で異常検出 (' + violations.length + '件の違反)' +
        (ruleTexts.length ? '<br>' + ruleTexts.join('、') : '') +
      '</span>';
  }

  function renderWesternTable(violations, labels, values) {
    var card = document.getElementById('ia-w-violations-card');
    var tbody = document.querySelector('#table-ia-violations tbody');
    if (!card || !tbody) return;

    if (!violations.length) {
      card.style.display = 'none';
      return;
    }

    card.style.display = '';
    tbody.innerHTML = violations.map(function(v, idx) {
      var rule = RULES.find(function(r) { return r.id === v.rule; });
      return '<tr>' +
        '<td>' + (idx + 1) + '</td>' +
        '<td>#' + v.rule + ' ' + u.escHtml(rule ? rule.name : '') + '</td>' +
        '<td>' + u.escHtml(labels[v.idx] || '') + '</td>' +
        '<td>' + u.round(values[v.idx], 4) + '</td>' +
        '<td>' + u.escHtml(rule ? rule.desc : '') + '</td>' +
      '</tr>';
    }).join('');
  }

  function renderWesternEmpty() {
    if (westernChart) westernChart.destroy();
    var ctx = document.getElementById('chart-ia-western');
    if (ctx) {
      westernChart = new Chart(ctx, {
        type: 'line',
        data: { labels: ['データなし'], datasets: [{ data: [0] }] },
        options: { responsive: true, maintainAspectRatio: false }
      });
    }
    var card = document.getElementById('ia-w-summary-card');
    if (card) card.style.display = 'none';
    var vCard = document.getElementById('ia-w-violations-card');
    if (vCard) vCard.style.display = 'none';
  }

  // ========================================================
  // サブタブ3: Cpk推移
  // ========================================================

  function drawCpkTrend() {
    var filters = getFilters('ia-c');
    var unit = document.getElementById('ia-c-unit').value;

    data.queryInspections(filters).then(function(records) {
      if (!records.length) { renderCpkEmpty(); return; }

      // USL/LSL取得
      var usl = null, lsl = null;
      for (var i = 0; i < records.length; i++) {
        if (records[i].usl != null) { usl = records[i].usl; lsl = records[i].lsl; break; }
      }
      if (usl === null || lsl === null) { renderCpkEmpty(); return; }

      records.sort(function(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });

      // 期間ごとにグループ化
      var periodMap = {};
      var periodOrder = [];

      records.forEach(function(r) {
        var key;
        if (unit === 'week') {
          var d = new Date(r.date);
          var dayOfWeek = d.getDay();
          var mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
          var monday = new Date(d);
          monday.setDate(d.getDate() + mondayOffset);
          key = monday.toISOString().slice(0, 10);
        } else {
          key = r.date;
        }

        if (!periodMap[key]) {
          periodMap[key] = [];
          periodOrder.push(key);
        }
        periodMap[key].push(r.measuredValue);
      });

      // 各期間のCpk計算
      var cpkData = [];
      periodOrder.forEach(function(key) {
        var vals = periodMap[key];
        if (vals.length < 2) return;
        var mn = u.mean(vals);
        var sd = u.stddev(vals);
        var cp = sd > 0 ? u.round((usl - lsl) / (6 * sd), 3) : null;
        var cpk = null;
        if (sd > 0) {
          var cpU = (usl - mn) / (3 * sd);
          var cpL = (mn - lsl) / (3 * sd);
          cpk = u.round(Math.min(cpU, cpL), 3);
        }
        var label = unit === 'week' ? u.shortDate(key) + '週' : u.shortDate(key);
        cpkData.push({
          key: key,
          label: label,
          n: vals.length,
          mean: u.round(mn, 4),
          sd: u.round(sd, 4),
          cp: cp,
          cpk: cpk
        });
      });

      if (!cpkData.length) { renderCpkEmpty(); return; }

      renderCpkChart(cpkData);
      renderCpkTable(cpkData);
      renderCpkSummary(cpkData);
    });
  }

  function renderCpkChart(cpkData) {
    var ctx = document.getElementById('chart-ia-cpk');
    if (!ctx) return;
    if (cpkChart) cpkChart.destroy();

    var labels = cpkData.map(function(d) { return d.label; });
    var cpkValues = cpkData.map(function(d) { return d.cpk; });

    var pointColors = cpkValues.map(function(v) {
      if (v === null) return '#7d8590';
      if (v >= 1.33) return '#34d399';
      if (v >= 1.0) return '#fbbf24';
      return '#ef4444';
    });

    cpkChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Cpk',
          data: cpkValues,
          borderColor: '#4c8bf5',
          backgroundColor: 'rgba(76, 139, 245, 0.1)',
          fill: true,
          pointBackgroundColor: pointColors,
          pointRadius: 5,
          pointHoverRadius: 7,
          tension: 0.2,
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
              target: {
                type: 'line', yMin: 1.33, yMax: 1.33,
                borderColor: '#34d399', borderWidth: 2, borderDash: [6, 4],
                label: { display: true, content: '目標 Cpk=1.33', position: 'end', backgroundColor: 'rgba(52,211,153,0.8)', color: '#fff', font: { size: 10 } }
              },
              minimum: {
                type: 'line', yMin: 1.0, yMax: 1.0,
                borderColor: '#fbbf24', borderWidth: 2, borderDash: [6, 4],
                label: { display: true, content: '最低限 Cpk=1.0', position: 'end', backgroundColor: 'rgba(251,191,36,0.8)', color: '#fff', font: { size: 10 } }
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
            beginAtZero: true,
            grid: { color: 'rgba(34,48,74,0.5)' },
            ticks: { color: '#7d8590' }
          }
        }
      }
    });
  }

  function renderCpkTable(cpkData) {
    var tbody = document.querySelector('#table-ia-cpk tbody');
    if (!tbody) return;

    tbody.innerHTML = cpkData.map(function(d) {
      var judgeText, judgeClass;
      if (d.cpk === null) { judgeText = '-'; judgeClass = ''; }
      else if (d.cpk >= 1.67) { judgeText = '優秀'; judgeClass = 'cpk-excellent'; }
      else if (d.cpk >= 1.33) { judgeText = '良好'; judgeClass = 'cpk-good'; }
      else if (d.cpk >= 1.0) { judgeText = '要改善'; judgeClass = 'cpk-marginal'; }
      else { judgeText = '能力不足'; judgeClass = 'cpk-poor'; }

      return '<tr>' +
        '<td>' + u.escHtml(d.label) + '</td>' +
        '<td>' + d.n + '</td>' +
        '<td>' + d.mean + '</td>' +
        '<td>' + d.sd + '</td>' +
        '<td>' + (d.cp !== null ? d.cp : '-') + '</td>' +
        '<td class="' + judgeClass + '">' + (d.cpk !== null ? d.cpk : '-') + '</td>' +
        '<td class="' + judgeClass + '">' + judgeText + '</td>' +
      '</tr>';
    }).join('');
  }

  function renderCpkSummary(cpkData) {
    var card = document.getElementById('ia-c-summary-card');
    var container = document.getElementById('ia-c-summary');
    if (!card || !container) return;

    card.style.display = '';

    var cpkValues = cpkData.map(function(d) { return d.cpk; }).filter(function(v) { return v !== null; });
    if (!cpkValues.length) {
      card.style.display = 'none';
      return;
    }

    var avgCpk = u.round(u.mean(cpkValues), 3);
    var minCpk = u.round(Math.min.apply(null, cpkValues), 3);
    var maxCpk = u.round(Math.max.apply(null, cpkValues), 3);

    var badgeClass, badgeText;
    if (avgCpk >= 1.67) { badgeClass = 'ia-summary-badge-ok'; badgeText = '優秀'; }
    else if (avgCpk >= 1.33) { badgeClass = 'ia-summary-badge-ok'; badgeText = '良好'; }
    else if (avgCpk >= 1.0) { badgeClass = 'ia-summary-badge-caution'; badgeText = '要改善'; }
    else { badgeClass = 'ia-summary-badge-alert'; badgeText = '能力不足'; }

    // トレンド分析
    var trendText = '';
    if (cpkValues.length >= 3) {
      var first = u.mean(cpkValues.slice(0, Math.floor(cpkValues.length / 3)));
      var last = u.mean(cpkValues.slice(-Math.floor(cpkValues.length / 3)));
      var diff = last - first;
      if (diff > 0.1) trendText = '改善傾向が見られます。';
      else if (diff < -0.1) trendText = '悪化傾向が見られます。注意が必要です。';
      else trendText = '安定しています。';
    }

    container.innerHTML =
      '<span class="ia-summary-badge ' + badgeClass + '">' + badgeText + '</span>' +
      '<span class="ia-summary-text">' +
        '全期間平均Cpk: ' + avgCpk + '（最小: ' + minCpk + ' / 最大: ' + maxCpk + '）' +
        (trendText ? '<br>' + trendText : '') +
      '</span>';
  }

  function renderCpkEmpty() {
    if (cpkChart) cpkChart.destroy();
    var ctx = document.getElementById('chart-ia-cpk');
    if (ctx) {
      cpkChart = new Chart(ctx, {
        type: 'line',
        data: { labels: ['データなし'], datasets: [{ data: [0] }] },
        options: { responsive: true, maintainAspectRatio: false }
      });
    }
    var tbody = document.querySelector('#table-ia-cpk tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><div class="empty-state-text">検査データがありません。デモ②を投入してください。</div></td></tr>';
    var card = document.getElementById('ia-c-summary-card');
    if (card) card.style.display = 'none';
  }

  // ========================================================
  // 初期化
  // ========================================================

  function init() {
    initSubTabs();
    populateInspectionTypes();

    document.getElementById('btn-ia-f-draw').addEventListener('click', drawFactor);
    document.getElementById('btn-ia-w-draw').addEventListener('click', drawWestern);
    document.getElementById('btn-ia-c-draw').addEventListener('click', drawCpkTrend);
  }

  app.inspectionAnalysis = {
    init: init,
    populateInspectionTypes: populateInspectionTypes
  };

})(window.QualityApp);
