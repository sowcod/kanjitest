# 外部DB(Google Sheets x GAS API)設計

このアプリのデータは既定でブラウザのLocalStorageに保存される。
「外部DB連携」タブでGAS(Google Apps Script) Web AppのURLを登録すると、以降はそのAPIを
データソースとして使う(ローカルと同期はしない。どちらか一方のみを見る。5種類のデータすべてが
一括で切り替わる、個別切り替えはできない)。

対象は次の5種類。**問題・データセットは実装済み**(`gas/src/*.ts`、`RemoteQuestionRepository` /
`RemoteDatasetRepository`)。**習った漢字・テスト履歴・設定は本ドキュメントで新規に契約を定義する
(実装はこれから行う)**。

| データ | ローカル実装 | 種別 | 状態 |
|---|---|---|---|
| 問題(Question) | `src/questionStore.ts` | コレクション | 実装済み |
| データセット(Dataset) | `src/datasetStore.ts` | コレクション | 実装済み |
| 習った漢字(LearnedKanjiState) | `src/learnedKanjiStore.ts` | シングルトン | **新規** |
| テスト履歴(TestHistoryEntry, 生成した問題) | `src/testHistoryStore.ts` | 追記専用コレクション | **新規** |
| 設定(Settings) | `src/settingsStore.ts` | シングルトン | **新規** |

`src/remoteConfigStore.ts`(接続先URL/トークン)は対象外とする。接続先そのものを表す
メタ情報であり、これをリモートに置くと「まだURLが分からない状態でURLを取得しに行く」という
鶏と卵の問題が生じるため、常にLocalStorage固定でよい(既存の設計判断を維持)。

このドキュメントは**クライアント側(各`src/*Store.ts`の`RemoteXxxRepository`)が呼び出すAPIの
契約**を定義する。クライアント側はこの契約に対して実際に`fetch`するコードを書く想定だが、
URLが未登録の間は一切呼ばれないため、GAS側の対応が完了していなくても既存のローカル動作に
影響しない(問題・データセット以外はGAS側の実装が追いつくまで、リモートモード下では
`saveSettings`等のactionが「不明なactionです」で失敗するだけ)。

## エンドポイント形式

GAS Web Appは1つのURL(`doGet`/`doPost`)しか持てないため、単一エンドポイントに対する
簡易JSON-RPC形式にする。`action`パラメータで処理を振り分ける。

- 参照系(`list*`/`get*`)は `GET` + クエリパラメータ
- 変更系(`save*`/`delete*`)は `POST` + JSONボディ

シングルトン(習った漢字・設定)は一覧の概念が無いため `list*` の代わりに `get*` を使う
(`getLearnedKanji`/`getSettings`)。id指定は不要で、常にただ1つのレコードを読み書きする。

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

/** 習った漢字(シングルトン、id無し)。src/learnedKanjiStore.ts の LearnedKanjiState と同一シェイプ。 */
interface LearnedKanjiState {
  currentGrade: 1 | 2 | 3 | 4 | 5 | 6;
  learnedThisGrade: string[]; // 現学年で都度追加登録した漢字(1文字ずつ)
}

/** テスト履歴1件(生成した問題の記録)。questionIds は生成時点でのスナップショットで、
 *  問題本体(text/weightなど)は問題側が削除・変更されても書き換わらない
 *  (履歴閲覧時に questionId から listQuestions で名寄せする。存在しないIDは無視してよい)。 */
interface TestHistoryEntry {
  date: string;         // ISO8601。生成日時であり、このエントリの一意キーでもある
  questionIds: string[];
}

