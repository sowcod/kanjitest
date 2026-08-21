# 漢字テスト自動生成アプリ 実装プラン

vision.md に基づき、未実装の4機能（問題管理・漢字範囲管理・テスト自動生成・印刷）を実装する。
このドキュメントには、vision.md に明記されていない事項について実装時に判断した内容を記録する。

---

## 全体アーキテクチャ

- 既存の `src/parser.ts`（記法パーサー）・`src/tategaki.ts`（縦書き描画エンジン）はそのまま再利用する。
- 新規モジュールはすべて `src/` 配下に追加し、`tsconfig.browser.json` の `include` に加えてブラウザ向けにビルドする（既存の `dev`/`build:browser` 運用を継続）。
- UIは `app.html` を新規作成し、`editor.html` のCanvas+DPRパターンを流用する。タブ切り替えで「問題管理」「漢字範囲管理」「テスト生成・印刷」の3画面を提供する（SPA、ルーティングなし）。
- データはすべて `localStorage` に保存する（vision.md の設計方針どおり）。

---

## データモデル

```ts
interface Question {
  id: string;
  text: string;       // 記法テキスト。1問 = 1列（改行を含まない）
  weight: 1 | 2;       // 1 = 通常の1問, 2 = 「2問相当」の長め問題（列を単独で占有）
  createdAt: string;   // ISO日時
  updatedAt: string;
}

interface LearnedKanjiState {
  currentGrade: number;      // 1〜6
  learnedThisGrade: string[]; // 現学年で都度追加登録した漢字
}

interface TestHistoryEntry {
  date: string;          // ISO日時（生成日時）
  questionIds: string[];
}
```

「習った漢字」の全体集合 = `GRADE_KANJI[1] ∪ ... ∪ GRADE_KANJI[currentGrade - 1] ∪ learnedThisGrade`
（下の学年は学年配当表の全字を既習とみなし、現学年分のみ都度登録した分を追加する）

---

## 1. 漢字範囲管理機能

### 決定事項
- 学年別漢字配当表は **2020年度改訂版（1026字、学年ごと 80/160/200/202/193/191字）** を採用する。
  出典: Wikipedia「学年別漢字配当表」記事（文部科学省告示の学習指導要領別表に基づく）。文字数・重複なしを検証済み。
- 学年が上がった時の運用（vision.md未記載）: 「学年を進める」操作を用意する。学年を1つ進めると、それまでの `learnedThisGrade` は用済みになる（次の学年からは新しい学年の配当表が「下の学年」に含まれるため、個別追跡は不要になる）。年度が変わるタイミングで年1回操作する想定。
- 表示用に固定リストは学年ごとに読み取り専用で一覧表示し、チェック済み（=`learnedThisGrade`に含まれる or 下位学年で自動既習）を視覚的に区別する。

### ファイル
- `src/kanjiData.ts`: `GRADE_KANJI: Record<1|2|3|4|5|6, string[]>` と `kanjiGrade(char): number | null`、`isKanji(char): boolean` をエクスポート。

---

## 2. 問題管理機能

### 決定事項
- **1問 = 1つの記法テキスト（改行なし、`fillText` に渡す1列分）**。既存の `parser.ts`/`tategaki.ts` の単位と一致させる。
- vision.md の「今後作るべき機能」セクションでは **入力補助（記法スニペット挿入）は取消線付きで「→次フェーズ」と明記されており、今回は実装しない**（要件セクションには「必要」と書かれているが、実装計画セクションの記述を優先し意図的にスコープ外とした）。
- 出題対象漢字／文中漢字の自動抽出（重複回避チェックに使用）:
  - `targetKanji(text)`: `writeBox`・`bracketBox` セグメントの `char`（テスト時に隠れる＝出題対象）のうち漢字のみ
  - `bodyKanji(text)`: `normal`・`readBox` セグメントの `char`（常に印刷される＝文脈上見える）のうち漢字のみ
  - `readBox` は漢字自体は常に印刷されるため `bodyKanji` に含める（出題対象は「読み」であって漢字の字形自体は隠されないため）
- 一覧のキーボード操作: `Cmd/Ctrl+Enter` で保存（新規/更新兼用）、一覧にフォーカス中は `↑`/`↓` で選択移動、`Enter` で編集読み込み、`Cmd/Ctrl+Backspace` で削除（確認ダイアログあり）。マウスなしで全操作完結できるようにする。
- 保存先: `localStorage` キー `kanji-test-questions`。

### ファイル
- `src/questionStore.ts`: CRUD（`listQuestions`/`saveQuestion`/`deleteQuestion`）＋ `targetKanji`/`bodyKanji`/`allKanji` 抽出関数

---

## 3. テスト自動生成機能

### 決定事項（vision.md「未決定事項」への回答）

