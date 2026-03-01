/**
 * 品質管理アプリ - データエクスポート/インポート
 */
window.QualityApp = window.QualityApp || {};

(function(app) {
  "use strict";

  var data = app.data;
  var u = app.utils;

  /** ファイルダウンロード */
  function downloadFile(content, filename, mimeType) {
    var blob = new Blob([content], { type: mimeType });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** タイムスタンプ付きファイル名 */
  function timestampName(prefix, ext) {
    var now = new Date();
    var ts = now.getFullYear() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') + '_' +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0');
    return prefix + '_' + ts + '.' + ext;
  }

  /** 不良記録CSV出力 */
  function exportCSV() {
    data.loadAllMasters().then(function(masters) {
      data.queryDefects({}).then(function(records) {
        var headers = ['ID','日付','時刻','製品コード','製品名','工程','不良種別','重大度','不良数','ロットサイズ','計測値','検出方法','作業者','詳細','原因','原因4M分類','是正処置','状態'];
        var rows = records.map(function(r) {
          var product = masters.products[r.productId];
          var process = masters.processes[r.processId];
          var defectType = masters.defectTypes[r.defectTypeId];
          var rootCause = masters.rootCauses[r.rootCauseId];
          return [
            r.id,
            r.date,
            r.time || '',
            product ? product.code : '',
            product ? product.name : '',
            process ? process.name : '',
            defectType ? defectType.name : '',
            r.severity || '',
            r.quantity || 0,
            r.lotSize || '',
            r.measurementValue != null ? r.measurementValue : '',
            r.detectionMethod || '',
            r.operatorName || '',
            csvEscape(r.description || ''),
            rootCause ? rootCause.name : '',
            rootCause ? rootCause.category4M : '',
            csvEscape(r.correctiveAction || ''),
            r.status || ''
          ];
        });

        var bom = '\uFEFF';
        var csv = bom + headers.join(',') + '\n' + rows.map(function(row) {
          return row.map(function(cell) { return '"' + String(cell).replace(/"/g, '""') + '"'; }).join(',');
        }).join('\n');

        downloadFile(csv, timestampName('品質不良記録', 'csv'), 'text/csv;charset=utf-8');
      });
    });
  }

  /** 検査データCSV出力 */
  function exportInspectionCSV() {
    data.loadAllMasters().then(function(masters) {
      data.queryInspections({}).then(function(records) {
        if (!records.length) {
          alert('検査データがありません。デモデータを投入してください。');
          return;
        }

        var headers = ['ID','日付','時刻','製品名','工程','測定項目','サブグループID','サンプルNo','測定値','USL','LSL','作業者','装置温度(℃)','刃具切削数','備考'];
        var rows = records.map(function(r) {
          var product = masters.products[r.productId];
          var process = masters.processes[r.processId];
          return [
            r.id,
            r.date,
            r.time || '',
            product ? product.name : '',
            process ? process.name : '',
            r.measurementType || '',
            r.subgroupId || '',
            r.sampleNo || '',
            r.measuredValue != null ? r.measuredValue : '',
            r.usl != null ? r.usl : '',
            r.lsl != null ? r.lsl : '',
            r.operatorName || '',
            r.equipmentTemp != null ? r.equipmentTemp : '',
            r.toolCutCount != null ? r.toolCutCount : '',
            csvEscape(r.notes || '')
          ];
        });

        var bom = '\uFEFF';
        var csv = bom + headers.join(',') + '\n' + rows.map(function(row) {
          return row.map(function(cell) { return '"' + String(cell).replace(/"/g, '""') + '"'; }).join(',');
        }).join('\n');

        downloadFile(csv, timestampName('検査データ', 'csv'), 'text/csv;charset=utf-8');
      });
    });
  }

  function csvEscape(str) {
    return str.replace(/\n/g, ' ').replace(/\r/g, '');
  }

  /** 全データJSON出力 */
  function exportJSON() {
    data.exportAll().then(function(allData) {
      var json = JSON.stringify(allData, null, 2);
      downloadFile(json, timestampName('品質管理バックアップ', 'json'), 'application/json');
    });
  }

  /** JSONインポート */
  function importJSON(file) {
    var statusEl = document.getElementById('import-status');

    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var jsonData = JSON.parse(e.target.result);

        if (!jsonData.version || !jsonData.defectRecords) {
          statusEl.textContent = 'エラー: 無効なファイル形式です';
          statusEl.className = 'import-status error';
          return;
        }

        if (!confirm('現在のデータはすべて上書きされます。インポートを実行しますか？')) {
          statusEl.textContent = 'インポートをキャンセルしました';
          statusEl.className = 'import-status';
          return;
        }

        data.importAll(jsonData).then(function() {
          var counts = [
            '製品:' + (jsonData.products ? jsonData.products.length : 0),
            '工程:' + (jsonData.processes ? jsonData.processes.length : 0),
            '不良種別:' + (jsonData.defectTypes ? jsonData.defectTypes.length : 0),
            '原因:' + (jsonData.rootCauses ? jsonData.rootCauses.length : 0),
            '不良記録:' + (jsonData.defectRecords ? jsonData.defectRecords.length : 0),
            '検査データ:' + (jsonData.inspectionRecords ? jsonData.inspectionRecords.length : 0)
          ];
          statusEl.textContent = 'インポート完了: ' + counts.join(', ');
          statusEl.className = 'import-status success';

          // 全モジュール再読込
          if (app.onDataReloaded) app.onDataReloaded();
        }).catch(function(err) {
          statusEl.textContent = 'エラー: ' + err.message;
          statusEl.className = 'import-status error';
        });
      } catch (err) {
        statusEl.textContent = 'エラー: JSONの解析に失敗しました';
        statusEl.className = 'import-status error';
      }
    };
    reader.readAsText(file);
  }

  // ===== Excel / CSV インポート =====

  /** 列名マッピング辞書: ファイルの列名 → アプリの内部フィールド */
  var COLUMN_MAP = {
    // 日付
    '日付': 'date', 'date': 'date', '発生日': 'date', '発生日付': 'date', '検出日': 'date',
    // 時刻
    '時刻': 'time', 'time': 'time', '発生時刻': 'time',
    // 製品
    '製品名': 'productName', '製品': 'productName', 'product': 'productName', '品名': 'productName', '製品コード': 'productCode', 'product_code': 'productCode',
    // 製品カテゴリ
    '製品カテゴリ': 'productCategory', 'カテゴリ': 'productCategory', 'category': 'productCategory',
    // 工程
    '工程': 'processName', 'process': 'processName', '工程名': 'processName', '発生工程': 'processName',
    // 不良種別
    '不良内容': 'defectTypeName', '不良種別': 'defectTypeName', '不良名': 'defectTypeName', '不良項目': 'defectTypeName', 'defect': 'defectTypeName', 'defect_type': 'defectTypeName',
    // 不良分類
    '不良分類': 'defectTypeCategory', '分類': 'defectTypeCategory',
    // 重大度
    '重大度': 'severity', 'severity': 'severity', '重要度': 'severity',
    // 数量
    '数量': 'quantity', '不良数': 'quantity', 'quantity': 'quantity', '個数': 'quantity',
    // ロットサイズ
    'ロットサイズ': 'lotSize', 'lot_size': 'lotSize', 'ロット': 'lotSize',
    // 計測値
    '計測値': 'measurementValue', '測定値': 'measurementValue', 'measurement': 'measurementValue',
    // 検出方法
    '検出方法': 'detectionMethod', '発見方法': 'detectionMethod',
    // 作業者
    '担当者': 'operatorName', '作業者': 'operatorName', 'operator': 'operatorName', '担当': 'operatorName',
    // メモ/詳細
    '詳細': 'description', 'メモ': 'description', '備考': 'description', '説明': 'description', 'description': 'description',
    // 原因
    '原因': 'rootCauseName', '根本原因': 'rootCauseName', 'root_cause': 'rootCauseName',
    // 原因4M
    '原因4M': 'rootCause4M', '4M分類': 'rootCause4M', '4M': 'rootCause4M',
    // 是正処置
    '是正処置': 'correctiveAction', '対策': 'correctiveAction', '対策内容': 'correctiveAction',
    // 状態
    '状態': 'status', 'status': 'status', '対策済': 'status', '対策状況': 'status', 'ステータス': 'status',
    // シフト (description に含める)
    'シフト': 'shift', 'shift': 'shift'
  };

  /** アプリ内部フィールドの表示名 */
  var FIELD_LABELS = {
    '': '（無視）',
    'date': '日付',
    'time': '時刻',
    'productName': '製品名',
    'productCode': '製品コード',
    'productCategory': '製品カテゴリ',
    'processName': '工程',
    'defectTypeName': '不良種別',
    'defectTypeCategory': '不良分類',
    'severity': '重大度',
    'quantity': '数量',
    'lotSize': 'ロットサイズ',
    'measurementValue': '計測値',
    'detectionMethod': '検出方法',
    'operatorName': '担当者',
    'description': '詳細/メモ',
    'rootCauseName': '原因',
    'rootCause4M': '原因4M分類',
    'correctiveAction': '是正処置',
    'status': '状態',
    'shift': 'シフト'
  };

  /** 外部ファイルの一時保持 */
  var extState = {
    allSheets: null,     // { sheetName: [ {col:val, ...}, ... ] }
    selectedSheets: [],
    headers: [],
    mapping: {},         // { headerName: internalField }
    rows: []
  };

  /** ファイル読み込み */
  function handleExtFile(file) {
    var statusEl = document.getElementById('ext-import-status');
    statusEl.textContent = '';
    statusEl.className = 'import-status';

    var ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'csv') {
      readCSVFile(file);
    } else if (ext === 'xlsx' || ext === 'xls') {
      readExcelFile(file);
    } else {
      statusEl.textContent = 'エラー: 対応形式はCSV (.csv) または Excel (.xlsx, .xls) です';
      statusEl.className = 'import-status error';
    }
  }

  /** CSV読み込み */
  function readCSVFile(file) {
    var reader = new FileReader();
    reader.onload = function(e) {
      var text = e.target.result;
      var rows = parseCSVText(text);
      if (rows.length < 2) {
        showExtError('データが空です');
        return;
      }
      var headers = rows[0];
      var dataRows = [];
      for (var i = 1; i < rows.length; i++) {
        if (rows[i].some(function(c) { return c.trim() !== ''; })) {
          var obj = {};
          headers.forEach(function(h, idx) {
            obj[h] = rows[i][idx] || '';
          });
          dataRows.push(obj);
        }
      }
      extState.allSheets = { 'CSVデータ': dataRows };
      extState.selectedSheets = ['CSVデータ'];
      hideSheetSelector();
      buildMappingUI(dataRows, headers);
    };
    reader.readAsText(file, 'UTF-8');
  }

  /** CSVテキストをパース */
  function parseCSVText(text) {
    // BOM除去
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    var rows = [];
    var row = [];
    var inQuote = false;
    var cell = '';

    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inQuote) {
        if (c === '"') {
          if (i + 1 < text.length && text[i + 1] === '"') {
            cell += '"';
            i++;
          } else {
            inQuote = false;
          }
        } else {
          cell += c;
        }
      } else {
        if (c === '"') {
          inQuote = true;
        } else if (c === ',') {
          row.push(cell);
          cell = '';
        } else if (c === '\n' || (c === '\r' && text[i + 1] === '\n')) {
          if (c === '\r') i++;
          row.push(cell);
          cell = '';
          rows.push(row);
          row = [];
        } else if (c === '\r') {
          row.push(cell);
          cell = '';
          rows.push(row);
          row = [];
        } else {
          cell += c;
        }
      }
    }
    // 最終行
    if (cell !== '' || row.length > 0) {
      row.push(cell);
      rows.push(row);
    }
    return rows;
  }

  /** Excel読み込み（SheetJS使用） */
  function readExcelFile(file) {
    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var workbook = XLSX.read(e.target.result, { type: 'array', cellDates: true });
        var sheets = {};
        workbook.SheetNames.forEach(function(name) {
          var ws = workbook.Sheets[name];
          var json = XLSX.utils.sheet_to_json(ws, { defval: '' });
          if (json.length > 0) {
            // 日付型セルを文字列に変換
            json.forEach(function(row) {
              Object.keys(row).forEach(function(key) {
                if (row[key] instanceof Date) {
                  row[key] = formatDate(row[key]);
                }
              });
            });
            sheets[name] = json;
          }
        });

        if (Object.keys(sheets).length === 0) {
          showExtError('データを含むシートが見つかりませんでした');
          return;
        }

        extState.allSheets = sheets;
        var sheetNames = Object.keys(sheets);

        if (sheetNames.length === 1) {
          extState.selectedSheets = [sheetNames[0]];
          hideSheetSelector();
          var firstSheet = sheets[sheetNames[0]];
          var headers = Object.keys(firstSheet[0] || {});
          buildMappingUI(firstSheet, headers);
        } else {
          showSheetSelector(sheetNames);
        }
      } catch (err) {
        showExtError('Excelファイルの読み込みに失敗しました: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  /** Date → YYYY-MM-DD 変換 */
  function formatDate(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  /** エラー表示 */
  function showExtError(msg) {
    var el = document.getElementById('ext-import-status');
    el.textContent = 'エラー: ' + msg;
    el.className = 'import-status error';
  }

  /** シート選択UI表示 */
  function showSheetSelector(sheetNames) {
    var container = document.getElementById('ext-sheet-selector');
    var listEl = document.getElementById('ext-sheet-list');
    listEl.innerHTML = '';

    sheetNames.forEach(function(name) {
      var lbl = document.createElement('label');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = name;
      cb.checked = true;
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(' ' + name + ' (' + extState.allSheets[name].length + '件)'));
      listEl.appendChild(lbl);
    });
    container.style.display = '';

    // 全チェック時にマッピングUI更新
    var allCbs = listEl.querySelectorAll('input[type="checkbox"]');
    allCbs.forEach(function(cb) {
      cb.addEventListener('change', onSheetSelectionChanged);
    });

    // 初期状態で全選択→マッピングUI表示
    extState.selectedSheets = sheetNames.slice();
    var merged = mergeSelectedSheets();
    var headers = Object.keys(merged[0] || {});
    buildMappingUI(merged, headers);
  }

  function hideSheetSelector() {
    document.getElementById('ext-sheet-selector').style.display = 'none';
  }

  /** シート選択変更時 */
  function onSheetSelectionChanged() {
    var cbs = document.querySelectorAll('#ext-sheet-list input[type="checkbox"]');
    var selected = [];
    cbs.forEach(function(cb) { if (cb.checked) selected.push(cb.value); });
    extState.selectedSheets = selected;

    if (selected.length === 0) {
      document.getElementById('ext-mapping-area').style.display = 'none';
      return;
    }

    var merged = mergeSelectedSheets();
    var headers = Object.keys(merged[0] || {});
    buildMappingUI(merged, headers);
  }

  /** 選択シートのデータを結合 */
  function mergeSelectedSheets() {
    var merged = [];
    extState.selectedSheets.forEach(function(name) {
      if (extState.allSheets[name]) {
        merged = merged.concat(extState.allSheets[name]);
      }
    });
    return merged;
  }

  /** 列マッピングUIを構築 */
  function buildMappingUI(rows, headers) {
    extState.rows = rows;
    extState.headers = headers;

    // 自動マッピング
    var autoMap = {};
    headers.forEach(function(h) {
      var hClean = h.trim().toLowerCase();
      var found = '';
      Object.keys(COLUMN_MAP).forEach(function(key) {
        if (key.toLowerCase() === hClean) {
          found = COLUMN_MAP[key];
        }
      });
      autoMap[h] = found;
    });
    extState.mapping = autoMap;

    // マッピンググリッド描画
    var gridEl = document.getElementById('ext-mapping-grid');
    gridEl.innerHTML = '';

    headers.forEach(function(h) {
      var item = document.createElement('div');
      item.className = 'ext-mapping-item';

      var src = document.createElement('span');
      src.className = 'mapping-source';
      src.textContent = h;

      var arrow = document.createElement('span');
      arrow.className = 'mapping-arrow';
      arrow.textContent = '→';

      var sel = document.createElement('select');
      sel.dataset.header = h;
      Object.keys(FIELD_LABELS).forEach(function(val) {
        var opt = document.createElement('option');
        opt.value = val;
        opt.textContent = FIELD_LABELS[val];
        if (val === autoMap[h]) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener('change', function() {
        extState.mapping[h] = sel.value;
        renderPreview();
      });

      item.appendChild(src);
      item.appendChild(arrow);
      item.appendChild(sel);
      gridEl.appendChild(item);
    });

    // プレビュー描画
    renderPreview();
    document.getElementById('ext-mapping-area').style.display = '';
  }

  /** データプレビュー描画 */
  function renderPreview() {
    var tableEl = document.getElementById('ext-preview-table');
    var previewRows = extState.rows.slice(0, 5);
    var mapping = extState.mapping;

    // マッピングされたフィールドだけ表示
    var activeCols = [];
    extState.headers.forEach(function(h) {
      if (mapping[h]) {
        activeCols.push({ header: h, field: mapping[h] });
      }
    });

    if (activeCols.length === 0) {
      tableEl.innerHTML = '<p style="color:var(--muted);">マッピングされた列がありません</p>';
      return;
    }

    var html = '<table><thead><tr>';
    activeCols.forEach(function(col) {
      html += '<th>' + FIELD_LABELS[col.field] + '<br><small style="color:var(--muted);">(' + col.header + ')</small></th>';
    });
    html += '</tr></thead><tbody>';

    previewRows.forEach(function(row) {
      html += '<tr>';
      activeCols.forEach(function(col) {
        var val = row[col.header];
        if (val === undefined || val === null) val = '';
        html += '<td>' + escapeHtml(String(val)) + '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    html += '<p style="color:var(--muted);font-size:12px;margin-top:8px;">合計: ' + extState.rows.length + '件</p>';
    tableEl.innerHTML = html;
  }

  /** HTMLエスケープ */
  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** Excel/CSVインポート実行 */
  function executeExtImport() {
    var statusEl = document.getElementById('ext-import-status');
    statusEl.textContent = '';
    statusEl.className = 'import-status';

    var rows = extState.selectedSheets.length > 1 ? mergeSelectedSheets() : extState.rows;
    var mapping = extState.mapping;
    var mode = document.querySelector('input[name="ext-import-mode"]:checked').value;

    if (rows.length === 0) {
      showExtError('インポートするデータがありません');
      return;
    }

    var confirmMsg = mode === 'replace'
      ? '既存データをすべて削除し、' + rows.length + '件のデータをインポートします。よろしいですか？'
      : rows.length + '件のデータを既存データに追加します。よろしいですか？';
    if (!confirm(confirmMsg)) return;

    statusEl.textContent = 'インポート処理中...';
    statusEl.className = 'import-status';

    // Step 1: ファイルからユニークなマスタ値を収集
    var productMap = {};   // name → { name, code, category }
    var processMap = {};   // name → { name }
    var defectTypeMap = {};// name → { name, category }
    var rootCauseMap = {}; // name → { name, category4M }

    rows.forEach(function(row) {
      // 製品
      var pName = getMapped(row, mapping, 'productName');
      if (pName) {
        productMap[pName] = {
          code: getMapped(row, mapping, 'productCode') || '',
          name: pName,
          category: getMapped(row, mapping, 'productCategory') || ''
        };
      }

      // 工程
      var prName = getMapped(row, mapping, 'processName');
      if (prName && !processMap[prName]) {
        processMap[prName] = { name: prName, order: Object.keys(processMap).length + 1, department: '' };
      }

      // 不良種別
      var dtName = getMapped(row, mapping, 'defectTypeName');
      if (dtName) {
        defectTypeMap[dtName] = {
          name: dtName,
          category: getMapped(row, mapping, 'defectTypeCategory') || ''
        };
      }

      // 原因
      var rcName = getMapped(row, mapping, 'rootCauseName');
      if (rcName) {
        rootCauseMap[rcName] = {
          name: rcName,
          category4M: getMapped(row, mapping, 'rootCause4M') || ''
        };
      }
    });

    // Step 2: マスタ登録 → ID取得 → レコード作成
    var productIds = {};  // name → id
    var processIds = {};
    var defectTypeIds = {};
    var rootCauseIds = {};

    var db = app.db;

    var importPromise;

    if (mode === 'replace') {
      importPromise = db.transaction('rw', db.products, db.processes, db.defectTypes, db.rootCauses, db.defectRecords, function() {
        db.products.clear();
        db.processes.clear();
        db.defectTypes.clear();
        db.rootCauses.clear();
        db.defectRecords.clear();

        return registerMastersAndRecords();
      });
    } else {
      // 追加モード: 既存マスタと照合
      importPromise = loadExistingMasters().then(function(existing) {
        return db.transaction('rw', db.products, db.processes, db.defectTypes, db.rootCauses, db.defectRecords, function() {
          return registerMastersAndRecords(existing);
        });
      });
    }

    /** 既存マスタを読み込み (追加モード用) */
    function loadExistingMasters() {
      return Promise.all([
        db.products.toArray(),
        db.processes.toArray(),
        db.defectTypes.toArray(),
        db.rootCauses.toArray()
      ]).then(function(results) {
        var existing = { products: {}, processes: {}, defectTypes: {}, rootCauses: {} };
        results[0].forEach(function(r) { existing.products[r.name] = r.id; });
        results[1].forEach(function(r) { existing.processes[r.name] = r.id; });
        results[2].forEach(function(r) { existing.defectTypes[r.name] = r.id; });
        results[3].forEach(function(r) { existing.rootCauses[r.name] = r.id; });
        return existing;
      });
    }

    /** マスタ登録＋レコード作成 */
    function registerMastersAndRecords(existing) {
      existing = existing || { products: {}, processes: {}, defectTypes: {}, rootCauses: {} };

      // 新規マスタを登録
      var promises = [];

      // 製品
      Object.keys(productMap).forEach(function(name) {
        if (existing.products[name]) {
          productIds[name] = existing.products[name];
        } else {
          promises.push(
            db.products.add(productMap[name]).then(function(id) { productIds[name] = id; })
          );
        }
      });

      // 工程
      Object.keys(processMap).forEach(function(name) {
        if (existing.processes[name]) {
          processIds[name] = existing.processes[name];
        } else {
          promises.push(
            db.processes.add(processMap[name]).then(function(id) { processIds[name] = id; })
          );
        }
      });

      // 不良種別
      Object.keys(defectTypeMap).forEach(function(name) {
        if (existing.defectTypes[name]) {
          defectTypeIds[name] = existing.defectTypes[name];
        } else {
          promises.push(
            db.defectTypes.add(defectTypeMap[name]).then(function(id) { defectTypeIds[name] = id; })
          );
        }
      });

      // 原因
      Object.keys(rootCauseMap).forEach(function(name) {
        if (existing.rootCauses[name]) {
          rootCauseIds[name] = existing.rootCauses[name];
        } else {
          promises.push(
            db.rootCauses.add(rootCauseMap[name]).then(function(id) { rootCauseIds[name] = id; })
          );
        }
      });

      return Promise.all(promises).then(function() {
        // 不良記録を生成
        var records = rows.map(function(row) {
          var pName = getMapped(row, mapping, 'productName');
          var prName = getMapped(row, mapping, 'processName');
          var dtName = getMapped(row, mapping, 'defectTypeName');
          var rcName = getMapped(row, mapping, 'rootCauseName');

          var dateVal = getMapped(row, mapping, 'date') || '';
          // 日付フォーマット正規化
          dateVal = normalizeDate(dateVal);

          var statusVal = normalizeStatus(getMapped(row, mapping, 'status'));
          var severityVal = getMapped(row, mapping, 'severity') || '';
          var qtyVal = parseInt(getMapped(row, mapping, 'quantity'), 10) || 1;
          var lotVal = parseInt(getMapped(row, mapping, 'lotSize'), 10) || null;
          var measVal = parseFloat(getMapped(row, mapping, 'measurementValue'));
          if (isNaN(measVal)) measVal = null;

          // シフト情報をdescriptionに追加
          var desc = getMapped(row, mapping, 'description') || '';
          var shift = getMapped(row, mapping, 'shift');
          if (shift) {
            desc = desc ? desc + ' [シフト: ' + shift + ']' : 'シフト: ' + shift;
          }

          return {
            date: dateVal,
            time: getMapped(row, mapping, 'time') || '',
            productId: productIds[pName] || null,
            processId: processIds[prName] || null,
            defectTypeId: defectTypeIds[dtName] || null,
            severity: severityVal,
            quantity: qtyVal,
            lotSize: lotVal,
            measurementValue: measVal,
            detectionMethod: getMapped(row, mapping, 'detectionMethod') || '',
            operatorName: getMapped(row, mapping, 'operatorName') || '',
            description: desc,
            rootCauseId: rootCauseIds[rcName] || null,
            correctiveAction: getMapped(row, mapping, 'correctiveAction') || '',
            status: statusVal,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
        });

        return db.defectRecords.bulkAdd(records);
      });
    }

    importPromise.then(function() {
      var pCount = Object.keys(productMap).length;
      var prCount = Object.keys(processMap).length;
      var dtCount = Object.keys(defectTypeMap).length;
      var rcCount = Object.keys(rootCauseMap).length;

      var counts = [];
      if (pCount > 0) counts.push('製品:' + pCount);
      if (prCount > 0) counts.push('工程:' + prCount);
      if (dtCount > 0) counts.push('不良種別:' + dtCount);
      if (rcCount > 0) counts.push('原因:' + rcCount);
      counts.push('不良記録:' + rows.length);

      statusEl.textContent = 'インポート完了! ' + counts.join(', ');
      statusEl.className = 'import-status success';

      // 全モジュール再読込
      if (app.onDataReloaded) app.onDataReloaded();
    }).catch(function(err) {
      showExtError('インポート中にエラーが発生しました: ' + err.message);
    });
  }

  /** マッピングに基づいて行から値を取得 */
  function getMapped(row, mapping, field) {
    var headers = Object.keys(mapping);
    for (var i = 0; i < headers.length; i++) {
      if (mapping[headers[i]] === field) {
        var val = row[headers[i]];
        if (val === undefined || val === null) return '';
        return String(val).trim();
      }
    }
    return '';
  }

  /** 日付を YYYY-MM-DD に正規化 */
  function normalizeDate(str) {
    if (!str) return '';
    // 既にYYYY-MM-DD形式
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    // YYYY/MM/DD
    if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(str)) {
      var p1 = str.split('/');
      return p1[0] + '-' + p1[1].padStart(2, '0') + '-' + p1[2].padStart(2, '0');
    }
    // MM/DD/YYYY
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
      var p2 = str.split('/');
      return p2[2] + '-' + p2[0].padStart(2, '0') + '-' + p2[1].padStart(2, '0');
    }
    // YYYY年MM月DD日
    var m = str.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
    // Excelシリアル値の可能性
    var num = Number(str);
    if (num > 40000 && num < 60000) {
      var d = new Date((num - 25569) * 86400 * 1000);
      return formatDate(d);
    }
    return str;
  }

  /** 状態の正規化 */
  function normalizeStatus(val) {
    if (!val) return '未対応';
    val = val.trim();
    if (val === '○' || val === '◯' || val === 'O' || val === 'o' || val === 'YES' || val === 'yes' || val === '済' || val === '完了') return '完了';
    if (val === '×' || val === 'X' || val === 'x' || val === 'NO' || val === 'no' || val === '未' || val === '未対応') return '未対応';
    if (val === '△' || val === '対応中' || val === '進行中') return '対応中';
    // そのまま返す（完了/未対応/対応中がそのまま入っている場合）
    if (['完了', '未対応', '対応中'].indexOf(val) >= 0) return val;
    return '未対応';
  }

  /** スキル連携用JSONコピー */
  function exportForSkill() {
    data.loadAllMasters().then(function(masters) {
      data.queryDefects({}).then(function(records) {
        // マスタ名を解決した状態でエクスポート
        var enrichedRecords = records.map(function(r) {
          var product = masters.products[r.productId];
          var process = masters.processes[r.processId];
          var defectType = masters.defectTypes[r.defectTypeId];
          var rootCause = masters.rootCauses[r.rootCauseId];
          return {
            id: r.id,
            date: r.date,
            time: r.time,
            product: product ? product.name : '',
            productCode: product ? product.code : '',
            process: process ? process.name : '',
            defectType: defectType ? defectType.name : '',
            severity: r.severity,
            quantity: r.quantity,
            lotSize: r.lotSize,
            measurementValue: r.measurementValue,
            detectionMethod: r.detectionMethod,
            operatorName: r.operatorName,
            description: r.description,
            rootCause: rootCause ? rootCause.name : '',
            rootCause4M: rootCause ? rootCause.category4M : '',
            correctiveAction: r.correctiveAction,
            status: r.status
          };
        });

        var output = {
          exportedAt: new Date().toISOString(),
          totalRecords: enrichedRecords.length,
          records: enrichedRecords
        };

        navigator.clipboard.writeText(JSON.stringify(output, null, 2)).then(function() {
          alert('分析用データをクリップボードにコピーしました（' + enrichedRecords.length + '件）');
        }).catch(function() {
          // フォールバック
          var json = JSON.stringify(output, null, 2);
          downloadFile(json, timestampName('品質分析用データ', 'json'), 'application/json');
        });
      });
    });
  }

  function init() {
    document.getElementById('btn-export-csv').addEventListener('click', exportCSV);
    document.getElementById('btn-export-csv-insp').addEventListener('click', exportInspectionCSV);
    document.getElementById('btn-export-json').addEventListener('click', exportJSON);
    document.getElementById('btn-export-skill').addEventListener('click', exportForSkill);

    // JSONインポート
    var fileInput = document.getElementById('import-json-file');
    var importBtn = document.getElementById('btn-import-json');

    fileInput.addEventListener('change', function() {
      importBtn.disabled = !fileInput.files.length;
    });

    importBtn.addEventListener('click', function() {
      if (fileInput.files.length) {
        importJSON(fileInput.files[0]);
      }
    });

    // Excel/CSVインポート
    var extFileInput = document.getElementById('import-ext-file');
    extFileInput.addEventListener('change', function() {
      if (extFileInput.files.length) {
        handleExtFile(extFileInput.files[0]);
      }
    });

    document.getElementById('btn-import-ext').addEventListener('click', function() {
      executeExtImport();
    });
  }

  app.exportModule = {
    init: init
  };

})(window.QualityApp);
