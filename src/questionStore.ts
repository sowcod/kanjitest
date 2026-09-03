import { parse } from './parser.js';
import { isKanji, kanjiGrade, Grade } from './kanjiData.js';
import { resolveDataSourceMode } from './remoteConfigStore.js';
import { remoteGet, remotePost } from './remoteApiClient.js';
import { DEFAULT_DATASET_ID } from './datasetStore.js';

/**
 * 問題データ
 *
 * 1問 = 1つの記法テキスト（改行を含まない、fillText に渡す1列分）。
 */
export interface Question {
  id: string;
  text: string;
  /** 1 = 通常の1問。2 = 「2問相当」の長め問題（テスト内で列を単独で占有する） */
  weight: 1 | 2;
  /** 所属データセット(漢字ワーク由来/学校の授業由来/試験問題由来 など問題を整理する単位) */
  datasetId: string;
  createdAt: string;
  updatedAt: string;
}

// ────────────────────────────────────────────────────────────
// データ層(外部DB切替対応): 公開API(下部)はすべて非同期。
// LocalStorage実装(既定)とリモート実装(GAS Web App、未設定時は使われない)を
// resolveDataSourceMode() で切り替える。詳細な通信仕様は remote-api-design.md 参照。
// ────────────────────────────────────────────────────────────

interface QuestionRepository {
  list(): Promise<Question[]>;
  save(input: { id?: string; text: string; weight: 1 | 2; datasetId: string }): Promise<Question>;
  remove(id: string): Promise<void>;
}

const STORAGE_KEY = 'kanji-test-questions';

function loadAllLocal(): Question[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 旧データ(datasetId概念が無かった頃に保存された問題)を既定データセットへ移行する。
    let migrated = false;
    const withDataset: Question[] = parsed.map((q: Partial<Question>) => {
      if (q && !q.datasetId) {
        migrated = true;
        return { ...q, datasetId: DEFAULT_DATASET_ID } as Question;
      }
      return q as Question;
    });
    if (migrated) saveAllLocal(withDataset);
    return withDataset;
  } catch {
    return [];
  }
}

function saveAllLocal(questions: Question[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(questions));
}

class LocalQuestionRepository implements QuestionRepository {
  async list(): Promise<Question[]> {
    return loadAllLocal();
  }

  async save(input: { id?: string; text: string; weight: 1 | 2; datasetId: string }): Promise<Question> {
    const all = loadAllLocal();
    const now = new Date().toISOString();

    if (input.id) {
      const idx = all.findIndex(q => q.id === input.id);
      if (idx >= 0) {
        const updated: Question = {
          ...all[idx],
          text: input.text,
          weight: input.weight,
          datasetId: input.datasetId,
          updatedAt: now,
        };
        all[idx] = updated;
        saveAllLocal(all);
        return updated;
      }
    }

    const created: Question = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text: input.text,
      weight: input.weight,
      datasetId: input.datasetId,
      createdAt: now,
      updatedAt: now,
    };
    all.push(created);
    saveAllLocal(all);
    return created;
  }

  async remove(id: string): Promise<void> {
    saveAllLocal(loadAllLocal().filter(q => q.id !== id));
  }
}

class RemoteQuestionRepository implements QuestionRepository {
  async list(): Promise<Question[]> {
    const { questions } = await remoteGet<{ questions: Question[] }>('listQuestions');
    return questions;
  }

  async save(input: { id?: string; text: string; weight: 1 | 2; datasetId: string }): Promise<Question> {
    const { question } = await remotePost<{ question: Question }>('saveQuestion', { question: input });
    return question;
  }

  async remove(id: string): Promise<void> {
    await remotePost('deleteQuestion', { id });
  }
}

const localRepo = new LocalQuestionRepository();
const remoteRepo = new RemoteQuestionRepository();

function repo(): QuestionRepository {
  return resolveDataSourceMode() === 'remote' ? remoteRepo : localRepo;
}

function tempId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ────────────────────────────────────────────────────────────
// 同期状態(クライアント専用。サーバーには送らない、Question型そのものには含まれない)。
// 問題管理画面は「保存は即座にリストへ反映し、DBへの実書き込みは非同期で行う」方式のため、
// 各行がバックグラウンド書き込みのどの段階にあるかをここで管理する。
// ────────────────────────────────────────────────────────────