**学年バランスの頻度** → 既定値: 下位学年からの出題は10問（weight単位）中 **20%（=2問相当）**。設定UIで変更可能にする（`localStorage` 設定 `kanji-test-settings.reviewRatio`）。

**「同じ問題が出ないようにする」の判定ロジック** → 直近 **10回** のテスト履歴（`testHistoryStore`）を見て、出現回数が多い問題ほど選ばれにくくする**ソフトな重み付け**（除外はしない。除外だと問題不足時にテストが作れなくなるため）。スコア = `1 / (1 + 直近10回での出現回数)` を選出確率の重みとする。

**列バランス調整アルゴリズム** → 選出した10問（weight単位）を `Tategaki.measureText()` で高さ計測し、**降順にソートして最大×最小のペアを作る**（スワップペアリング）ことで5列の合計高さの分散を最小化する。weight=2の問題は単独で1列を占有するため、先に列に割り当て、残りをweight=1の問題でペアリングする。

**「2問相当」の記入欄（vision.md 本文中の言及、未決定事項には明記なし）** → `Question.weight` フィールド（1 or 2）で表現する。テスト生成時は「10問」ではなく「重みの合計が10になるよう」選出し、weight=2の問題は列を単独で占有する。

### 選出アルゴリズム
1. 候補フィルタ: `allKanji(text) ⊆ 習った漢字集合` の問題のみを候補とする（vision.mdルール1）
2. 候補を現学年プール（targetKanjiの最大学年 == 現学年）と下位学年プールに分割
3. 履歴重み付けでシャッフルした順に、重み合計が10になるまで貪欲に選出。追加時に他の選出済み問題との `targetKanji(A) ∩ bodyKanji(B) ≠ ∅` 重複があれば一旦スキップ（vision.mdルール2）
4. 重み合計が10に届かない場合、ルール2の重複チェックを緩めて再度貪欲選出（「できるだけ」の弱いルールのため強制はしない）
5. それでも10に届かない場合は警告（「問題不足」）を出しつつ、選出可能な分だけで生成する
6. 同一問題の重複選出は、候補から選出済みidを除外することで自動的に防止される（vision.mdルール3）

### ファイル
- `src/testHistoryStore.ts`: 履歴の保存・読み込み
- `src/testGenerator.ts`: 選出ロジック（`selectQuestions`）＋ 列バランスロジック（`assignColumns`）

---

## 4. 印刷機能

### 決定事項
- 既存の `Tategaki.showAnswer` オプション（実装済み・解答は朱色）を使い、`renderPageToCanvas(columns, showAnswer, font, ...)` でテスト用（`showAnswer:false`）・解答表示用（`showAnswer:true`）のいずれのCanvasも生成できる共通関数として設計する。
- 生成したCanvasは `toDataURL('image/png')` でPNG化し、`pdf-lib` で **A4サイズ・1ページ（テスト用紙のみ）のPDF** に画像として埋め込む。
  - 理由: 縦書き描画ロジック（Tategaki）をそのまま再利用でき、pdf-lib自体のテキスト描画APIで縦書きを再実装するコストを避けられるため。vision.mdの「既存のpdf-libを活用する」は、テキスト描画APIではなく画像埋め込みAPIとしての活用と解釈した。
  - トレードオフ: PDF内のテキストは選択・検索不可（画像化のため）。印刷用途のみなら問題ない。
- **【変更】紙を節約するため、解答ページはPDFに含めない（印刷しない）**。答え合わせは画面上の「5. テスト履歴の閲覧機能」で行う。当初は2ページ（テスト／解答）構成だったが、vision.mdの方針変更（2026年時点）を受けて1ページ構成に変更した。
- 生成したPDFは `Blob` として `window.open()` で新しいタブに開く。ブラウザ標準のPDFビューアの印刷ボタンで印刷する。
  - 「ワンクリックで印刷」は、ブラウザの技術的制約（JSから直接プリンタダイアログを開くことは可能だが、印刷対象の選択などはブラウザ/OS側のネイティブUIに委ねられる）を踏まえ、「生成ボタン1回でPDFが開き、即印刷できる状態になる」という解釈で実装する。
- **印刷物と画面上の解答表示との紐付け方法**: 新しい識別子（IDフィールド等）は追加せず、既存の `TestHistoryEntry.date`（ISO日時、テスト生成＝記録時に決まる一意な値）をそのまま識別子として再利用する。
  - `testHistoryStore.formatTestLabel(dateIso)` で `YYYY/MM/DD HH:mm`（分単位）の表示用ラベルに変換し、これを **PDFページ右下に薄いグレーの小さな文字で印字**（`pdfExport.stampLabel`）。同じラベルを履歴確認タブの一覧表示にも使うことで、印刷物と画面表示の対応付けが一目でできるようにした。
  - `recordTest()` は記録した `TestHistoryEntry` を返すよう変更し（元は `void`）、生成直後の `entry.date` からラベルを作ってPDFに渡せるようにした。
  - 秒単位まで一意にする必要はない（同じ分に2回テストを生成する運用は想定しない）ため、分単位の表示で十分と判断した。

