# 漢字テスト記法仕様 プラン

## 概要

縦書きライブラリ `Tategaki` を用いた漢字テスト生成のために、テキスト中に書き取り・読み取りの記入欄を表現する記法を定義する。

既存の通常ルビ記法（`漢字[かんじ]` / `{明日}[あした]`）を拡張し、3種類の枠記法を追加する。すべての記法は1つの文字列の中に混在できる。

---

## 記法仕様

### 既存記法（変更なし）

| 記法 | 例 | 説明 |
|---|---|---|
| 1文字ルビ | `漢[かん]字[じ]` | 直前の1文字にルビを付ける |
| グループルビ | `{明日}[あした]` | 中括弧内の複数文字にルビを付ける |

---

### 追加記法 ①：書き取り枠

```
<漢>[かん]<字>[じ]
<今日>[きょう]
```

- 山括弧 `<>` で囲んだ文字が書き取り枠になる
- 山括弧内が1文字の場合は1文字分の枠、複数文字の場合は文字数分の正方形枠が縦に並ぶ
- 直後の `[ルビ]` がその枠グループに対するルビで、枠の右側に表示される
- **見た目**：正方形の実線外枠 ＋ 十字の破線補助線が文字数分縦に並ぶ
- **枠サイズ**：`boxSize`（テキストのフォントサイズとは独立して設定する。目安：本文の約2.5文字分）

---

### 追加記法 ②：読み取り枠

```
肉[[にく]]
{漢字}[[かんじ]]
```

- `文字[[ルビ]]` は「直前の1文字 ＋ 読み取り枠」（1文字ルビ `文字[ルビ]` と平行した構造）
- `{グループ}[[ルビ]]` は「グループ複数文字 ＋ 読み取り枠」
- 対象の漢字はそのまま印刷される
- 対象漢字の右側に縦長の大括弧（空白のみ）を表示する
- 括弧の縦幅はルビの文字数の約2倍程度
- 括弧内には何も印刷しない（補助線なし）

---

### 追加記法 ③：送り仮名付き書き取り枠

```
{{書く}}[かく]
{{慮る}}[おもんぱかる]
```

- 二重中括弧 `{{}}` で囲んだ文字（漢字＋送り仮名）が枠の対象
- 対象文字は印刷されない（枠の縦幅の計算にのみ使われる）
- 枠は縦長の大括弧のみ（正方形の格子なし、補助線なし）
- 括弧の縦幅は送り仮名が推測されないよう、文字数を閾値ベースで切り上げて計算する

**縦幅の計算（`boxSize` を単位とする）：**

| `{{}}` 内の文字数 | 括弧の縦幅 |
|---|---|
| 1〜2文字 | `boxSize × 3` |
| 3〜4文字 | `boxSize × 5` |
| 5文字以上 | `boxSize × 7` |

- 直後の `[ルビ]` がその枠に対するルビで、枠の右側に表示される

---

## 記法の対比一覧

| 記法 | 対象 | 漢字印刷 | 枠の形状 | ルビ表示 |
|---|---|---|---|---|
| `漢字[ルビ]` | 通常ルビ | あり | なし | 右 |
| `{グループ}[ルビ]` | 通常グループルビ | あり | なし | 右 |
| `<漢字>[ルビ]` | 書き取り枠 | なし（枠に置換） | 正方形×文字数、十字破線あり | 右 |
| `文字[[ルビ]]` | 読み取り枠 | あり | 縦長大括弧のみ | 不要（空白） |
| `{グループ}[[ルビ]]` | 読み取りグループ枠 | あり | 縦長大括弧のみ | 不要（空白） |
| `{{送り仮名付き}}[ルビ]` | 送り仮名付き書き取り枠 | なし | 縦長大括弧のみ | 右 |

---

## 混在例

```
太[た]郎[ろう]は<今日>[きょう]{学校}[[がっこう]]へ{{行く}}[いく]。
```

この1文字列の中に：
- 通常ルビ：`太[た]` `郎[ろう]`
- 書き取り枠（①）：`<今日>[きょう]`
- 読み取り枠（②）：`{学校}[[がっこう]]`
- 送り仮名付き書き取り枠（③）：`{{行く}}[いく]`

