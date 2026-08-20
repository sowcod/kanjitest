# 縦書きエディタ (editor.html) 実装プラン

## 概要

`parser.ts` と `tategaki.ts` をブラウザで利用し、テキスト入力をリアルタイムに縦書きプレビューする
スタンドアロンのHTMLエディタを作成する。

- **出力物**: `editor.html`（`dist/` の JS を `<script type="module">` で読み込む別ファイル構成）
- **フレームワーク**: なし（Vanilla JS）
- **フォント**: 游教科書体（Mac 専用、埋め込みなし）
- **今回のスコープ**: プレビュー機能のみ
- **ビルド形式**: ES Module（`type="module"`）
- **Canvas サイズ**: `ResizeObserver` でウィンドウ幅に合わせて動的に調整

---

## レイアウト

```
┌─────────────────────────────────────────┐
│ テキストエリア（横書き入力）               │
├─────────────────────────────────────────┤
│ ツールバー（将来拡張用プレースホルダー）    │
├─────────────────────────────────────────┤
│ Canvas プレビュー（縦書き）               │
└─────────────────────────────────────────┘
```

---

## サブタスク

### 1. parser.ts / tategaki.ts をブラウザ用にビルドする

**Intent**  
現在は Node.js (CommonJS) 向けにビルドされている。ブラウザの `<script src>` で読み込めるよう、
ES Module または IIFE 形式に出力するビルド設定を追加する。

**Expected Outcomes**
- `dist/parser.js` と `dist/tategaki.js` がブラウザで読み込み可能な形式で出力される
- `tategaki.js` 内の Node.js 固有 API (`@napi-rs/canvas` 等) への依存がない
  （`tategaki.ts` 自体は `CanvasRenderingContext2D` のみ使用しており Node.js 依存なし）
- `index.ts` のビルドには影響しない

**Todo List**
1. `tsconfig.json` を確認し、`module` を `ES2020` にした `tsconfig.browser.json` を作成する
2. `tsconfig.browser.json` では `include` を `src/parser.ts` と `src/tategaki.ts` のみに限定する
3. `package.json` に `"build:browser": "tsc -p tsconfig.browser.json"` スクリプトを追加する
4. ビルドを実行し `dist/parser.js` と `dist/tategaki.js` が生成されることを確認する

**Relevant Context**
- [`tsconfig.json`](tsconfig.json)
- [`src/parser.ts`](src/parser.ts) — `export` のみ、Node.js 依存なし
- [`src/tategaki.ts`](src/tategaki.ts) — `import { parse } from './parser'` のみ、Node.js 依存なし
- [`src/index.ts`](src/index.ts) — `@napi-rs/canvas` を使用（ブラウザビルドから除外する）

**Status**: [x] done

---

### 2. editor.html を作成する

**Intent**  
テキストエリア・ツールバー・Canvas の3段レイアウトを持つ HTML を作成し、
`dist/` の JS を読み込んでリアルタイムプレビューを実現する。

**Expected Outcomes**
- `editor.html` をブラウザで開くと3段レイアウトが表示される
- テキストエリアに記法テキストを入力すると Canvas が即座に縦書きで再描画される
- ツールバーはプレースホルダーとして表示される（ボタン等は未実装でよい）
- フォントは `游教科書体` を使用する

**Todo List**
1. `editor.html` を作成し、HTML 骨格（テキストエリア・ツールバー・Canvas の3段）を書く
2. `dist/parser.js` と `dist/tategaki.js` を `<script type="module">` で読み込む
3. テキストエリアの `input` イベントで `parse()` → `Tategaki.fillTextBlock()` を呼び出す描画関数を実装する
4. 描画前に Canvas をクリア（`clearRect`）し、背景を白で塗りつぶす処理を入れる
5. テキストエリアの初期値にサンプルテキスト（`index.ts` の例文4行）を設定し、ページロード時に即描画する
6. Canvas 要素を `ResizeObserver` で監視し、サイズ変更のたびに Canvas の `width`/`height` を更新して再描画する
7. フォントサイズは `30px "游教科書体"` 程度で開始する

**Relevant Context**
- [`src/index.ts`](src/index.ts) — サンプルテキスト・`fillTextBlock` の呼び出し例
- [`src/tategaki.ts`](src/tategaki.ts:509) — `fillTextBlock(lines: string[], x: number, y: number): void`
- `fillTextBlock` は列を右から左に描画する。`x` は最も右の列の本文字中心X
- `columnGap` デフォルト: `5`（フォントサイズの倍数）、`lineHeight` デフォルト: `1.1`

**Status**: [x] done

---

## 注意事項

- `tategaki.ts` の `import './parser'` は相対パスなので、ES Module ビルド時にパス解決が正しく行われること
- ブラウザ環境では `@napi-rs/canvas` は不要。`tategaki.ts` は `CanvasRenderingContext2D` を引数で受け取る設計のため追加対応不要
- `npm run dev` はサブタスク完了後に必ず実行すること（AGENTS.md ルール）
