# 問題管理機能の改善 — 作業進捗

計画: `/Users/bi882193/.claude/plans/rippling-meandering-unicorn.md`

## サブタスク

- [x] 1. 学年の可視化(questionGrade切り出し + 一覧バッジ)
- [x] 2. 重複防止(findDuplicate + 警告UI)
- [x] 3. 出題対象文字の色分け表示(segmentベースのDOM構築 + 凡例)

全サブタスク完了。Playwrightで問題管理タブを操作し、学年バッジ・重複警告・色分け表示が
すべて意図通り動作することを目視確認済み。

## ログ

- 2026-08-23: 調査・計画完了。ワークツリー `mondai-kanri-improve` で作業開始。
- 2026-08-23: サブタスク1完了。`testGenerator.ts` の private `questionGrade` を `questionStore.ts` に
  `questionGrade(text): Grade | null` として切り出し、一覧に学年バッジ(既知=緑/不明=グレー)を追加。
  `npm run build:browser` 成功。
- 2026-08-23: サブタスク2完了。`questionStore.ts` に `findDuplicate(text, excludeId?)` を追加。
  記法テキスト完全一致(trim後、weightは無視)で判定。エディタ入力中はリアルタイム警告バー
  (`#q-duplicate-bar`、amber系)を非ブロッキングで表示、保存時は `confirm()` で最終確認。
  `npm run build:browser` 成功。
- 2026-08-23: サブタスク3完了。一覧の `plainText()` 文字列表示を `parse(text).segments` ベースの
  DOM構築(`buildQuestionLabel`)に変更し、書き取り(青/実線)・読み取り(アンバー/点線)・
  送り仮名(紫/破線)を背景色+文字色+下線パターン+ツールチップの4チャンネルで色分け。
  静的な凡例(`.q-legend`)を一覧上部に追加。`npm run build:browser` 成功。Playwrightで
  問題管理タブを実際に操作し、3機能すべてが意図通り表示・動作することをスクリーンショットで確認。