### ファイル
- `src/pdfExport.ts`: Canvas → PNG → PDF（`pdf-lib`）変換。レイアウト描画部分（`renderPageToCanvas`）は画面プレビュー（`app.html`のテスト生成タブ・履歴確認タブ）とPDF出力（300dpi相当）の3箇所から共通で呼び出す設計にし、プレビュー・履歴表示・実際の印刷結果がズレないようにした。`generateTestPdf(columns, font, label)` は1ページのみ生成し、`label` をページ右下に印字する。

---

## 5. テスト履歴の閲覧機能

### 決定事項
- 過去のテストのレイアウト（列構成）自体は保存しない。`TestHistoryEntry.questionIds`（フラットなID配列、列に割り当てる前の選出順）のみを保存し、閲覧時に `getQuestion(id)` で問題データを引き直してから **`assignColumns()` を再実行して列レイアウトを再構築**する。
  - これが可能な理由: `assignColumns` は問題の `text`（＝測定される高さ）に基づき降順ソートしてペアリングする決定的なロジックであり、入力配列の順序に依存しない（`kanji-app-plan.md` 3節参照）。そのため、元のテスト生成時と履歴閲覧時で `settings.slotsPerColumn` が変わっていない限り、同じ列構成が再現される。
  - メリット: レイアウト情報の二重管理を避けられる（保存データは常に「どの問題が出たか」のみで済む）。
- 問題が削除されている場合（`getQuestion` が `null` を返す場合）は、その問題をスキップして残りの問題だけでレイアウトを再構築し、警告文（`${n}問は削除済みのため表示できません`）を表示する。全問削除済みの場合は「表示できません」というメッセージのみ表示する。
- 履歴一覧は新しい順（`loadHistory()` の逆順）に表示し、各行に `formatTestLabel(entry.date)` と問題数を表示する。選択すると右側のプレビューに `showAnswer:true`（朱色）で表示する — これが画面上の答え合わせに使う唯一のビューになる。

### ファイル
- `app.html`: 新規タブ「履歴確認」（`#tab-history`）。履歴一覧（`#h-list`）とプレビュー（`#h-preview`、`renderPageToCanvas(..., true, ...)` を使用）で構成。

---

## ファイル構成まとめ

| ファイル | 状態 |
|---|---|
| `src/kanjiData.ts` | 新規 |
| `src/questionStore.ts` | 新規 |
| `src/learnedKanjiStore.ts` | 新規 |
| `src/testHistoryStore.ts` | 新規 |
| `src/testGenerator.ts` | 新規 |
| `src/pdfExport.ts` | 新規 |
| `src/settingsStore.ts` | 新規（reviewRatio等の設定） |
| `app.html` | 新規（メインUI） |
| `tsconfig.browser.json` | 更新（includeに新規ts追加） |

---

## テスト方法

- `npm run build:browser` でコンパイルエラーがないことを確認
- webapp-testing skill / ブラウザ操作で `app.html` を実際に操作し、以下を確認:
  - 問題の登録・編集・削除・プレビュー
  - 漢字範囲の学年設定・追加登録
  - テスト生成 → 5列レイアウトのプレビュー表示
  - PDF生成 → 新しいタブで開く・テスト/解答の2ページが正しく表示される

---

## ステータス

- [x] `src/kanjiData.ts`
- [x] `src/questionStore.ts`
- [x] `src/learnedKanjiStore.ts`
- [x] `src/settingsStore.ts`
- [x] `src/testHistoryStore.ts`
- [x] `src/testGenerator.ts`
- [x] `src/pdfExport.ts`
- [x] `app.html`
- [x] `tsconfig.browser.json` 更新
- [x] `npm run build:browser` 確認
- [x] ブラウザ動作確認(Playwrightで実ブラウザ操作を検証。問題CRUD・キーボード操作・漢字範囲登録・テスト生成・PDF出力(2ページ・`%PDF`ヘッダ確認)まで動作確認済み)
- [x] 印刷はテスト用紙(1ページ)のみに変更・生成日時ラベルの印字(`stampLabel`)
- [x] `src/testHistoryStore.ts`: `recordTest`がエントリを返すよう変更・`formatTestLabel`追加
- [x] 履歴確認タブ(`app.html`): 履歴一覧・解答(朱色)プレビューの実装
- [x] `npm run build:browser`・`npm run dev` 再確認(コンパイルエラーなし)
- [x] ブラウザ動作確認(Playwright): PDFが1ページのみになったこと・ラベル印字・履歴一覧表示・履歴からの解答表示(赤字)まで確認済み