/** テスト生成の挙動設定(シングルトン、id無し)。src/settingsStore.ts の Settings と同一シェイプ。 */
interface Settings {
  reviewRatio: number;
  recentHistoryCount: number;
  questionsPerTest: number;
  slotsPerColumn: number;
  readRatio: number;
  okuriganaRatio: number;
  promoteAdjacentWriteKanji: boolean;
  sourceDatasetIds: string[];
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

### `GET ?action=getLearnedKanji&token=...`

レスポンス: `{ "learnedKanji": LearnedKanjiState }`

レコードが1件も無い(未保存)場合は、ローカル実装の既定値と同じ
`{ "currentGrade": 1, "learnedThisGrade": [] }` を返すこと。

### `POST { "action": "saveLearnedKanji", "learnedKanji": {...}, "token": "..." }`

シングルトンのため、送られてきた内容で常に**全体を上書き**する(部分更新ではない。
`learnedThisGrade` は差分ではなく更新後の全要素を送る。ローカル実装の
`addLearnedKanji`/`removeLearnedKanji`/`advanceGrade`/`setCurrentGrade` はいずれも
「読んで加工して丸ごと保存し直す」実装であり、リモート実装でもこの呼び出し方を変えない)。

リクエストボディの `learnedKanji`: `{ "currentGrade": 1, "learnedThisGrade": ["漢", "字"] }`

レスポンス: `{ "learnedKanji": LearnedKanjiState }`

### `GET ?action=listTestHistory&token=...`

レスポンス: `{ "history": TestHistoryEntry[] }`(古い順。件数は後述のとおりサーバー側で
最大50件にトリムされているため、クライアント側で改めてトリムする必要はない)

### `POST { "action": "saveTestHistoryEntry", "entry": {...}, "token": "..." }`

追記専用(更新は無い)。`entry.date` が既存のトリム後の一覧で最も古いものから溢れた分は
サーバー側で削除し、直近50件のみを保持する(ローカル実装の `MAX_HISTORY_LENGTH = 50` と
同じ挙動をサーバー側でも行う。理由: 複数端末から書いてもシートが無限に肥大しないようにするため)。

リクエストボディの `entry`: `{ "date": "2026-09-07T01:23:45.000Z", "questionIds": ["id1", "id2"] }`

レスポンス: `{ "history": TestHistoryEntry[] }` (トリム後の全件。保存直後に一覧を再取得する
手間を省くため、単に保存した1件ではなく全件を返す)

### `POST { "action": "deleteTestHistoryEntry", "date": "...", "token": "..." }`

`date` を一意キーとして該当エントリを削除する。

レスポンス: `{ "ok": true }`

### `GET ?action=getSettings&token=...`

レスポンス: `{ "settings": Settings }`

レコードが1件も無い場合は、ローカル実装の `DEFAULT_SETTINGS`(`src/settingsStore.ts`)と
同じ既定値を返すこと。

### `POST { "action": "saveSettings", "settings": {...}, "token": "..." }`

シングルトンのため、送られてきた内容で常に全体を上書きする(saveLearnedKanjiと同様)。

リクエストボディの `settings`: Settings の全フィールド。

レスポンス: `{ "settings": Settings }`

## シート構成(GAS実装側)

既存の `Questions`/`Datasets` シート(実装済み)に加え、以下の3シートを追加する。
いずれも1行目はヘッダー行、データは2行目以降。配列・オブジェクトを持つフィールドは
セルにJSON文字列として格納する(Sheetsのセルはスカラー値しか持てないため)。

| シート名 | 列 | 種別 | 補足 |
|---|---|---|---|
| `Questions` | `id \| text \| weight \| datasetId \| createdAt \| updatedAt` | コレクション | 実装済み。`gas/src/QuestionRepository.ts:5-6` |
| `Datasets` | `id \| name \| createdAt \| updatedAt` | コレクション | 実装済み。`gas/src/DatasetRepository.ts:3-4` |
| `LearnedKanji` | `currentGrade \| learnedThisGrade \| updatedAt` | シングルトン | **新規**。データ行は常に0行(未保存)か1行のみ。`learnedThisGrade`は`'["漢","字"]'`のようなJSON文字列 |
| `Settings` | `reviewRatio \| recentHistoryCount \| questionsPerTest \| slotsPerColumn \| readRatio \| okuriganaRatio \| promoteAdjacentWriteKanji \| sourceDatasetIds \| updatedAt` | シングルトン | **新規**。`sourceDatasetIds`はJSON文字列 |
| `TestHistory` | `date \| questionIds \| createdAt` | 追記専用ログ | **新規**。`date`が一意キー。`questionIds`はJSON文字列。保存時に古い行から削除して最大50行に維持する |

`Questions`/`Datasets`の列定義は実装済みコード側が正であり、この表はそれをこのドキュメント
上にも転記したもの(コードとドキュメントが食い違った場合はコード側を正とする)。

シングルトン系(`LearnedKanji`/`Settings`)の保存(`save*`)は、既存の
`saveDataset`/`saveQuestion`と同様「2行目が既にあれば上書き、無ければ追加」という
1行固定のupsertにする(`id`によるルックアップが不要な分、`Questions`/`Datasets`の
実装よりむしろ単純)。`updatedAt`は各アクションのサーバー側で都度更新する。

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

## 切り替え方法(問題・データセットは実装済み・クライアント側)

- 「外部DB連携」タブでURLを登録すると、以後は自動でこのAPIを使う(未登録ならローカル)。
- `?ds=local` / `?ds=remote` のURLパラメータで、その回のページ表示に限り強制的に
  切り替えられる(保存されない、通常運用では使わない特別対応)。
- ローカルとリモートの同期機能は無い。切り替えた瞬間、見えるデータは切り替え先のものだけになる。
- `resolveDataSourceMode()`(`src/remoteConfigStore.ts`)は5種類のデータで共通のグローバル
  切り替えであり、個別のデータ種別ごとに local/remote を混在させることはできない。

## 今後の実装(習った漢字・テスト履歴・設定)

`src/questionStore.ts` の `QuestionRepository`/`LocalQuestionRepository`/
`RemoteQuestionRepository` パターン(内部に `Local*Repository`/`Remote*Repository` を持ち、
`resolveDataSourceMode()` で切り替える)を、3ストアにもそのまま適用する。

- `src/learnedKanjiStore.ts`: `LearnedKanjiRepository`(`get(): Promise<LearnedKanjiState>` /
  `save(state): Promise<LearnedKanjiState>`)を追加し、既存の同期関数群
  (`loadLearnedKanjiState`/`addLearnedKanji`等)を非同期化する。
- `src/testHistoryStore.ts`: `TestHistoryRepository`(`list()` / `record(questionIds)` /
  `remove(date)`)を追加し、`loadHistory`/`recordTest`/`deleteHistoryEntry`を非同期化する。
- `src/settingsStore.ts`: `SettingsRepository`(`get()` / `save(settings)`)を追加し、
  `loadSettings`/`saveSettings`を非同期化する。
- `gas/src/`に`LearnedKanjiRepository.ts`/`TestHistoryRepository.ts`/`SettingsRepository.ts`
  相当のシート読み書きを追加し、`gas/src/Code.ts`の`doGet`/`doPost`に6つのactionを追加する
  (`gas/src/Types.ts`にも3つの型を追記し、クライアント側の型と同期を維持する)。
- いずれも呼び出し元(`QuestionManagementPage`のような楽観的更新は不要、これらは
  頻繁な逐次入力ではなく「学年更新」「テスト生成」「設定変更」という低頻度操作のため、
  `questionStore.ts`の`Row`/`SyncState`/楽観的更新のような複雑さは持ち込まず、
  素朴な`await`ベースのAPI(既存の`listQuestions`/`saveQuestion`と同じ層)で十分)。
