# 出題ロジックの説明性・予測性を上げる — ロードマップ

## 背景

問題生成画面（`TestGenerationPage`）の現状機能を洗い出した際、想定ユーザー（自分の子ども1〜数人専用に使う開発者自身）の悩みとして以下が挙がった:

- 悩み#1: なぜこの問題が選ばれたのか不透明
- 悩み#6: 読み・送り仮名の内訳が事前にわからない
- 悩み#7: 同じ漢字が続けて出ている気がするが、実際の出題頻度が見えない
- 悩み#9: 印刷前に何ページになるか知りたい

これらへの対応として「出題ロジックの説明性・予測性を上げる」を今期のゴールとして合意した。

このうち、ユーザー個別の要望だった「受験対策用の同音異義語問題を手動固定+自動補完で混ぜる」機能（`selectQuestions`の`preSelected`パラメータ、`testGenerator.ts`）は実装済み。以下の①〜④は**未実装**で、次回以降のセッションで着手する。

## ① 選定理由の可視化（悩み#1）

- **問題**: ランダム生成された各問題が「復習(下位学年)/現学年/読み問題/送り仮名問題/手動固定」のどの理由で選ばれたかが見えない。
- **解決の方向性**: `selectQuestions`（`src/testGenerator.ts`）は内部で既にreview/current/read/okuriganaの各プールに分けて選出している（`reviewPool`/`currentPool`/`readPool`/`okuriganaPool`、L188-234付近）。この分類情報を`SelectionResult`に含めて返すよう拡張する（例: `selected: Question[]`だけでなく`{ question: Question, reason: 'review' | 'current' | 'read' | 'okurigana' | 'preSelected' }[]`）。UI側（`TestGenerationPage.tsx`）は既存の「自動」バッジ（`lastAutoSelectedIds`）の隣、または代わりに、この理由を表示する。

## ② 出題内訳の事前確認（悩み#6）

- **問題**: `readRatio`/`okuriganaRatio`/`reviewRatio`は比率入力のみで、生成後に実際何問になったかがわかりにくい。
- **解決の方向性**: ①の理由ラベルを問題ごとに持てば、`selectedQuestions`から`reason`別に集計するだけで内訳カウントが作れる。「問題を選ぶ(x/y)」ヘッダー（`TestGenerationPage.tsx`の`t-select-header`）の近くに「書き問題n・読み問題n・送り仮名問題n・下位学年復習n」のような内訳表示を追加する。

## ③ 出題頻度の可視化（悩み#7）

- **問題**: `recentHistoryCount`による直近重複回避（`countRecentUses`、`src/testHistoryStore.ts`）はあるが、どの問題がどれくらいの頻度で出ているかをユーザーが見る手段がない。
- **解決の方向性**: 問題一覧に「直近n回中m回出題」のようなバッジを表示する。データは`countRecentUses`が既に持っているので、表示だけの追加になる可能性が高い。要調査。

## ④ ページ数の事前見積り（悩み#9）

- **問題**: `assignColumns`（`src/testGenerator.ts`）による列の詰め込み結果はプレビューを見るまでわからない。
- **解決の方向性**: `TestPreview`が既に`currentColumns`を計算している（`TestGenerationPage.tsx`の`currentColumns` useMemo）ので、列数から1ページあたりの列数（`canvasRenderer.ts`のレイアウト定数）を基に何ページになるかをヘッダー付近に表示するだけで対応できる可能性が高い。要調査。

## 関連

- `vision.md` — 問題選出のルール（ルール1〜4）の定義
- `src/testGenerator.ts` — `selectQuestions`（選出ロジック本体）、`assignColumns`（レイアウト）
- `src/features/tests/TestGenerationPage.tsx` — 問題生成画面のUI
