# CLAUDE.md - 品質管理ダッシュボード

## プロジェクト概要

製造業（20〜100名規模）向けの品質管理ツール。品質不良データの記録・蓄積とQC7つ道具による分析を、サーバー不要のブラウザアプリで実現する。コンサルティング提案用デモツールとしても機能する。

**言語**: 日本語（UI・ドキュメントすべて日本語）

## アーキテクチャ

### 技術スタック
- Vanilla JavaScript (ES6+), IIFEパターン
- Dexie.js v4 (CDN) → IndexedDB によるクライアントサイドDB
- Chart.js v4 (CDN) + chartjs-plugin-annotation
- Noto Sans JP (Google Fonts)

### 共有名前空間パターン
全モジュールは `window.QualityApp` オブジェクトを共有:
```javascript
window.QualityApp = window.QualityApp || {};
(function(app) {
  "use strict";
  // モジュール実装
  app.moduleName = { init: init, ... };
})(window.QualityApp);
```

### ファイル構成
```
品質管理/
├── index.html          # SPA（タブ切替式）
├── styles.css          # ダークテーマ、レスポンシブ
├── js/
│   ├── utils.js        # 定数・統計関数・ヘルパー（最初にロード）
│   ├── db.js           # Dexie.js DBスキーマ・CRUD
│   ├── masters.js      # マスタ管理（製品/工程/不良種別/原因）
│   ├── records.js      # 不良記録 入力・一覧
│   ├── dashboard.js    # ダッシュボード・KPI
│   ├── charts/
│   │   ├── pareto.js   # パレート図
│   │   ├── histogram.js # ヒストグラム
│   │   ├── control-chart.js # 管理図（np/p/X管理図）
│   │   └── scatter.js  # 散布図
│   ├── export.js       # CSV/JSONエクスポート・インポート
│   └── app.js          # メインブート・タブルーター・デモデータ（最後にロード）
├── skills/
│   ├── ishikawa/SKILL.md       # 特性要因図スキル
│   ├── root-cause/SKILL.md     # 根本原因分析スキル
│   └── monthly-report/SKILL.md # 月次品質レポートスキル
├── CLAUDE.md
└── README.md
```

### データモデル

**IndexedDBテーブル** (Dexie.js):
- `defectRecords` - 不良記録（メインデータ）
- `products` - 製品マスタ
- `processes` - 工程マスタ
- `defectTypes` - 不良種別マスタ
- `rootCauses` - 原因マスタ（4M分類付き）
- `settings` - アプリ設定

### 主要コンポーネント

**タブ構成**: ダッシュボード / 不良記録 / マスタ管理 / パレート図 / ヒストグラム / 管理図 / 散布図 / データ出力

**データフロー**:
1. マスタデータを登録（または「デモデータ投入」）
2. 不良記録を入力 → IndexedDBに保存
3. 各QCツールタブでフィルタ→描画で分析
4. データ出力タブでCSV/JSONエクスポート
5. スキル連携用JSONをクリップボードにコピー → Claude Codeスキルで深い分析

## 開発コマンド

```bash
open 品質管理/index.html  # macOS でブラウザ起動
# または
python3 -m http.server 8000  # ローカルサーバー
```

## コーディング規約

- 純粋なVanilla JavaScript、フレームワーク不使用
- IIFEパターン + `window.QualityApp` 名前空間
- ユーザー向け文字列はすべて日本語
- CSSカスタムプロパティでテーマ管理（ダークテーマ）

## 外部依存関係

- **Dexie.js** v4.0.11: IndexedDB ラッパー（CDN）
- **Chart.js** v4.4.7: グラフ描画（CDN）
- **chartjs-plugin-annotation** v3.1.0: 管理図のUCL/LCL線（CDN）
- **Google Fonts**: Noto Sans JP

## 重要な注意事項

- `file://` プロトコルでもIndexedDBは動作するが、一部ブラウザで制限あり
- デモデータ投入は既存データをクリアして再生成する（confirm確認あり）
- マスタ変更時は `app.onMasterChanged()` で全ドロップダウンを再構築
- データインポート後は `app.onDataReloaded()` で全モジュールを再初期化
