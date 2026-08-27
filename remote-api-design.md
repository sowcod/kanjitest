# 外部DB(Google Sheets x GAS API)設計

このアプリのデータ(問題・データセット)は既定でブラウザのLocalStorageに保存される。
「外部DB連携」タブでGAS(Google Apps Script) Web AppのURLを登録すると、以降はそのAPIを
データソースとして使う(ローカルと同期はしない。どちらか一方のみを見る)。

このドキュメントは**クライアント側(`src/questionStore.ts` / `src/datasetStore.ts` の
`RemoteQuestionRepository` / `RemoteDatasetRepository`)が呼び出すAPIの契約**を定義する。
**GAS側の実装(スプレッドシートの読み書きを行うスクリプト本体)は別フェーズで行う。**
クライアント側はこの契約に対して実際に`fetch`するコードを書いてあるが、URLが未登録の間は
一切呼ばれないため、GAS側が存在しなくても既存のローカル動作に影響しない。

## エンドポイント形式

GAS Web Appは1つのURL(`doGet`/`doPost`)しか持てないため、単一エンドポイントに対する
簡易JSON-RPC形式にする。`action`パラメータで処理を振り分ける。

- 参照系(`list*`)は `GET` + クエリパラメータ
- 変更系(`save*`/`delete*`)は `POST` + JSONボディ

### CORSに関する注意(重要)

GASのWebAppは`doPost`のCORSプリフライト(`OPTIONS`リクエスト)に正しく応答できないため、
`Content-Type: application/json` でPOSTするとブラウザからのリクエストが失敗する。

回避策として、クライアントは **`Content-Type: text/plain;charset=utf-8`** でJSON文字列を送る
(この場合ブラウザはプリフライトを発生させない、いわゆる"simple request"になる)。
GAS側は `e.postData.contents` を受け取り、自前で `JSON.parse` する実装にすること。

### 認証

必須ではないが、簡易的な不正利用防止として `token` を全リクエストに含める
(「外部DB連携」タブで登録した `apiToken`。クエリパラメータまたはJSONボディの `token` フィールド)。
GAS側で環境変数的な `PropertiesService` などに保存した秘密トークンと照合する想定。
トークン不一致時は `{ error: '...' }` を返すこと(ステータスコードは常に200。詳細は
「エラーレスポンス」節参照)。

## データモデル

```ts
interface Question {
  id: string;
  text: string;       // 記法テキスト(vision.md参照)
  weight: 1 | 2;
  datasetId: string;  // 所属データセットのID
  createdAt: string;  // ISO8601
  updatedAt: string;  // ISO8601
}

interface Dataset {
  id: string;
  name: string;       // 例: "漢字ワーク", "学校の授業", "試験問題"
  createdAt: string;
  updatedAt: string;
}
```

## API一覧

### `GET ?action=listQuestions&datasetIds=id1,id2&token=...`

`datasetIds` は省略可(省略時は全データセットの問題を返す)。カンマ区切りで複数指定できる。

レスポンス: `{ "questions": Question[] }`

### `GET ?action=listDatasets&token=...`

レスポンス: `{ "datasets": Dataset[] }`

1件も無い場合は空配列を返してよい(ローカル実装は既定データセットを自動生成するが、
リモート実装でそこまで揃えるかはGAS側の実装方針に委ねる)。

### `POST { "action": "saveQuestion", "question": {...}, "token": "..." }`

`question.id` を含む場合は更新、含まない場合は新規作成(サーバー側でIDを発行する)。

リクエストボディの `question`:
```json
{ "id": "任意(更新時のみ)", "text": "...", "weight": 1, "datasetId": "..." }
```

レスポンス: `{ "question": Question }` (発行された `id`/`createdAt`/`updatedAt` を含む完全なレコード)

### `POST { "action": "deleteQuestion", "id": "...", "token": "..." }`

レスポンス: `{ "ok": true }`

### `POST { "action": "saveDataset", "dataset": {...}, "token": "..." }`

`dataset.id` を含む場合は名前変更、含まない場合は新規作成。

リクエストボディの `dataset`: `{ "id": "任意", "name": "..." }`

レスポンス: `{ "dataset": Dataset }`

### `POST { "action": "deleteDataset", "id": "...", "token": "..." }`

レスポンス: `{ "ok": true }`

GAS側で、そのデータセットに属する問題が1件でも残っている場合はエラーを返すこと
(クライアント側でも削除前チェックを行うが、サーバー側でも二重に守るのが望ましい)。

## エラーレスポンス

GAS Web Appは正常終了したスクリプトからのレスポンスに常に200を返し、スクリプト側から
HTTPステータスコードを制御することはできない(未捕捉例外時のみGoogle側の汎用エラーページ
が返るが、それはJSONではなくステータスも制御不能)。そのため成否は**常にボディの内容**で
判定する契約にする。

- 成功時: 各APIのレスポンス(`{ questions: [...] }` など)をそのまま200で返す。
- 失敗時: `{ "error": "人が読める説明" }` を200で返す。

クライアント(`src/remoteApiClient.ts`)はレスポンスボディに `error` フィールドが
含まれていれば例外を投げる。ステータスコード自体は、GAS側がダウンしている等でJSONとして
パースできないレスポンスが返ってきた場合のフォールバック判定にのみ使う。

## 切り替え方法(実装済み・クライアント側)

- 「外部DB連携」タブでURLを登録すると、以後は自動でこのAPIを使う(未登録ならローカル)。
- `?ds=local` / `?ds=remote` のURLパラメータで、その回のページ表示に限り強制的に
  切り替えられる(保存されない、通常運用では使わない特別対応)。
- ローカルとリモートの同期機能は無い。切り替えた瞬間、見えるデータは切り替え先のものだけになる。
