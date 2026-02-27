/**
 * 品質管理アプリ - ユーティリティ・定数
 */
window.QualityApp = window.QualityApp || {};

(function(app) {
  "use strict";

  /** 重大度ラベルと対応CSSクラス */
  const SEVERITY = {
    '重大': { label: '重大', cls: 'badge-critical', order: 0 },
    '重度': { label: '重度', cls: 'badge-major', order: 1 },
    '軽度': { label: '軽度', cls: 'badge-minor', order: 2 },
    '軽微': { label: '軽微', cls: 'badge-trivial', order: 3 },
  };

  /** 状態ラベルと対応CSSクラス */
  const STATUS = {
    '未対応': { label: '未対応', cls: 'badge-open' },
    '対応中': { label: '対応中', cls: 'badge-progress' },
    '完了':   { label: '完了',   cls: 'badge-done' },
  };

  /** 4M分類ラベルと対応CSSクラス */
  const CATEGORY_4M = {
    '人':   { label: '人 (Man)',         cls: 'badge-man' },
    '機械': { label: '機械 (Machine)',   cls: 'badge-machine' },
    '材料': { label: '材料 (Material)',  cls: 'badge-material' },
    '方法': { label: '方法 (Method)',    cls: 'badge-method' },
  };

  /** 検出方法 */
  const DETECTION_METHODS = ['目視', '測定', '試験', '顧客指摘'];

  /** 今日の日付をYYYY-MM-DD形式で返す */
  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  /** 現在時刻をHH:MM形式で返す */
  function nowTime() {
    return new Date().toTimeString().slice(0, 5);
  }

  /** 日付文字列を短い表示形式(M/D)に変換 */
  function shortDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return (d.getMonth() + 1) + '/' + d.getDate();
  }

  /** 日付文字列をYYYY/MM/DD形式に変換 */
  function formatDate(dateStr) {
    if (!dateStr) return '';
    return dateStr.replace(/-/g, '/');
  }

  /** N日前の日付をYYYY-MM-DD形式で返す */
  function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }

  /** 今月の初日をYYYY-MM-DD形式で返す */
  function monthStart() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
  }

  /** バッジHTMLを生成 */
  function badgeHtml(text, cls) {
    return '<span class="badge ' + cls + '">' + escHtml(text) + '</span>';
  }

  /** 重大度バッジ */
  function severityBadge(severity) {
    const s = SEVERITY[severity];
    return s ? badgeHtml(s.label, s.cls) : escHtml(severity || '');
  }

  /** 状態バッジ */
  function statusBadge(status) {
    const s = STATUS[status];
    return s ? badgeHtml(s.label, s.cls) : escHtml(status || '');
  }

  /** 4Mバッジ */
  function category4mBadge(cat) {
    const c = CATEGORY_4M[cat];
    return c ? badgeHtml(c.label, c.cls) : escHtml(cat || '');
  }

  /** HTMLエスケープ */
  function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** 数値を小数N桁で四捨五入 */
  function round(num, decimals) {
    if (decimals === undefined) decimals = 2;
    const f = Math.pow(10, decimals);
    return Math.round(num * f) / f;
  }

  /** 平均値 */
  function mean(arr) {
    if (!arr.length) return 0;
    return arr.reduce(function(a, b) { return a + b; }, 0) / arr.length;
  }

  /** 標準偏差（不偏） */
  function stddev(arr) {
    if (arr.length < 2) return 0;
    var m = mean(arr);
    var variance = arr.reduce(function(sum, v) { return sum + (v - m) * (v - m); }, 0) / (arr.length - 1);
    return Math.sqrt(variance);
  }

  /** 中央値 */
  function median(arr) {
    if (!arr.length) return 0;
    var sorted = arr.slice().sort(function(a, b) { return a - b; });
    var mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  /** 相関係数 */
  function correlationCoefficient(xs, ys) {
    var n = xs.length;
    if (n < 2) return 0;
    var mx = mean(xs), my = mean(ys);
    var num = 0, dx2 = 0, dy2 = 0;
    for (var i = 0; i < n; i++) {
      var dx = xs[i] - mx, dy = ys[i] - my;
      num += dx * dy;
      dx2 += dx * dx;
      dy2 += dy * dy;
    }
    var denom = Math.sqrt(dx2 * dy2);
    return denom === 0 ? 0 : num / denom;
  }

  /** 線形回帰 y = a + bx */
  function linearRegression(xs, ys) {
    var n = xs.length;
    if (n < 2) return { a: 0, b: 0 };
    var mx = mean(xs), my = mean(ys);
    var num = 0, den = 0;
    for (var i = 0; i < n; i++) {
      num += (xs[i] - mx) * (ys[i] - my);
      den += (xs[i] - mx) * (xs[i] - mx);
    }
    var b = den === 0 ? 0 : num / den;
    var a = my - b * mx;
    return { a: a, b: b };
  }

  /** Chart.jsの色パレット */
  const CHART_COLORS = [
    '#4c8bf5', '#34d399', '#f59e0b', '#ef4444', '#8b5cf6',
    '#06b6d4', '#f97316', '#ec4899', '#14b8a6', '#a855f7',
    '#6366f1', '#84cc16', '#e11d48', '#0ea5e9', '#d946ef'
  ];

  // エクスポート
  app.utils = {
    SEVERITY: SEVERITY,
    STATUS: STATUS,
    CATEGORY_4M: CATEGORY_4M,
    DETECTION_METHODS: DETECTION_METHODS,
    CHART_COLORS: CHART_COLORS,
    today: today,
    nowTime: nowTime,
    shortDate: shortDate,
    formatDate: formatDate,
    daysAgo: daysAgo,
    monthStart: monthStart,
    badgeHtml: badgeHtml,
    severityBadge: severityBadge,
    statusBadge: statusBadge,
    category4mBadge: category4mBadge,
    escHtml: escHtml,
    round: round,
    mean: mean,
    stddev: stddev,
    median: median,
    correlationCoefficient: correlationCoefficient,
    linearRegression: linearRegression,
  };

})(window.QualityApp);
