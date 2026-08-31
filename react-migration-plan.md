# React UI移行プラン

## 目的

現在のブラウザ UI は `index.html` に HTML、CSS、画面状態、DOM 操作が集約された Vanilla JS SPA である。これを React + TypeScript を用いたコンポーネントベースの UI に移行し、既存機能を保ったまま画面ごとの変更・テスト・拡張を容易にする。

移行対象は UI 層であり、漢字テストの記法・縦書き描画・問題選出・PDF 出力・ローカル/外部 DB のデータアクセス契約は移行初期には変更しない。

## 現状調査

### UI

- エントリポイントは `index.html`。HTML/CSS と ES module のインラインスクリプトが同居している。
- 5 つのタブを同一ページで切り替える SPA になっている。
  - 問題管理
  - 漢字範囲管理
  - テスト生成・印刷
  - 履歴確認
  - 外部 DB 連携
- UI の状態は DOM 要素の値、関数スコープ内の可変変数、`localStorage` に分散している。
- イベント処理、表示更新、Canvas の描画開始、`alert` / `confirm` がインラインスクリプトに直接実装されている。
- CSS も同ファイル内にあり、セレクターが ID と画面固有クラスに強く結び付いている。

### 既存モジュール（再利用する境界）

| 領域 | 既存モジュール | React移行時の扱い |
| --- | --- | --- |
| 記法解析・縦書き | `parser.ts`, `tategaki.ts` | そのまま利用。Canvas コンポーネントから呼び出す |
| ふりがな補助 | `furigana.ts`, `kanjiReadings.ts` | 非同期 UI 操作としてラップする |
| 問題・データセット | `questionStore.ts`, `datasetStore.ts` | Repository API を変更せず hooks 経由で利用 |
| 学習済み漢字・設定 | `learnedKanjiStore.ts`, `settingsStore.ts` | 初期値ロードと変更保存を hooks に集約 |
| 出題・履歴・PDF | `testGenerator.ts`, `testHistoryStore.ts`, `pdfExport.ts` | 画面イベントから呼び出す orchestration を hooks/画面に移す |
| 外部 DB | `remoteConfigStore.ts`, `remoteApiClient.ts` | 既存の local/remote 切替仕様を維持 |

## 採用方針

- React 18 以上 + TypeScript を採用する。
- Vite をブラウザ用ビルドと開発サーバーに採用する。現在の `tsc -p tsconfig.browser.json` と手動コピーを、依存アセットを含む Vite 設定へ置き換える。
- 状態管理ライブラリは初期導入しない。画面ローカル状態は `useState`、取得・保存と再読み込みはカスタム hooks、タブをまたぐ最小限の状態は Context で管理する。
- Canvas 描画は React で再実装せず、`Tategaki` と `renderPageToCanvas()` を呼び出す薄い React コンポーネントに閉じ込める。
- CSS はまず既存見た目を維持するため `src/styles/` に分割して移植する。機能移行とデザイン刷新は別フェーズとする。
- `localStorage` キーと GAS API のリクエスト/レスポンス形式は互換維持する。既存利用者のデータ移行は不要にする。
- 初期表示で必要なのは問題管理画面だけとし、それ以外のタブ画面は `React.lazy` と `Suspense` で分割する。タブへ初めて移動した時点で読み込み、タブボタンの hover/focus 時には先読みできるようにする。
- `pdf-lib` を含む PDF 生成処理と kuromoji を含むふりがな処理は、利用操作時にだけ dynamic import する。Canvas プレビューが PDF ライブラリを巻き込まないよう、現在の `pdfExport.ts` は Canvas 描画モジュールと PDF 生成モジュールに分割する。
- 問題一覧の検索・ラベル解析・Canvas 描画のような重い導出表示は、入力値を `useDeferredValue` で遅延し、`useMemo` と `memo` で不要な再計算・再描画を防ぐ。長い一覧の各行には `content-visibility: auto` を適用する。

## 目標ファイル構成

```text
src/
  main.tsx
  App.tsx
  components/
    AppTabs.tsx
    CanvasPreview.tsx
    QuestionLabel.tsx
    FuriganaToolbar.tsx
    Dialog.tsx
    Notice.tsx
  features/
    questions/QuestionManagementPage.tsx
    kanji/KanjiRangePage.tsx
    tests/TestGenerationPage.tsx
    history/HistoryPage.tsx
    remote/RemoteConfigPage.tsx
  hooks/
    useDatasets.ts
    useQuestions.ts
    useLearnedKanji.ts
    useSettings.ts
    useHistory.ts
    useFurigana.ts
  lib/
    canvasRenderer.ts
    pdfExport.ts
    errors.ts
  styles/
    globals.css
    components.css
    features.css
  # 既存のドメインモジュールは維持
  parser.ts
  tategaki.ts
  questionStore.ts
  ...
```

