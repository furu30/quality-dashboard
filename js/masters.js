/**
 * 品質管理アプリ - マスタ管理モジュール
 */
window.QualityApp = window.QualityApp || {};

(function(app) {
  "use strict";

  var data = app.data;
  var u = app.utils;

  /** マスタ定義 */
  var MASTER_DEFS = {
    products: {
      table: 'products',
      formId: 'form-product',
      tableId: 'table-products',
      cancelBtnId: 'btn-cancel-product',
      fields: [
        { id: 'product-id', key: 'id', hidden: true },
        { id: 'product-code', key: 'code' },
        { id: 'product-name', key: 'name' },
        { id: 'product-category', key: 'category' }
      ],
      columns: ['code', 'name', 'category'],
      display: function(item) {
        return [u.escHtml(item.code), u.escHtml(item.name), u.escHtml(item.category || '')];
      }
    },
    processes: {
      table: 'processes',
      formId: 'form-process',
      tableId: 'table-processes',
      cancelBtnId: 'btn-cancel-process',
      fields: [
        { id: 'process-id', key: 'id', hidden: true },
        { id: 'process-name', key: 'name' },
        { id: 'process-order', key: 'order', type: 'number' },
        { id: 'process-department', key: 'department' }
      ],
      columns: ['name', 'order', 'department'],
      display: function(item) {
        return [u.escHtml(item.name), item.order || '', u.escHtml(item.department || '')];
      }
    },
    defectTypes: {
      table: 'defectTypes',
      formId: 'form-defect-type',
      tableId: 'table-defect-types',
      cancelBtnId: 'btn-cancel-defect-type',
      fields: [
        { id: 'defect-type-id', key: 'id', hidden: true },
        { id: 'defect-type-name', key: 'name' },
        { id: 'defect-type-category', key: 'category' }
      ],
      columns: ['name', 'category'],
      display: function(item) {
        return [u.escHtml(item.name), u.escHtml(item.category || '')];
      }
    },
    rootCauses: {
      table: 'rootCauses',
      formId: 'form-root-cause',
      tableId: 'table-root-causes',
      cancelBtnId: 'btn-cancel-root-cause',
      fields: [
        { id: 'root-cause-id', key: 'id', hidden: true },
        { id: 'root-cause-name', key: 'name' },
        { id: 'root-cause-4m', key: 'category4M' }
      ],
      columns: ['name', 'category4M'],
      display: function(item) {
        return [u.escHtml(item.name), u.category4mBadge(item.category4M)];
      }
    }
  };

  /** マスタテーブル描画 */
  function renderMasterTable(defKey) {
    var def = MASTER_DEFS[defKey];
    var tbody = document.querySelector('#' + def.tableId + ' tbody');
    if (!tbody) return;

    data.getAll(def.table).then(function(items) {
      if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="' + (def.columns.length + 1) + '"><div class="empty-state"><div class="empty-state-text">データがありません</div></div></td></tr>';
        return;
      }

      tbody.innerHTML = items.map(function(item) {
        var cells = def.display(item);
        var html = cells.map(function(c) { return '<td>' + c + '</td>'; }).join('');
        html += '<td class="actions">';
        html += '<button class="btn-icon edit" data-id="' + item.id + '" data-master="' + defKey + '" title="編集">&#9998;</button>';
        html += '<button class="btn-icon delete" data-id="' + item.id + '" data-master="' + defKey + '" title="削除">&#10005;</button>';
        html += '</td>';
        return '<tr>' + html + '</tr>';
      }).join('');
    });
  }

  /** マスタフォームから値を読み取り */
  function readFormValues(defKey) {
    var def = MASTER_DEFS[defKey];
    var obj = {};
    def.fields.forEach(function(f) {
      var el = document.getElementById(f.id);
      if (!el) return;
      var val = el.value.trim();
      if (f.hidden) {
        if (val) obj[f.key] = parseInt(val, 10);
      } else if (f.type === 'number') {
        obj[f.key] = val ? parseInt(val, 10) : null;
      } else {
        obj[f.key] = val;
      }
    });
    return obj;
  }

  /** マスタフォームに値をセット */
  function setFormValues(defKey, item) {
    var def = MASTER_DEFS[defKey];
    def.fields.forEach(function(f) {
      var el = document.getElementById(f.id);
      if (el) el.value = item[f.key] != null ? item[f.key] : '';
    });
  }

  /** マスタフォームをクリア */
  function clearForm(defKey) {
    var def = MASTER_DEFS[defKey];
    def.fields.forEach(function(f) {
      var el = document.getElementById(f.id);
      if (el) el.value = '';
    });
  }

  /** マスタ保存ハンドラ */
  function handleSave(defKey, e) {
    e.preventDefault();
    var values = readFormValues(defKey);
    var def = MASTER_DEFS[defKey];

    if (values.id) {
      var id = values.id;
      delete values.id;
      data.updateItem(def.table, id, values).then(function() {
        clearForm(defKey);
        renderMasterTable(defKey);
        if (app.onMasterChanged) app.onMasterChanged();
      });
    } else {
      delete values.id;
      data.addItem(def.table, values).then(function() {
        clearForm(defKey);
        renderMasterTable(defKey);
        if (app.onMasterChanged) app.onMasterChanged();
      });
    }
  }

  /** マスタ削除ハンドラ */
  function handleDelete(defKey, id) {
    if (!confirm('この項目を削除しますか？')) return;
    var def = MASTER_DEFS[defKey];
    data.deleteItem(def.table, id).then(function() {
      renderMasterTable(defKey);
      if (app.onMasterChanged) app.onMasterChanged();
    });
  }

  /** マスタ編集ハンドラ */
  function handleEdit(defKey, id) {
    var def = MASTER_DEFS[defKey];
    data.getById(def.table, id).then(function(item) {
      if (item) setFormValues(defKey, item);
    });
  }

  /** サブタブ切替 */
  function initSubTabs() {
    var bar = document.querySelector('.sub-tab-bar');
    if (!bar) return;

    bar.addEventListener('click', function(e) {
      var btn = e.target.closest('.sub-tab-item');
      if (!btn) return;
      var target = btn.dataset.subtab;

      bar.querySelectorAll('.sub-tab-item').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');

      document.querySelectorAll('.sub-tab-panel').forEach(function(p) { p.classList.remove('active'); });
      var panel = document.getElementById(target);
      if (panel) panel.classList.add('active');
    });
  }

  /** マスタモジュール初期化 */
  function init() {
    initSubTabs();

    // 各マスタのフォームとテーブルイベントをセットアップ
    Object.keys(MASTER_DEFS).forEach(function(defKey) {
      var def = MASTER_DEFS[defKey];

      // フォーム送信
      var form = document.getElementById(def.formId);
      if (form) {
        form.addEventListener('submit', function(e) { handleSave(defKey, e); });
      }

      // キャンセルボタン
      var cancelBtn = document.getElementById(def.cancelBtnId);
      if (cancelBtn) {
        cancelBtn.addEventListener('click', function() { clearForm(defKey); });
      }

      // テーブルクリック（編集・削除）
      var table = document.getElementById(def.tableId);
      if (table) {
        table.addEventListener('click', function(e) {
          var btn = e.target.closest('.btn-icon');
          if (!btn) return;
          var id = parseInt(btn.dataset.id, 10);
          var masterKey = btn.dataset.master;
          if (btn.classList.contains('edit')) {
            handleEdit(masterKey, id);
          } else if (btn.classList.contains('delete')) {
            handleDelete(masterKey, id);
          }
        });
      }

      // 初回描画
      renderMasterTable(defKey);
    });
  }

  /** 全マスタ再描画 */
  function renderAll() {
    Object.keys(MASTER_DEFS).forEach(function(defKey) {
      renderMasterTable(defKey);
    });
  }

  app.masters = {
    init: init,
    renderAll: renderAll,
    renderMasterTable: renderMasterTable
  };

})(window.QualityApp);
