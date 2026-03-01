/**
 * 品質管理アプリ - データベース層 (Dexie.js)
 */
window.QualityApp = window.QualityApp || {};

(function(app) {
  "use strict";

  var db = new Dexie('QualityManagementDB');

  db.version(1).stores({
    defectRecords: '++id, date, productId, processId, defectTypeId, severity, rootCauseId, status, [date+productId], [date+processId]',
    products:      '++id, code, name, category',
    processes:     '++id, name, order, department',
    defectTypes:   '++id, name, category',
    rootCauses:    '++id, name, category4M',
    settings:      'key'
  });

  // v2: 検査データテーブル追加
  db.version(2).stores({
    inspectionRecords: '++id, date, productId, processId, measurementType, subgroupId, [date+measurementType]'
  });

  // ----- マスタ CRUD -----

  /** マスタ名→テーブル取得 */
  function getTable(tableName) {
    return db[tableName];
  }

  /** マスタ全件取得 */
  function getAll(tableName) {
    return db[tableName].toArray();
  }

  /** マスタ追加 */
  function addItem(tableName, item) {
    return db[tableName].add(item);
  }

  /** マスタ更新 */
  function updateItem(tableName, id, changes) {
    return db[tableName].update(id, changes);
  }

  /** マスタ削除 */
  function deleteItem(tableName, id) {
    return db[tableName].delete(id);
  }

  /** IDで1件取得 */
  function getById(tableName, id) {
    return db[tableName].get(id);
  }

  // ----- 不良記録 クエリ -----

  /** フィルタ付き不良記録取得 */
  function queryDefects(filters) {
    var collection = db.defectRecords.orderBy('date').reverse();

    return collection.toArray().then(function(records) {
      if (!filters) return records;

      return records.filter(function(r) {
        if (filters.dateFrom && r.date < filters.dateFrom) return false;
        if (filters.dateTo && r.date > filters.dateTo) return false;
        if (filters.productId && r.productId !== filters.productId) return false;
        if (filters.processId && r.processId !== filters.processId) return false;
        if (filters.defectTypeId && r.defectTypeId !== filters.defectTypeId) return false;
        if (filters.severity && r.severity !== filters.severity) return false;
        if (filters.status && r.status !== filters.status) return false;
        if (filters.rootCauseId && r.rootCauseId !== filters.rootCauseId) return false;
        return true;
      });
    });
  }

  /** 不良記録追加 */
  function addDefect(record) {
    record.createdAt = new Date().toISOString();
    record.updatedAt = record.createdAt;
    return db.defectRecords.add(record);
  }

  /** 不良記録更新 */
  function updateDefect(id, changes) {
    changes.updatedAt = new Date().toISOString();
    return db.defectRecords.update(id, changes);
  }

  /** 不良記録削除 */
  function deleteDefect(id) {
    return db.defectRecords.delete(id);
  }

  /** 不良記録件数 */
  function countDefects(filters) {
    return queryDefects(filters).then(function(arr) { return arr.length; });
  }

  // ----- 検査データ クエリ -----

  /** フィルタ付き検査データ取得 */
  function queryInspections(filters) {
    return db.inspectionRecords.toArray().then(function(records) {
      if (!filters) return records;

      return records.filter(function(r) {
        if (filters.dateFrom && r.date < filters.dateFrom) return false;
        if (filters.dateTo && r.date > filters.dateTo) return false;
        if (filters.productId && r.productId !== filters.productId) return false;
        if (filters.processId && r.processId !== filters.processId) return false;
        if (filters.measurementType && r.measurementType !== filters.measurementType) return false;
        return true;
      });
    });
  }

  /** 検査データのユニーク測定項目名を取得 */
  function getInspectionTypes() {
    return db.inspectionRecords.orderBy('measurementType').uniqueKeys();
  }

  // ----- データ全体操作 -----

  /** 全データエクスポート */
  function exportAll() {
    return Promise.all([
      db.products.toArray(),
      db.processes.toArray(),
      db.defectTypes.toArray(),
      db.rootCauses.toArray(),
      db.defectRecords.toArray(),
      db.inspectionRecords.toArray()
    ]).then(function(results) {
      return {
        version: 2,
        exportedAt: new Date().toISOString(),
        products: results[0],
        processes: results[1],
        defectTypes: results[2],
        rootCauses: results[3],
        defectRecords: results[4],
        inspectionRecords: results[5]
      };
    });
  }

  /** 全データインポート（既存データクリア後） */
  function importAll(data) {
    return db.transaction('rw', db.products, db.processes, db.defectTypes, db.rootCauses, db.defectRecords, db.inspectionRecords, function() {
      db.products.clear();
      db.processes.clear();
      db.defectTypes.clear();
      db.rootCauses.clear();
      db.defectRecords.clear();
      db.inspectionRecords.clear();

      if (data.products) db.products.bulkAdd(data.products);
      if (data.processes) db.processes.bulkAdd(data.processes);
      if (data.defectTypes) db.defectTypes.bulkAdd(data.defectTypes);
      if (data.rootCauses) db.rootCauses.bulkAdd(data.rootCauses);
      if (data.defectRecords) db.defectRecords.bulkAdd(data.defectRecords);
      if (data.inspectionRecords) db.inspectionRecords.bulkAdd(data.inspectionRecords);
    });
  }

  /** 全データクリア */
  function clearAll() {
    return db.transaction('rw', db.products, db.processes, db.defectTypes, db.rootCauses, db.defectRecords, db.inspectionRecords, function() {
      db.products.clear();
      db.processes.clear();
      db.defectTypes.clear();
      db.rootCauses.clear();
      db.defectRecords.clear();
      db.inspectionRecords.clear();
    });
  }

  // ----- マスタ名前解決キャッシュ -----

  /** マスタをMapとして取得 (id → item) */
  function loadMasterMap(tableName) {
    return db[tableName].toArray().then(function(arr) {
      var map = {};
      arr.forEach(function(item) { map[item.id] = item; });
      return map;
    });
  }

  /** 全マスタMapをまとめて取得 */
  function loadAllMasters() {
    return Promise.all([
      loadMasterMap('products'),
      loadMasterMap('processes'),
      loadMasterMap('defectTypes'),
      loadMasterMap('rootCauses')
    ]).then(function(results) {
      return {
        products: results[0],
        processes: results[1],
        defectTypes: results[2],
        rootCauses: results[3]
      };
    });
  }

  // エクスポート
  app.db = db;
  app.data = {
    getTable: getTable,
    getAll: getAll,
    addItem: addItem,
    updateItem: updateItem,
    deleteItem: deleteItem,
    getById: getById,
    queryDefects: queryDefects,
    addDefect: addDefect,
    updateDefect: updateDefect,
    deleteDefect: deleteDefect,
    countDefects: countDefects,
    queryInspections: queryInspections,
    getInspectionTypes: getInspectionTypes,
    exportAll: exportAll,
    importAll: importAll,
    clearAll: clearAll,
    loadMasterMap: loadMasterMap,
    loadAllMasters: loadAllMasters
  };

})(window.QualityApp);