## 実施手順

### 1. 基盤の追加

1. `react`、`react-dom`、`vite`、React 用 TypeScript 型定義を追加する。
2. `vite.config.ts` を追加し、開発時に `index.html` をエントリにできるようにする。
3. `src/main.tsx` と `src/App.tsx` を追加し、空の React アプリを表示する。
4. タブ画面を `React.lazy` で分割する。初期画面の問題管理以外は初期チャンクから除外し、hover/focus 時の先読み関数を用意する。
5. `pdfExport.ts` を、プレビュー専用の `canvasRenderer.ts` と、`pdf-lib` を依存に持つ PDF 生成専用モジュールに分離する。PDF 生成モジュールは印刷ボタンのイベントハンドラから dynamic import する。
6. kuromoji 本体と辞書の読み込みをふりがなツールバーの初回利用時まで遅延する。辞書ファイルは Vite の静的配信対象として配置し、ビルド後の URL を明示的に設定する。
7. `npm run dev` と `npm run build:browser` を Vite を使う命令に置き換えるか、後方互換の npm script 名として残す。

完了条件: 既存データを消さずに React の空画面が開き、本番ビルド成果物だけで必要な外部アセットを配信できる。初期チャンクに `pdf-lib`・kuromoji・非初期タブが含まれないこともビルド分析で確認する。

### 2. 共通 UI と画面外状態の分離

1. タブ選択を `App` の state に移し、`AppTabs` を作る。
2. 既存 CSS を画面別の CSS ファイルへ移し、React の JSX に必要な `className` だけを付け替える。
3. `alert` / `confirm` とエラー表示を `Dialog` / `Notice` に置き換える。削除などの確認操作はアクセシブルなモーダルに統一する。
4. `useDatasets`、`useQuestions`、`useHistory` を作り、ロード中・保存中・失敗・再読み込みを統一して扱う。独立して取得できる初期データは `Promise.all()` で並列取得し、直列ウォーターフォールを作らない。
5. リモート API の失敗を各画面で握りつぶさず、ユーザーが再試行できるエラー表示にする。

完了条件: React のタブ切替、共通の通知・確認 UI、非同期ロード状態があり、既存 API の例外が画面上で扱える。

### 3. 問題管理画面の移行

1. `QuestionManagementPage` を作り、問題一覧・検索・データセット絞り込み・編集フォームを JSX 化する。
2. 編集中の `text`、`weight`、`datasetId`、選択中問題 ID を React state にする。
3. 記法エラー、同一データセット内の重複警告、保存・削除を `useQuestions` 経由に移す。
4. `QuestionLabel` で `parse()` の結果を安全に描画し、現在の色分けとツールチップを維持する。
5. ふりがな機能は `FuriganaToolbar` に分離し、選択範囲・処理中状態・失敗を管理する。
6. 既存キーボード操作（保存、新規、一覧の上下選択・編集・削除）を明文化して同等に実装する。
7. `CanvasPreview` を使い、入力に応じて問題プレビューを再描画する。
8. `CanvasPreview` は `memo` 化し、Canvas への描画は入力内容・描画設定が変化した場合にだけ effect 内で実行する。検索語や通知の更新では再描画しない。

完了条件: CRUD、データセット操作、検索、プレビュー、ふりがな補助、キーボード操作が現行と同等に動く。

### 4. 漢字範囲管理画面の移行

1. `useLearnedKanji` に `loadLearnedKanjiState`、追加・削除・学年変更・進級を集約する。
2. `KanjiRangePage` で学年選択、進級確認、学年別漢字リストを JSX 化する。
3. 現学年・既習・未習の表示状態をデータから導出し、DOM の直接書換えをなくす。

完了条件: 学年と既習漢字が再読み込み後も保持され、現在のクリック操作と進級フローを再現できる。

### 5. テスト生成・PDF画面の移行

1. 設定フォームを controlled components にし、変更時に `settingsStore` へ保存する。
2. データセット選択、検索、手動選択、ランダム選出を `TestGenerationPage` に移す。
   - 検索語には `useDeferredValue` を使い、フィルタ結果を `useMemo` で導出する。大量の問題がある場合でも入力欄の反応を優先する。
   - 問題一覧の行は安定した `key` を使う memoized component に分け、CSS の `content-visibility: auto` と `contain-intrinsic-size` を設定する。