export type SyncOp = 'create' | 'update' | 'delete';

export type SyncState =
  | { phase: 'synced' }
  | { phase: 'pending'; op: SyncOp }
  | { phase: 'failed'; op: SyncOp; error: string };

/**
 * 一覧・エディタが扱う1行。`clientId` は行の見た目上の同一性を表す不変のキー
 * (React の key や editingId など画面側の識別に使う)。新規登録の直後は
 * サーバーがまだ id を発行していないため `id`(仮ID)と`clientId`は同じ値になるが、
 * バックグラウンドの作成が成功すると `id` はサーバー発行の実IDに置き換わる
 * (`clientId` はその後も変わらない — 編集中のまま画面に留まれるようにするため)。
 */
export interface Row extends Question {
  clientId: string;
  /** サーバー上に存在することが確認済みか。false の間はこの行に対する保存はすべて「作成」として送る。 */
  confirmed: boolean;
  sync: SyncState;
}

function toSyncedRow(q: Question): Row {
  return { ...q, clientId: q.id, confirmed: true, sync: { phase: 'synced' } };
}

/** Row から Question 部分だけを取り出す(clientId/confirmed/sync は同期状態管理の内部詳細のため、既存の素朴なAPIには漏らさない)。 */
function toQuestion(row: Row): Question {
  const { id, text, weight, datasetId, createdAt, updatedAt } = row;
  return { id, text, weight, datasetId, createdAt, updatedAt };
}

// ────────────────────────────────────────────────────────────
// ストア: 問題一覧はモジュールスコープの単一の状態として保持し、
// useSyncExternalStore から購読できるようにする(タブ切り替えでコンポーネントが
// unmount/remountされても pending/failed 状態を保持できる)。
// ────────────────────────────────────────────────────────────

let rows: Row[] | null = null;
let loadError: string | null = null;
let loadPromise: Promise<Row[]> | null = null;

type Listener = () => void;
const listeners = new Set<Listener>();

export interface QuestionsSnapshot {
  rows: Row[];
  loading: boolean;
  error: string | null;
}

const EMPTY_ROWS: Row[] = [];
let cachedSnapshot: QuestionsSnapshot | null = null;

function notify(): void {
  cachedSnapshot = null;
  for (const listener of listeners) listener();
}

function patchRows(updater: (current: Row[]) => Row[]): void {
  rows = updater(rows ?? []);
  notify();
}

function startLoad(): Promise<Row[]> {
  const promise = repo().list().then(
    (list) => {
      loadPromise = null;
      if (rows === null) rows = list.map(toSyncedRow);
      loadError = null;
      notify();
      return rows;
    },
    (err: unknown) => {
      loadPromise = null;
      loadError = err instanceof Error ? err.message : String(err);
      notify();
      throw err;
    },
  );
  loadPromise = promise;
  return promise;
}

/** 未読込であれば読込を開始する(副作用を起こしても安全な場所、購読開始時に呼ぶ)。 */
function ensureLoaded(): void {
  if (rows !== null || loadPromise !== null) return;
  startLoad().catch(() => {
    // エラーは loadError/snapshot 経由で通知済み。ここでの unhandled rejection 化を防ぐだけ。
  });
}

async function loadAll(): Promise<Row[]> {
  if (rows !== null) return rows;
  return loadPromise ?? startLoad();
}

// タブがバックグラウンドから復帰したら、他タブ/スプレッドシート直接編集などの
// 取りこぼしに気付けるようキャッシュを破棄する(次回参照時に再取得される)。
// ただし pending/failed な行や未確定の行がある間は、破棄すると進行中の同期状態を
// 画面から見失ってしまうため復帰時の破棄を見送る(次に安全なタイミングで破棄される)。
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || rows === null) return;
    const hasUnsynced = rows.some((r) => r.sync.phase !== 'synced' || !r.confirmed);
    if (hasUnsynced) return;
    rows = null;
    notify();
  });
}

// ────────────────────────────────────────────────────────────
// React 用の購読API(useSyncExternalStore から使う)
// ────────────────────────────────────────────────────────────

