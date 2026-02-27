/**
 * 品質管理アプリ - 層別分析（クロス集計ヒートマップ + 自動分析サマリー）
 */
window.QualityApp = window.QualityApp || {};

(function(app) {
  "use strict";

  var data = app.data;
  var u = app.utils;

  // ===== 軸定義 =====

  var AXIS_DEFS = {
    process:    { label: '工程',       masterTable: 'processes',   nameField: 'name',   recordField: 'processId' },
    product:    { label: '製品',       masterTable: 'products',    nameField: 'name',   recordField: 'productId' },
    defectType: { label: '不良種別',   masterTable: 'defectTypes', nameField: 'name',   recordField: 'defectTypeId' },
    rootCause:  { label: '原因(4M)',   masterTable: 'rootCauses',  nameField: 'name',   recordField: 'rootCauseId' },
    severity:   { label: '重大度',     masterTable: null,          values: ['重大', '重度', '軽度', '軽微'], recordField: 'severity' },
    operator:   { label: '作業者',     masterTable: null,          recordField: 'operatorName' },
    month:      { label: '月別',       masterTable: null,          recordField: '_month' }
  };

  // ===== 初期化 =====

  function init() {
    document.getElementById('btn-strat-draw').addEventListener('click', draw);

    // デフォルト期間（過去6ヶ月）
    document.getElementById('strat-date-from').value = u.daysAgo(180);
    document.getElementById('strat-date-to').value = u.today();
  }

  // ===== メイン描画 =====

  function draw() {
    var dateFrom = document.getElementById('strat-date-from').value;
    var dateTo   = document.getElementById('strat-date-to').value;
    var rowAxis  = document.getElementById('strat-row-axis').value;
    var colAxis  = document.getElementById('strat-col-axis').value;
    var metric   = document.getElementById('strat-metric').value;

    if (rowAxis === colAxis) {
      alert('行軸と列軸は異なる項目を選択してください。');
      return;
    }

    var filters = {};
    if (dateFrom) filters.dateFrom = dateFrom;
    if (dateTo) filters.dateTo = dateTo;

    Promise.all([
      data.queryDefects(filters),
      data.loadAllMasters()
    ]).then(function(results) {
      var records = results[0];
      var masters = results[1];

      if (!records.length) {
        showEmpty();
        return;
      }

      // 月別フィールドを追加
      records.forEach(function(r) {
        r._month = r.date ? r.date.slice(0, 7) : '不明';
      });

      var crossData = buildCrossTable(records, masters, rowAxis, colAxis, metric);
      renderHeatmap(crossData, rowAxis, colAxis, metric);
      renderWorstTable(crossData);
      renderSummary(crossData, records, masters, rowAxis, colAxis, metric);
    });
  }

  // ===== クロス集計テーブルの構築 =====

  function buildCrossTable(records, masters, rowAxis, colAxis, metric) {
    var rowDef = AXIS_DEFS[rowAxis];
    var colDef = AXIS_DEFS[colAxis];

    // 行ラベル・列ラベル取得
    var rowLabels = getLabels(records, masters, rowAxis);
    var colLabels = getLabels(records, masters, colAxis);

    // クロス集計マトリクス
    var matrix = {};
    var rowTotals = {};
    var colTotals = {};
    var grandTotal = 0;

    rowLabels.forEach(function(r) {
      matrix[r] = {};
      rowTotals[r] = 0;
      colLabels.forEach(function(c) { matrix[r][c] = 0; });
    });
    colLabels.forEach(function(c) { colTotals[c] = 0; });

    records.forEach(function(rec) {
      var rowVal = getRecordLabel(rec, masters, rowAxis);
      var colVal = getRecordLabel(rec, masters, colAxis);
      if (!rowVal || !colVal) return;

      var val = (metric === 'quantity') ? (rec.quantity || 1) : 1;

      if (matrix[rowVal] !== undefined && matrix[rowVal][colVal] !== undefined) {
        matrix[rowVal][colVal] += val;
        rowTotals[rowVal] += val;
        colTotals[colVal] += val;
        grandTotal += val;
      }
    });

    // 最大値(ヒートマップ色付け用)
    var maxVal = 0;
    rowLabels.forEach(function(r) {
      colLabels.forEach(function(c) {
        if (matrix[r][c] > maxVal) maxVal = matrix[r][c];
      });
    });

    return {
      rowLabels: rowLabels,
      colLabels: colLabels,
      matrix: matrix,
      rowTotals: rowTotals,
      colTotals: colTotals,
      grandTotal: grandTotal,
      maxVal: maxVal
    };
  }

  /** 軸のラベル一覧を取得 */
  function getLabels(records, masters, axisKey) {
    var def = AXIS_DEFS[axisKey];

    // 固定値(重大度)
    if (def.values) return def.values.slice();

    // マスタ参照
    if (def.masterTable) {
      var map = masters[def.masterTable];
      if (map) {
        var labels = [];
        Object.keys(map).forEach(function(id) {
          labels.push(map[id][def.nameField]);
        });
        if (labels.length) return labels.sort();
      }
    }

    // レコードからユニーク値抽出
    var set = {};
    records.forEach(function(r) {
      var val = r[def.recordField];
      if (val) set[val] = true;
    });
    var keys = Object.keys(set);
    if (axisKey === 'month') keys.sort();
    else keys.sort();
    return keys;
  }

  /** レコードから軸ラベルを取得 */
  function getRecordLabel(rec, masters, axisKey) {
    var def = AXIS_DEFS[axisKey];

    if (def.masterTable) {
      var map = masters[def.masterTable];
      var id = rec[def.recordField];
      if (!id || !map || !map[id]) return null;
      return map[id][def.nameField];
    }

    return rec[def.recordField] || null;
  }

  // ===== ヒートマップ描画 =====

  function renderHeatmap(crossData, rowAxis, colAxis, metric) {
    var container = document.getElementById('strat-heatmap-container');
    var rowDef = AXIS_DEFS[rowAxis];
    var colDef = AXIS_DEFS[colAxis];

    var html = '<div class="strat-heatmap-scroll"><table class="strat-heatmap">';

    // ヘッダー行
    html += '<thead><tr><th class="strat-corner">' + u.escHtml(rowDef.label) + ' \\ ' + u.escHtml(colDef.label) + '</th>';
    crossData.colLabels.forEach(function(c) {
      html += '<th class="strat-col-header">' + u.escHtml(c) + '</th>';
    });
    html += '<th class="strat-total-header">合計</th></tr></thead>';

    // データ行
    html += '<tbody>';
    crossData.rowLabels.forEach(function(r) {
      html += '<tr><th class="strat-row-header">' + u.escHtml(r) + '</th>';
      crossData.colLabels.forEach(function(c) {
        var val = crossData.matrix[r][c];
        var intensity = crossData.maxVal > 0 ? val / crossData.maxVal : 0;
        var bgColor = heatColor(intensity);
        var textColor = intensity > 0.5 ? '#fff' : 'var(--text)';
        html += '<td class="strat-cell" style="background:' + bgColor + ';color:' + textColor + '">';
        html += val > 0 ? val : '<span class="strat-zero">-</span>';
        html += '</td>';
      });
      html += '<td class="strat-row-total">' + crossData.rowTotals[r] + '</td>';
      html += '</tr>';
    });

    // 列合計行
    html += '<tr class="strat-total-row"><th class="strat-row-header">合計</th>';
    crossData.colLabels.forEach(function(c) {
      html += '<td class="strat-col-total">' + crossData.colTotals[c] + '</td>';
    });
    html += '<td class="strat-grand-total">' + crossData.grandTotal + '</td>';
    html += '</tr></tbody></table></div>';

    // 凡例
    html += '<div class="strat-legend">';
    html += '<span class="strat-legend-label">少</span>';
    for (var i = 0; i <= 5; i++) {
      html += '<span class="strat-legend-swatch" style="background:' + heatColor(i / 5) + '"></span>';
    }
    html += '<span class="strat-legend-label">多</span>';
    html += '</div>';

    container.innerHTML = html;
  }

  /** ヒートマップ色(0〜1の強度 → rgba) */
  function heatColor(intensity) {
    if (intensity === 0) return 'transparent';
    // 低:青 → 中:黄 → 高:赤 のグラデーション
    var r, g, b;
    if (intensity <= 0.5) {
      var t = intensity * 2; // 0〜1
      r = Math.round(30 + t * 220);
      g = Math.round(80 + t * 140);
      b = Math.round(200 - t * 150);
    } else {
      var t2 = (intensity - 0.5) * 2; // 0〜1
      r = Math.round(250);
      g = Math.round(220 - t2 * 180);
      b = Math.round(50 - t2 * 50);
    }
    var alpha = 0.3 + intensity * 0.6;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + u.round(alpha, 2) + ')';
  }

  // ===== ワースト組み合わせテーブル =====

  function renderWorstTable(crossData) {
    var tbody = document.querySelector('#table-strat-worst tbody');
    var pairs = [];

    crossData.rowLabels.forEach(function(r) {
      crossData.colLabels.forEach(function(c) {
        var val = crossData.matrix[r][c];
        if (val > 0) pairs.push({ row: r, col: c, value: val });
      });
    });

    pairs.sort(function(a, b) { return b.value - a.value; });
    var top10 = pairs.slice(0, 10);
    var cumPct = 0;

    var html = '';
    top10.forEach(function(p, i) {
      var pct = crossData.grandTotal > 0 ? u.round(p.value / crossData.grandTotal * 100, 1) : 0;
      cumPct += pct;
      html += '<tr>';
      html += '<td>' + (i + 1) + '</td>';
      html += '<td>' + u.escHtml(p.row) + '</td>';
      html += '<td>' + u.escHtml(p.col) + '</td>';
      html += '<td>' + p.value + '</td>';
      html += '<td>' + pct + '%</td>';
      html += '<td>' + u.round(cumPct, 1) + '%</td>';
      html += '</tr>';
    });

    tbody.innerHTML = html || '<tr><td colspan="6" class="empty-state-text">データなし</td></tr>';
  }

  // ===== 自動分析サマリー =====

  function renderSummary(crossData, records, masters, rowAxis, colAxis, metric) {
    var container = document.getElementById('strat-summary');
    var insights = [];
    var rowDef = AXIS_DEFS[rowAxis];
    var colDef = AXIS_DEFS[colAxis];
    var metricLabel = metric === 'quantity' ? '不良数' : '件数';

    // 1. 全体概要
    insights.push({
      type: 'overview',
      icon: '📋',
      title: '全体概要',
      text: '分析対象: ' + records.length + '件 | ' + rowDef.label + ': ' + crossData.rowLabels.length + '種 x ' + colDef.label + ': ' + crossData.colLabels.length + '種 | 合計' + metricLabel + ': ' + crossData.grandTotal
    });

    // 2. 最多セルの特定
    var worst = findWorstCells(crossData, 3);
    if (worst.length) {
      var worstTexts = worst.map(function(w, i) {
        var pct = crossData.grandTotal > 0 ? u.round(w.value / crossData.grandTotal * 100, 1) : 0;
        return (i + 1) + '位: 「' + w.row + '」x「' + w.col + '」= ' + w.value + metricLabel + '(' + pct + '%)';
      });
      insights.push({
        type: 'hotspot',
        icon: '🔥',
        title: '重点改善ポイント',
        text: worstTexts.join('\n')
      });
    }

    // 3. 集中度分析（上位20%が全体の何%を占めるか）
    var concentrationResult = analyzeConcentration(crossData);
    if (concentrationResult) {
      insights.push({
        type: 'concentration',
        icon: '🎯',
        title: '集中度',
        text: concentrationResult
      });
    }

    // 4. 行軸で最も問題のある項目
    var rowWorst = findWorstAxis(crossData.rowLabels, crossData.rowTotals, crossData.grandTotal);
    if (rowWorst) {
      insights.push({
        type: 'row-analysis',
        icon: '📊',
        title: rowDef.label + ' 分析',
        text: rowWorst
      });
    }

    // 5. 列軸で最も問題のある項目
    var colWorst = findWorstAxis(crossData.colLabels, crossData.colTotals, crossData.grandTotal);
    if (colWorst) {
      insights.push({
        type: 'col-analysis',
        icon: '📈',
        title: colDef.label + ' 分析',
        text: colWorst
      });
    }

    // 6. 偏り度合い（カイ二乗的な判定）
    var biasResult = analyzeBias(crossData);
    if (biasResult) {
      insights.push({
        type: 'bias',
        icon: '⚖️',
        title: '偏り評価',
        text: biasResult
      });
    }

    // 7. 改善提案
    var suggestion = generateSuggestion(crossData, rowAxis, colAxis, worst);
    if (suggestion) {
      insights.push({
        type: 'suggestion',
        icon: '💡',
        title: '改善の方向性',
        text: suggestion
      });
    }

    // HTML描画
    var html = '<div class="strat-insights">';
    insights.forEach(function(ins) {
      html += '<div class="strat-insight strat-insight-' + ins.type + '">';
      html += '<div class="strat-insight-header">';
      html += '<span class="strat-insight-icon">' + ins.icon + '</span>';
      html += '<span class="strat-insight-title">' + u.escHtml(ins.title) + '</span>';
      html += '</div>';
      html += '<div class="strat-insight-body">' + u.escHtml(ins.text).replace(/\n/g, '<br>') + '</div>';
      html += '</div>';
    });
    html += '</div>';

    container.innerHTML = html;
  }

  /** ワーストN組み合わせを特定 */
  function findWorstCells(crossData, n) {
    var pairs = [];
    crossData.rowLabels.forEach(function(r) {
      crossData.colLabels.forEach(function(c) {
        var val = crossData.matrix[r][c];
        if (val > 0) pairs.push({ row: r, col: c, value: val });
      });
    });
    pairs.sort(function(a, b) { return b.value - a.value; });
    return pairs.slice(0, n);
  }

  /** 集中度分析 */
  function analyzeConcentration(crossData) {
    var pairs = [];
    crossData.rowLabels.forEach(function(r) {
      crossData.colLabels.forEach(function(c) {
        var val = crossData.matrix[r][c];
        if (val > 0) pairs.push(val);
      });
    });
    if (!pairs.length) return null;

    pairs.sort(function(a, b) { return b - a; });
    var totalCells = pairs.length;
    var top20Count = Math.max(1, Math.ceil(totalCells * 0.2));
    var top20Sum = 0;
    for (var i = 0; i < top20Count; i++) top20Sum += pairs[i];
    var top20Pct = crossData.grandTotal > 0 ? u.round(top20Sum / crossData.grandTotal * 100, 1) : 0;

    var interpretation;
    if (top20Pct >= 70) {
      interpretation = '強い集中傾向 → 少数の組み合わせに不良が集中しており、ピンポイントの対策が効果的です。';
    } else if (top20Pct >= 50) {
      interpretation = 'やや集中傾向 → ある程度の偏りがあり、上位項目から優先的に対策することで効率的に改善できます。';
    } else {
      interpretation = '分散傾向 → 不良が広く分散しています。個別対策より、共通する原因の特定や品質管理体制全体の見直しが必要です。';
    }

    return '上位' + top20Count + '組(全' + totalCells + '組の上位20%)が全体の' + top20Pct + '%を占めます。\n' + interpretation;
  }

  /** 軸のワースト分析 */
  function findWorstAxis(labels, totals, grandTotal) {
    if (!labels.length) return null;

    var sorted = labels.slice().sort(function(a, b) { return totals[b] - totals[a]; });
    var top = sorted[0];
    var topPct = grandTotal > 0 ? u.round(totals[top] / grandTotal * 100, 1) : 0;
    var bottom = sorted[sorted.length - 1];
    var bottomPct = grandTotal > 0 ? u.round(totals[bottom] / grandTotal * 100, 1) : 0;

    var text = '最多: 「' + top + '」 ' + totals[top] + '件(' + topPct + '%)';
    text += ' | 最少: 「' + bottom + '」 ' + totals[bottom] + '件(' + bottomPct + '%)';

    // 上位2つで過半数を超えるか
    if (sorted.length >= 3) {
      var top2Sum = totals[sorted[0]] + totals[sorted[1]];
      var top2Pct = grandTotal > 0 ? u.round(top2Sum / grandTotal * 100, 1) : 0;
      if (top2Pct >= 50) {
        text += '\n→ 上位2項目(「' + sorted[0] + '」「' + sorted[1] + '」)で' + top2Pct + '%を占めています。';
      }
    }

    return text;
  }

  /** 偏り分析（簡易カイ二乗的指標） */
  function analyzeBias(crossData) {
    if (crossData.grandTotal === 0) return null;
    var totalRows = crossData.rowLabels.length;
    var totalCols = crossData.colLabels.length;
    if (totalRows < 2 || totalCols < 2) return null;

    // クラメールのV（簡易版）
    var chiSq = 0;
    crossData.rowLabels.forEach(function(r) {
      crossData.colLabels.forEach(function(c) {
        var observed = crossData.matrix[r][c];
        var expected = (crossData.rowTotals[r] * crossData.colTotals[c]) / crossData.grandTotal;
        if (expected > 0) {
          chiSq += Math.pow(observed - expected, 2) / expected;
        }
      });
    });

    var k = Math.min(totalRows, totalCols);
    var cramerV = k > 1 ? u.round(Math.sqrt(chiSq / (crossData.grandTotal * (k - 1))), 3) : 0;

    var interpretation;
    if (cramerV >= 0.5) {
      interpretation = '行軸と列軸の間に強い関連性があります。特定の組み合わせに不良が著しく偏っています。';
    } else if (cramerV >= 0.3) {
      interpretation = '中程度の関連性があります。一部の組み合わせに注目した対策が有効です。';
    } else if (cramerV >= 0.1) {
      interpretation = '弱い関連性が見られます。大きな偏りはなく、全体的な品質管理体制の強化が優先されます。';
    } else {
      interpretation = 'ほぼ独立（関連性なし）です。行軸と列軸は独立しており、それぞれ個別の傾向として分析することが適切です。';
    }

    return 'クラメールのV = ' + cramerV + '\n' + interpretation;
  }

  /** 改善提案生成 */
  function generateSuggestion(crossData, rowAxis, colAxis, worst) {
    if (!worst.length) return null;
    var rowDef = AXIS_DEFS[rowAxis];
    var colDef = AXIS_DEFS[colAxis];

    var suggestions = [];
    var topPair = worst[0];
    var topPct = crossData.grandTotal > 0 ? u.round(topPair.value / crossData.grandTotal * 100, 1) : 0;

    if (topPct >= 15) {
      suggestions.push('「' + topPair.row + '」における「' + topPair.col + '」が全体の' + topPct + '%を占めます。この組み合わせに対する重点対策を検討してください。');
    }

    // 特定の行に集中している場合
    var rowSorted = crossData.rowLabels.slice().sort(function(a, b) {
      return crossData.rowTotals[b] - crossData.rowTotals[a];
    });
    var topRowPct = crossData.grandTotal > 0 ? u.round(crossData.rowTotals[rowSorted[0]] / crossData.grandTotal * 100, 1) : 0;
    if (topRowPct >= 30) {
      suggestions.push(rowDef.label + '「' + rowSorted[0] + '」に不良が集中(' + topRowPct + '%)。この' + rowDef.label + 'に特化した品質改善活動（QCサークル、なぜなぜ分析等）の実施を推奨します。');
    }

    // 特定の列に集中している場合
    var colSorted = crossData.colLabels.slice().sort(function(a, b) {
      return crossData.colTotals[b] - crossData.colTotals[a];
    });
    var topColPct = crossData.grandTotal > 0 ? u.round(crossData.colTotals[colSorted[0]] / crossData.grandTotal * 100, 1) : 0;
    if (topColPct >= 30) {
      suggestions.push(colDef.label + '「' + colSorted[0] + '」が最多(' + topColPct + '%)。この' + colDef.label + 'に関する作業標準の見直しや教育の強化を検討してください。');
    }

    if (!suggestions.length) {
      suggestions.push('不良が比較的分散しています。特定のホットスポットよりも、品質管理体制全体の底上げ（標準作業手順の整備、教育訓練、5S活動等）が効果的です。');
    }

    return suggestions.join('\n');
  }

  // ===== 空表示 =====

  function showEmpty() {
    document.getElementById('strat-heatmap-container').innerHTML =
      '<div class="empty-state"><div class="empty-state-icon">📊</div>' +
      '<div class="empty-state-text">指定期間にデータがありません</div></div>';
    document.getElementById('strat-summary').innerHTML =
      '<div class="empty-state"><div class="empty-state-text">データなし</div></div>';
    document.querySelector('#table-strat-worst tbody').innerHTML =
      '<tr><td colspan="6" class="empty-state-text">データなし</td></tr>';
  }

  // ===== エクスポート =====

  app.stratify = {
    init: init,
    draw: draw
  };

})(window.QualityApp);