がすべて混在している。

---

## パーサー設計

### 方針

- パーサーを `src/parser.ts` として**Canvas依存のない独立モジュール**に分離する
- 将来のエディタ（ブラウザ上）からパーサーだけをimportできるようにする
- 描画処理（`src/tategaki.ts`）はパーサーの出力（`Segment[]`）を受け取って描画する

### アーキテクチャ

```
src/parser.ts   ← Canvas非依存。エディタからも使える
src/tategaki.ts ← parser.ts の出力を受け取って描画
```

### 2段構成：Tokenizer → Parser

正規表現1本のアプローチでは壊れた記法がサイレントに無視されるため、**位置情報付きトークン列に分割してからパース**する2段構成を採用する。

#### Stage 1: Tokenizer

入力文字列を以下のトークン種別に分割する。各トークンは入力文字列中の位置情報を持つ。

| TokenKind | マッチパターン | 例 |
|---|---|---|
| `ANGLE_GROUP` | `<文字列>` | `<今日>` |
| `CURLY2_GROUP` | `{{文字列}}` | `{{書く}}` |
| `CURLY1_GROUP` | `{文字列}` | `{明日}` |
| `RUBY2` | `[[文字列]]` | `[[かんじ]]` |
| `RUBY1` | `[文字列]` | `[かんじ]` |
| `CHAR` | それ以外の1文字 | `太`、`。` |

```ts
interface Token {
  kind: TokenKind
  text: string   // マッチした生テキスト（括弧を含む）
  value: string  // 括弧を除いた中身
  offset: number // 入力文字列中の開始位置（文字単位）
  length: number // トークンの長さ（文字単位）
}
```

#### Stage 2: Parser

トークン列を順に読んで `Segment[]` と `ParseError[]` を生成する。

**合法なトークン列の組み合わせ：**

| トークン列 | 解釈 | Segment kind |
|---|---|---|
| `CHAR` | ルビなし通常文字 | `normal` |
| `CHAR` `RUBY1` | 1文字通常ルビ | `normal` |
| `CURLY1_GROUP` `RUBY1` | グループ通常ルビ | `normal` |
| `ANGLE_GROUP` `RUBY1` | 書き取り枠 | `writeBox` |
| `CHAR` `RUBY2` | 1文字読み取り枠 | `readBox` |
| `CURLY1_GROUP` `RUBY2` | グループ読み取り枠 | `readBox` |
| `CURLY2_GROUP` `RUBY1` | 送り仮名付き書き取り枠 | `bracketBox` |

**エラーとなるケース（例）：**

- `RUBY1` / `RUBY2` の直前にベース（`CHAR` / `CURLY1_GROUP` / `ANGLE_GROUP` / `CURLY2_GROUP`）がない
- `ANGLE_GROUP` の直後に `RUBY1` がない
- `CURLY2_GROUP` の直後に `RUBY1` がない
- `CURLY1_GROUP` の直後に `RUBY1` も `RUBY2` もない

### Segment 型の拡張

```ts
type SegmentKind = 'normal' | 'writeBox' | 'readBox' | 'bracketBox'

interface Segment {
  kind: SegmentKind
  char: string        // 常に元の文字を保持する（描画時に印刷するかどうかはオプションで制御）
                      // bracketBox は複数文字をまとめて保持する（例: '書く'）
  ruby: string | null // 常に元のルビを保持する（描画時に印刷するかどうかはオプションで制御）
  rubyIndex: number   // グループ内の何文字目か（0始まり）
  rubyTotal: number   // グループの総文字数
  boxCount?: number   // bracketBox のみ: 括弧の縦幅を決める枠数（閾値テーブルから算出）
}
```

**設計方針：パーサーは情報を捨てない**

- `writeBox` の `char`・`readBox` の `ruby`・`bracketBox` の `char` はすべて元の値を保持する
- 描画時に「枠内の文字を印刷するか」「ルビを表示するか」をオプションで切り替える
- これにより、テスト用（空欄）と解答例用（文字入り）を同じ `Segment[]` から生成できる

### パース結果の型