export function subscribeQuestions(listener: Listener): () => void {
  listeners.add(listener);
  ensureLoaded();
  return () => {
    listeners.delete(listener);
  };
}

export function getQuestionsSnapshot(): QuestionsSnapshot {
  if (!cachedSnapshot) {
    cachedSnapshot = { rows: rows ?? EMPTY_ROWS, loading: rows === null, error: loadError };
  }
  return cachedSnapshot;
}

export function reloadQuestions(): void {
  rows = null;
  loadError = null;
  notify();
  ensureLoaded();
}

// ────────────────────────────────────────────────────────────
// 同一行への競合操作のキューイング(§6): 行ごとに進行中の操作(inFlight)を1つだけ許し、
// その間に来た次の操作は queuedIntent に上書き保存(最後の内容が勝つ)、完了後に実行する。
// 実際に送る内容(text/weight/datasetId)は常にその時点の rows を読むため、
// intent 自体は「保存」か「削除」かのマーカーで十分。
// ────────────────────────────────────────────────────────────

type Intent = 'save' | 'delete';
const inFlight = new Set<string>();
const queuedIntent = new Map<string, Intent>();

function dispatch(clientId: string, intent: Intent): void {
  if (inFlight.has(clientId)) {
    queuedIntent.set(clientId, intent);
    return;
  }
  void run(clientId, intent);
}

async function run(clientId: string, intent: Intent): Promise<void> {
  inFlight.add(clientId);
  if (intent === 'save') {
    await runSave(clientId);
  } else {
    await runDelete(clientId);
  }
  inFlight.delete(clientId);
  const next = queuedIntent.get(clientId);
  if (next !== undefined) {
    queuedIntent.delete(clientId);
    void run(clientId, next);
  }
}