3. 選出済み問題と警告を React state として保持し、`selectQuestions` / `assignColumns` / `promoteAdjacentWriteKanji` は既存実装を呼び出す。
4. `CanvasPreview` で A4 比率のプレビューを表示する。
5. PDF 出力の「履歴記録 → ラベル生成 → PDF生成 → 新規タブ表示」を `exportTest` のユースケース関数にまとめる。

完了条件: ランダム生成・手動編集・設定保存・プレビュー・PDF 出力が現行仕様と同じ結果になる。

### 6. 履歴・外部 DB 連携画面の移行

1. `HistoryPage` に一覧、削除確認、解答表示、再印刷を実装する。
2. 履歴から問題を解決できない場合の警告と、解答 Canvas の描画を現在と同じ仕様にする。
3. `RemoteConfigPage` に URL・トークン編集、現在の接続モード、ローカル復帰を実装する。
4. 接続先変更後は現在どおりページ再読み込みを行うか、Repository キャッシュ破棄と各 hook の再取得に変更する。後者は互換テスト後に採用する。

完了条件: 履歴確認/削除/再印刷と、ローカル・GAS の切替が利用できる。

### 7. 検証と切替

1. parser、問題選出、進級、履歴、PDF 用のユニットテストを追加する。ランダム選出は乱数注入または性質ベースの検証にして不安定化を避ける。
2. Playwright 等で主要フローの E2E テストを追加する。
3. `localStorage` の既存データを持つブラウザプロファイルで回帰確認する。
4. ローカル保存と GAS 接続の両方で CRUD・データセット・PDF を確認する。
5. 旧インライン UI を削除するのは、全タブの E2E テストとビルド成果物での動作確認が終わった後に限定する。
6. ビルド結果を確認し、初期ロード時に PDF/ふりがな用の大きな依存が読み込まれないこと、タブ遷移・印刷・ふりがな利用時に必要なチャンクだけが読み込まれることを検証する。

## 受け入れ基準

- 既存の `localStorage` データを変更・消失させずに表示・編集できる。
- 5 タブの全機能、キーボード操作、Canvas プレビュー、PDF 出力、GAS 接続を維持する。
- DOM の ID を直接検索して状態を更新する実装を React UI 層から排除する。
- ドメインモジュールを React コンポーネントへ埋め込まず、既存の公開 API を維持する。
- `npm run dev && npm run build:browser` が成功する。
- 本番ビルドを静的ホスティングした環境で PDF とふりがな機能を利用できる。
- 初期表示では非初期タブ、`pdf-lib`、kuromoji 辞書を読み込まず、各機能の初回操作で正常に遅延読込できる。
- 検索入力や非表示領域の状態変更で、Canvas プレビューや大量の一覧を不要に再描画しない。

## リスクと対応

| リスク | 対応 |
| --- | --- |
| kuromoji の辞書パスがビルド後に変わる | 静的アセットの配置を最初の基盤フェーズで検証し、E2E でふりがな生成を確認する |
| Canvas の見た目が変わる | 描画処理は既存モジュールを再利用し、プレビューサイズだけを React 側で管理する |
| LocalStorage の既存データを読めなくする | ストレージキーとデータ形式を維持し、実データを使った回帰確認を行う |
| 非同期の外部 DB が UI を不整合にする | hook 内で保存中状態、例外、再読み込みを一元管理する |
| 一括移行で回帰範囲が大きくなる | 問題管理→漢字範囲→生成→履歴/連携の順に、画面単位で段階導入する |
| React 化で初期ロードが重くなる | タブ、PDF、ふりがなを機能単位で遅延読込し、ビルド結果でチャンクを確認する |
| 入力中に検索・Canvas が重くなる | 検索は deferred value、導出結果は memo、Canvas は独立した memoized component にする |
| 将来の保存形式変更で既存データを壊す | 今回は既存キーを維持する。保存形式のバージョニングは、明示的な移行関数と既存キーからの一回限りの移行を含む別フェーズで行う |

## スコープ外（別途判断）

- デザインシステムの全面刷新、モバイル向けレイアウト再設計
- 状態管理ライブラリ、ルーター、サーバーサイドレンダリングの導入
- GAS API 契約やデータモデルの変更
- 縦書きエンジン・PDF レイアウト・出題アルゴリズムの仕様変更