```ts
interface ParseResult {
  segments: Segment[]
  errors: ParseError[]
}

interface ParseError {
  offset: number  // エラー箇所の開始位置（文字単位）
  length: number  // エラー箇所の長さ
  message: string // 例: "[[...]] の前に文字またはグループがありません"
}
```

### エクスポートするAPI（src/parser.ts）

```ts
export type { Token, TokenKind, Segment, SegmentKind, ParseResult, ParseError }
export function tokenize(text: string): Token[]
export function parse(text: string): ParseResult
```

`tokenize` を公開することで、エディタがトークン単位のシンタックスハイライトにも使えるようにする。

---

## 描画処理設計

### 方針

- `src/tategaki.ts` の `Tategaki` クラスを拡張する
- 内部で `parse()` を呼び出し、`Segment[]` をループして描画する
- 既存の `_parseRuby()` は `parse()` に置き換える
- `fillText()` の戻り値を `void` → `number`（実際の列幅）に変更する
- `fillTextBlock()` は `fillText()` の戻り値を使って次の列位置を決める

### 描画オプションの追加

テスト用（空欄）と解答例用（文字入り）を切り替えるオプションを `TategakiOptions` に追加する。

```ts
interface TategakiOptions {
  // ...既存オプション...
  boxSize?: number      // 書き取り枠の1辺サイズ（px）。デフォルト: fontSize * 2.5
  showAnswer?: boolean  // true のとき枠内の文字・ルビをすべて表示する。デフォルト: false
}
```

### 各 Segment kind の描画内容

| kind | 本体の描画 | 右側の描画 |
|---|---|---|
| `normal` | `_drawChar()` で文字を描画 | ルビがあれば `_drawRuby()` |
| `writeBox` | `boxSize` の正方形枠（実線）＋十字補助線（破線）を文字数分縦に並べる。`showAnswer: true` のとき枠内に文字も描画 | ルビを `_drawRuby()` で描画（`showAnswer` に関わらず常に表示） |
| `readBox` | `_drawChar()` で文字を描画（常に表示） | 縦長大括弧（空白のみ）。`showAnswer: true` のときルビも表示 |
| `bracketBox` | なし（文字は印刷しない）。`showAnswer: true` のとき縦長大括弧の中に文字を描画 | 縦長大括弧 ＋ ルビを `_drawRuby()` で描画 |

### 列幅の計算

`fillText()` はループ終了後に**その列の実際の横幅**を返す。列幅は列内の全 Segment が必要とする横幅の最大値。

| kind | 列幅の計算式 |
|---|---|
| `normal`（ルビなし） | `fontSize` |
| `normal`（ルビあり） | `fontSize + rubySize × 1.2` |
| `writeBox` | `boxSize + rubySize × 1.2` |
| `readBox` | `fontSize + bracketWidth` |
| `bracketBox` | `bracketWidth + rubySize × 1.2` |

`bracketWidth` は大括弧の描画幅（定数。`fontSize × 0.4` 程度を想定）。

### `fillText()` / `fillTextBlock()` のシグネチャ変更

```ts
// 変更前
fillText(text: string, x: number, y: number): void

// 変更後
fillText(text: string, x: number, y: number): number  // 戻り値: 実際の列幅(px)
```

```ts
// fillTextBlock: 変更なし（内部で fillText の戻り値を使うように変更）
fillTextBlock(lines: string[], x: number, y: number): void
```

### 新規追加メソッド

```ts
// writeBox の1枠を描画する
private _drawWriteBox(cx: number, cy: number, boxSize: number, char?: string): void

// readBox / bracketBox の縦長大括弧を描画する
private _drawBracket(rightX: number, topY: number, height: number): void
```

`_drawWriteBox()` は正方形の実線外枠と十字の破線補助線を描く。`char` が渡された場合（`showAnswer: true` 時）は枠内に文字も描画する。

`_drawBracket()` は縦長の大括弧を描く。`readBox` と `bracketBox` の両方で使用する。

---

## ステータス

- [x] 記法仕様の定義：完了
- [x] パーサー設計：完了
- [x] 描画処理設計：完了
- [x] 実装：完了