async function runSave(clientId: string): Promise<void> {
  const row = rows?.find((r) => r.clientId === clientId);
  if (!row) return;
  const isCreate = !row.confirmed;
  try {
    const saved = await repo().save({
      id: isCreate ? undefined : row.id,
      text: row.text,
      weight: row.weight,
      datasetId: row.datasetId,
    });
    const stillExists = rows?.some((r) => r.clientId === clientId);
    if (!stillExists) return; // 保存中にローカルで削除済み(未確定行の削除)。サーバー側は孤立するが復元しない。
    // text/weight/datasetId は現在の行(rows)の値を使う。送信中に別の編集がキューされていた場合、
    // saved はその編集より前の内容を反映しているため、それで上書きすると編集内容を失ってしまう。
    // 採用するのは saved.id(仮ID→実IDの差し替え)と saved.createdAt/updatedAt のみ。
    patchRows((rs) =>
      rs.map((r) =>
        r.clientId === clientId
          ? { ...r, id: saved.id, createdAt: saved.createdAt, updatedAt: saved.updatedAt, confirmed: true, sync: { phase: 'synced' } }
          : r,
      ),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    patchRows((rs) =>
      rs.map((r) => (r.clientId === clientId ? { ...r, sync: { phase: 'failed', op: isCreate ? 'create' : 'update', error: message } } : r)),
    );
  }
}

async function runDelete(clientId: string): Promise<void> {
  const row = rows?.find((r) => r.clientId === clientId);
  if (!row) return;
  try {
    await repo().remove(row.id);
    patchRows((rs) => rs.filter((r) => r.clientId !== clientId));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    patchRows((rs) => rs.map((r) => (r.clientId === clientId ? { ...r, sync: { phase: 'failed', op: 'delete', error: message } } : r)));
  }
}

// ────────────────────────────────────────────────────────────
// 楽観的更新API(QuestionManagementPageから呼ぶ): いずれも同期的に呼べて即座に
// rows を更新・通知し、実際のDB書き込みはバックグラウンドで行う。
// ────────────────────────────────────────────────────────────

/** 新規登録: 即座にリストへ反映し、clientId(仮ID)を返す。DBへの登録はバックグラウンドで行う。 */
export function createQuestionOptimistic(input: { text: string; weight: 1 | 2; datasetId: string }): string {
  const clientId = tempId();
  const now = new Date().toISOString();
  const row: Row = {
    id: clientId,
    text: input.text,
    weight: input.weight,
    datasetId: input.datasetId,
    createdAt: now,
    updatedAt: now,
    clientId,
    confirmed: false,
    sync: { phase: 'pending', op: 'create' },
  };
  patchRows((rs) => [...rs, row]);
  dispatch(clientId, 'save');
  return clientId;
}

/**
 * 変更登録: 即座に対象行の内容を更新する。対象行がまだサーバーに一度も
 * 確定していない(confirmed=false、= 直前の新規登録がpending/failed中)場合は、
 * バックグラウンドでは「作成」として送る(実質、新規登録のリトライ)。
 */
export function updateQuestionOptimistic(clientId: string, input: { text: string; weight: 1 | 2; datasetId: string }): void {
  const now = new Date().toISOString();
  patchRows((rs) =>
    rs.map((r) => {
      if (r.clientId !== clientId) return r;
      const op: SyncOp = r.confirmed ? 'update' : 'create';
      return { ...r, text: input.text, weight: input.weight, datasetId: input.datasetId, updatedAt: now, sync: { phase: 'pending', op } };
    }),
  );
  dispatch(clientId, 'save');
}

/**
 * 削除: 対象行がまだサーバーに一度も確定していない場合はネットワーク呼び出し無しで
 * 即座にリストから取り除く。確定済みの行は pending:delete にしてバックグラウンドで削除する
 * (失敗時は failed:delete のまま通常表示に戻り、クリックしての再編集・削除リトライが可能)。
 */
export function deleteQuestionOptimistic(clientId: string): void {
  const row = rows?.find((r) => r.clientId === clientId);
  if (!row) return;
  if (!row.confirmed) {
    patchRows((rs) => rs.filter((r) => r.clientId !== clientId));
    return;
  }
  patchRows((rs) => rs.map((r) => (r.clientId === clientId ? { ...r, sync: { phase: 'pending', op: 'delete' } } : r)));
  dispatch(clientId, 'delete');
}

// ────────────────────────────────────────────────────────────
// 公開API(既存): 直接 await して結果を受け取る素朴な版。同期状態管理は行わない。
// HistoryPage/TestGenerationPageなど読み取り専用の消費側や、テストから使う。
// ────────────────────────────────────────────────────────────

/** 登録済み問題を一覧で返す(作成日時の降順)。datasetIds を渡すとそのデータセットのみに絞り込む。 */
export async function listQuestions(filter?: { datasetIds?: string[] }): Promise<Question[]> {
  const all = await loadAll();
  const filtered = filter?.datasetIds?.length ? all.filter(q => filter.datasetIds!.includes(q.datasetId)) : all;
  return filtered
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(toQuestion);
}

export async function getQuestion(id: string): Promise<Question | null> {
  const all = await loadAll();
  const found = all.find(q => q.id === id);
  return found ? toQuestion(found) : null;
}

/** 新規登録または更新する。id を渡さない場合は新規作成する。 */
export async function saveQuestion(input: {
  id?: string;
  text: string;
  weight: 1 | 2;
  datasetId: string;
}): Promise<Question> {
  const saved = await repo().save(input);
  if (rows !== null) {
    const idx = rows.findIndex(r => r.id === saved.id);
    const nextRows = rows.slice();
    if (idx >= 0) nextRows[idx] = toSyncedRow(saved);
    else nextRows.push(toSyncedRow(saved));
    rows = nextRows;
    notify();
  }
  return saved;
}

export async function deleteQuestion(id: string): Promise<void> {
  await repo().remove(id);
  if (rows !== null) {
    rows = rows.filter(r => r.id !== id);
    notify();
  }
}

/**
 * 同一データセット内で同一内容(記法テキスト完全一致)の既存問題を探す。
 * excludeClientId は編集中の自分自身を除外するため(clientId は id がサーバー発行の
 * 実IDに置き換わっても変わらないため、これで正しく自分自身を除外できる)。
 * データセットが異なれば「重複」とは扱わない(漢字ワーク由来と試験問題由来で
 * 同じ文が使われることは想定内のため)。
 */
export async function findDuplicate(text: string, datasetId: string, excludeClientId?: string): Promise<Question | null> {
  const target = text.trim();
  const all = await loadAll();
  const found = all.find(q => q.datasetId === datasetId && q.clientId !== excludeClientId && q.text.trim() === target);
  return found ? toQuestion(found) : null;
}

/** 記法を解いた見た目の文字列(一覧表示用。読みは表示せず漢字がそのまま見える形になる) */
export function plainText(text: string): string {
  const { segments } = parse(text);
  return segments.map(seg => seg.char).join('');
}

// ────────────────────────────────────────────────────────────
// 漢字抽出ヘルパー(テスト自動生成の判定ロジックで使用)
// ────────────────────────────────────────────────────────────

/**
 * 出題対象漢字: writeBox / bracketBox セグメントの char(テスト時に隠れる＝出題対象)のうち漢字のみ。
 */
export function targetKanji(text: string): Set<string> {
  const { segments } = parse(text);
  const result = new Set<string>();
  for (const seg of segments) {
    if (seg.kind === 'writeBox' || seg.kind === 'bracketBox') {
      for (const ch of seg.char) {
        if (isKanji(ch)) result.add(ch);
      }
    }
  }
  return result;
}

/**
 * 文中漢字: normal / readBox セグメントの char(常に印刷される＝文脈上見える)のうち漢字のみ。
 * readBox は漢字自体は常に印刷され、出題対象は「読み」であるためここに含める。
 */
export function bodyKanji(text: string): Set<string> {
  const { segments } = parse(text);
  const result = new Set<string>();
  for (const seg of segments) {
    if (seg.kind === 'normal' || seg.kind === 'readBox') {
      for (const ch of seg.char) {
        if (isKanji(ch)) result.add(ch);
      }
    }
  }
  return result;
}

export type QuestionKind = 'write' | 'read' | 'okurigana';

/**
 * 問題テキストに含まれる出題種別(複数あれば複合問題)。
 * writeBox(書き取り枠)→ 'write'、readBox(読み取り枠)→ 'read'、
 * bracketBox(送り仮名付き書き取り枠)→ 'okurigana'。
 */
export function questionKinds(text: string): QuestionKind[] {
  const { segments } = parse(text);
  const kinds = new Set<QuestionKind>();
  for (const seg of segments) {
    if (seg.kind === 'writeBox') kinds.add('write');
    else if (seg.kind === 'readBox') kinds.add('read');
    else if (seg.kind === 'bracketBox') kinds.add('okurigana');
  }
  return [...kinds];
}

/** 問題テキストに含まれるすべての漢字(出題対象＋文中)を返す。漢字範囲チェックに使用。 */
export function allKanji(text: string): Set<string> {
  const result = targetKanji(text);
  for (const ch of bodyKanji(text)) result.add(ch);
  return result;
}

/**
 * 「問われている」漢字(学年バランス判定に使用):
 * writeBox / bracketBox の出題対象漢字 ＋ readBox の漢字(読みが出題対象の漢字)。
 * normal セグメントの漢字はあくまで文脈上の登場に過ぎないためここには含めない。
 */
export function testedKanji(text: string): Set<string> {
  const { segments } = parse(text);
  const result = new Set<string>();
  for (const seg of segments) {
    if (seg.kind === 'writeBox' || seg.kind === 'bracketBox' || seg.kind === 'readBox') {
      for (const ch of seg.char) {
        if (isKanji(ch)) result.add(ch);
      }
    }
  }
  return result;
}

/**
 * 問題の推定学年(一覧表示用)。出題対象漢字の最大学年、無ければ文中漢字の最大学年。
 * 学年配当漢字を一つも含まない問題は null(学年不明)。
 */
export function questionGrade(text: string): Grade | null {
  const testedGrades = [...testedKanji(text)].map(kanjiGrade).filter((g): g is Grade => g !== null);
  if (testedGrades.length > 0) return Math.max(...testedGrades) as Grade;

  const bodyGrades = [...bodyKanji(text)].map(kanjiGrade).filter((g): g is Grade => g !== null);
  if (bodyGrades.length > 0) return Math.max(...bodyGrades) as Grade;

  return null;
}
