/**
 * 品質管理アプリ - 不良記録モジュール
 */
window.QualityApp = window.QualityApp || {};

(function(app) {
  "use strict";

  var data = app.data;
  var u = app.utils;
  var PAGE_SIZE = 50;
  var currentPage = 1;
  var currentFilters = {};
  var mastersCache = null;

  /** マスタキャッシュをリフレッシュ */
  function refreshMasters() {
    return data.loadAllMasters().then(function(m) {
      mastersCache = m;
      return m;
    });
  }

  /** ドロップダウンをマスタデータで更新 */
  function populateDropdowns() {
    return refreshMasters().then(function(m) {
      fillSelect('rec-product', m.products, 'name');
      fillSelect('rec-process', m.processes, 'name');
      fillSelect('rec-defect-type', m.defectTypes, 'name');
      fillSelect('rec-root-cause', m.rootCauses, 'name', true);
      // フィルタ用
      fillSelect('filter-product', m.products, 'name', true);
      fillSelect('filter-process', m.processes, 'name', true);
    });
  }

  function fillSelect(selectId, items, labelKey, optional) {
    var sel = document.getElementById(selectId);
    if (!sel) return;
    var firstOpt = sel.querySelector('option');
    var firstText = firstOpt ? firstOpt.textContent : '';
    sel.innerHTML = '<option value="">' + u.escHtml(firstText || '選択してください') + '</option>';
    Object.keys(items).forEach(function(id) {
      var item = items[id];
      var opt = document.createElement('option');
      opt.value = id;
      opt.textContent = item[labelKey] || item.name;
      sel.appendChild(opt);
    });
  }

  /** 名前解決 */
  function resolveName(map, id) {
    if (!id || !map) return '';
    var item = map[id];
    return item ? (item.name || '') : '';
  }

  /** フォームから記録データを読み取り */
  function readForm() {
    return {
      date: document.getElementById('rec-date').value,
      time: document.getElementById('rec-time').value || '',
      productId: parseInt(document.getElementById('rec-product').value, 10) || null,
      processId: parseInt(document.getElementById('rec-process').value, 10) || null,
      defectTypeId: parseInt(document.getElementById('rec-defect-type').value, 10) || null,
      severity: document.getElementById('rec-severity').value,
      quantity: parseInt(document.getElementById('rec-quantity').value, 10) || 0,
      lotSize: parseInt(document.getElementById('rec-lot-size').value, 10) || null,
      measurementValue: parseFloat(document.getElementById('rec-measurement').value) || null,
      detectionMethod: document.getElementById('rec-detection').value || '',
      operatorName: document.getElementById('rec-operator').value.trim(),
      description: document.getElementById('rec-description').value.trim(),
      rootCauseId: parseInt(document.getElementById('rec-root-cause').value, 10) || null,
      correctiveAction: document.getElementById('rec-corrective').value.trim(),
      status: document.getElementById('rec-status').value || '未対応'
    };
  }

  /** フォームに記録データをセット */
  function setForm(rec) {
    document.getElementById('rec-id').value = rec.id || '';
    document.getElementById('rec-date').value = rec.date || '';
    document.getElementById('rec-time').value = rec.time || '';
    document.getElementById('rec-product').value = rec.productId || '';
    document.getElementById('rec-process').value = rec.processId || '';
    document.getElementById('rec-defect-type').value = rec.defectTypeId || '';
    document.getElementById('rec-severity').value = rec.severity || '';
    document.getElementById('rec-quantity').value = rec.quantity || '';
    document.getElementById('rec-lot-size').value = rec.lotSize || '';
    document.getElementById('rec-measurement').value = rec.measurementValue != null ? rec.measurementValue : '';
    document.getElementById('rec-detection').value = rec.detectionMethod || '';
    document.getElementById('rec-operator').value = rec.operatorName || '';
    document.getElementById('rec-description').value = rec.description || '';
    document.getElementById('rec-root-cause').value = rec.rootCauseId || '';
    document.getElementById('rec-corrective').value = rec.correctiveAction || '';
    document.getElementById('rec-status').value = rec.status || '未対応';

    document.getElementById('record-form-title').textContent = rec.id ? '不良記録 編集' : '不良記録 新規登録';
  }

  /** フォームをクリア */
  function clearForm() {
    document.getElementById('rec-id').value = '';
    document.getElementById('record-form').reset();
    document.getElementById('rec-date').value = u.today();
    document.getElementById('rec-time').value = u.nowTime();
    document.getElementById('rec-status').value = '未対応';
    document.getElementById('record-form-title').textContent = '不良記録 新規登録';
  }

  /** フィルタ値取得 */
  function getFilters() {
    return {
      dateFrom: document.getElementById('filter-date-from').value || undefined,
      dateTo: document.getElementById('filter-date-to').value || undefined,
      productId: parseInt(document.getElementById('filter-product').value, 10) || undefined,
      processId: parseInt(document.getElementById('filter-process').value, 10) || undefined,
      status: document.getElementById('filter-status').value || undefined
    };
  }

  /** 記録テーブル描画 */
  function renderTable() {
    if (!mastersCache) return refreshMasters().then(renderTable);

    var m = mastersCache;
    data.queryDefects(currentFilters).then(function(records) {
      var tbody = document.querySelector('#table-records tbody');
      if (!tbody) return;

      if (!records.length) {
        tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><div class="empty-state-text">不良記録がありません</div></div></td></tr>';
        renderPagination(0);
        return;
      }

      var start = (currentPage - 1) * PAGE_SIZE;
      var pageRecords = records.slice(start, start + PAGE_SIZE);

      tbody.innerHTML = pageRecords.map(function(r) {
        return '<tr>' +
          '<td>' + u.formatDate(r.date) + '</td>' +
          '<td>' + u.escHtml(resolveName(m.products, r.productId)) + '</td>' +
          '<td>' + u.escHtml(resolveName(m.processes, r.processId)) + '</td>' +
          '<td>' + u.escHtml(resolveName(m.defectTypes, r.defectTypeId)) + '</td>' +
          '<td>' + r.quantity + '</td>' +
          '<td>' + u.severityBadge(r.severity) + '</td>' +
          '<td>' + u.statusBadge(r.status) + '</td>' +
          '<td class="actions">' +
            '<button class="btn-icon edit" data-id="' + r.id + '" title="編集">&#9998;</button>' +
            '<button class="btn-icon delete" data-id="' + r.id + '" title="削除">&#10005;</button>' +
          '</td>' +
        '</tr>';
      }).join('');

      renderPagination(records.length);
    });
  }

  /** ページネーション描画 */
  function renderPagination(total) {
    var container = document.getElementById('records-pagination');
    if (!container) return;
    var pages = Math.ceil(total / PAGE_SIZE);
    if (pages <= 1) { container.innerHTML = ''; return; }

    var html = '';
    for (var i = 1; i <= pages; i++) {
      html += '<button class="page-btn' + (i === currentPage ? ' active' : '') + '" data-page="' + i + '">' + i + '</button>';
    }
    container.innerHTML = html;
  }

  /** 初期化 */
  function init() {
    // デフォルト日時セット
    document.getElementById('rec-date').value = u.today();
    document.getElementById('rec-time').value = u.nowTime();

    // ドロップダウン初期化
    populateDropdowns().then(function() {
      renderTable();
    });

    // フォーム送信
    document.getElementById('record-form').addEventListener('submit', function(e) {
      e.preventDefault();
      var rec = readForm();
      var editId = document.getElementById('rec-id').value;

      if (editId) {
        data.updateDefect(parseInt(editId, 10), rec).then(function() {
          clearForm();
          renderTable();
        });
      } else {
        data.addDefect(rec).then(function() {
          clearForm();
          renderTable();
        });
      }
    });

    // クリアボタン
    document.getElementById('btn-clear-record').addEventListener('click', clearForm);

    // フィルタ適用
    document.getElementById('btn-filter-apply').addEventListener('click', function() {
      currentFilters = getFilters();
      currentPage = 1;
      renderTable();
    });

    // フィルタリセット
    document.getElementById('btn-filter-clear').addEventListener('click', function() {
      document.getElementById('filter-date-from').value = '';
      document.getElementById('filter-date-to').value = '';
      document.getElementById('filter-product').value = '';
      document.getElementById('filter-process').value = '';
      document.getElementById('filter-status').value = '';
      currentFilters = {};
      currentPage = 1;
      renderTable();
    });

    // テーブル操作（編集・削除）
    document.getElementById('table-records').addEventListener('click', function(e) {
      var btn = e.target.closest('.btn-icon');
      if (!btn) return;
      var id = parseInt(btn.dataset.id, 10);

      if (btn.classList.contains('edit')) {
        data.getById('defectRecords', id).then(function(rec) {
          if (rec) setForm(rec);
        });
      } else if (btn.classList.contains('delete')) {
        if (confirm('この記録を削除しますか？')) {
          data.deleteDefect(id).then(function() { renderTable(); });
        }
      }
    });

    // ページネーション
    document.getElementById('records-pagination').addEventListener('click', function(e) {
      var btn = e.target.closest('.page-btn');
      if (!btn) return;
      currentPage = parseInt(btn.dataset.page, 10);
      renderTable();
    });
  }

  app.records = {
    init: init,
    renderTable: renderTable,
    populateDropdowns: populateDropdowns,
    refreshMasters: refreshMasters
  };

})(window.QualityApp);
