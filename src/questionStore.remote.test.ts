import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./remoteConfigStore.js', () => ({
  resolveDataSourceMode: () => 'remote',
}));

const { remoteGet, remotePost } = vi.hoisted(() => ({ remoteGet: vi.fn(), remotePost: vi.fn() }));
vi.mock('./remoteApiClient.js', () => ({ remoteGet, remotePost }));

// questionStore.ts はモジュールスコープの単一ストアを持つため、テストごとに
// vi.resetModules() で新しいモジュールインスタンスを取得してキャッシュ汚染を避ける。
async function freshQuestionStore() {
  vi.resetModules();
  remoteGet.mockReset();
  remotePost.mockReset();
  remoteGet.mockResolvedValue({ questions: [] });
  return await import('./questionStore');
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flush() {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  localStorage.clear();
});

describe('remote-mode optimistic sync', () => {
  it('createQuestionOptimistic reflects to rows immediately with a pending status, before the network resolves', async () => {
    const store = await freshQuestionStore();
    await store.listQuestions(); // 初回ロード(空リスト)を待ってから検証する

    const d = deferred<{ question: unknown }>();
    remotePost.mockReturnValue(d.promise);

    const clientId = store.createQuestionOptimistic({ text: 'A', weight: 1, datasetId: 'default' });

    const snapshot = store.getQuestionsSnapshot();
    const row = snapshot.rows.find((r) => r.clientId === clientId);
    expect(row).toBeTruthy();
    expect(row!.sync).toEqual({ phase: 'pending', op: 'create' });
    expect(row!.confirmed).toBe(false);
    expect(row!.text).toBe('A');
    expect(remotePost).toHaveBeenCalledTimes(1);

    d.resolve({ question: { id: 'server-1', text: 'A', weight: 1, datasetId: 'default', createdAt: 't', updatedAt: 't' } });
    await flush();

    const after = store.getQuestionsSnapshot().rows.find((r) => r.clientId === clientId);
    expect(after!.sync).toEqual({ phase: 'synced' });
    expect(after!.confirmed).toBe(true);
    expect(after!.id).toBe('server-1');
    expect(after!.clientId).toBe(clientId); // clientId はサーバーIDへの差し替え後も不変
  });

  it('allows starting a second create immediately, without waiting for the first to resolve', async () => {
    const store = await freshQuestionStore();
    await store.listQuestions();

    remotePost.mockReturnValue(new Promise(() => {})); // 解決しない = ネットワーク応答待ちを模す

    const first = store.createQuestionOptimistic({ text: 'first', weight: 1, datasetId: 'default' });
    const second = store.createQuestionOptimistic({ text: 'second', weight: 1, datasetId: 'default' });

    expect(first).not.toBe(second);
    const rows = store.getQuestionsSnapshot().rows;
    expect(rows.map((r) => r.text).sort()).toEqual(['first', 'second']);
    expect(rows.every((r) => r.sync.phase === 'pending')).toBe(true);
  });

  it('marks a row as failed when the background create rejects, and retrying via update succeeds', async () => {
    const store = await freshQuestionStore();
    await store.listQuestions();

    const d1 = deferred<unknown>();
    remotePost.mockReturnValueOnce(d1.promise);

    const clientId = store.createQuestionOptimistic({ text: 'A', weight: 1, datasetId: 'default' });
    d1.reject(new Error('network down'));
    await flush();

    const failed = store.getQuestionsSnapshot().rows.find((r) => r.clientId === clientId);
    expect(failed!.sync).toEqual({ phase: 'failed', op: 'create', error: 'network down' });
    expect(failed!.confirmed).toBe(false);

    const d2 = deferred<{ question: unknown }>();
    remotePost.mockReturnValueOnce(d2.promise);
    store.updateQuestionOptimistic(clientId, { text: 'A retried', weight: 1, datasetId: 'default' });

    const pending = store.getQuestionsSnapshot().rows.find((r) => r.clientId === clientId);
    expect(pending!.sync).toEqual({ phase: 'pending', op: 'create' }); // 未確定行なので再送も create として扱う

    d2.resolve({ question: { id: 'server-2', text: 'A retried', weight: 1, datasetId: 'default', createdAt: 't', updatedAt: 't2' } });
    await flush();

    const synced = store.getQuestionsSnapshot().rows.find((r) => r.clientId === clientId);
    expect(synced!.sync).toEqual({ phase: 'synced' });
    expect(synced!.confirmed).toBe(true);
    expect(synced!.id).toBe('server-2');
    expect(synced!.text).toBe('A retried');
  });

  it('queues a second save while the first is still in flight, and runs it with the latest data once the first resolves', async () => {
    const store = await freshQuestionStore();
    await store.listQuestions();

    const d1 = deferred<{ question: unknown }>();
    remotePost.mockReturnValueOnce(d1.promise);

    const clientId = store.createQuestionOptimistic({ text: 'v1', weight: 1, datasetId: 'default' });
    expect(remotePost).toHaveBeenCalledTimes(1);

    // 最初の作成がまだ解決していないうちに、続けて更新をかける(= 保存後の連続編集を模す)。
    const d2 = deferred<{ question: unknown }>();
    remotePost.mockReturnValueOnce(d2.promise);
    store.updateQuestionOptimistic(clientId, { text: 'v2', weight: 1, datasetId: 'default' });

    // 表示上は即座に v2 になるが、ネットワーク呼び出しはまだ1回目しか発生していない(キュー待ち)。
    // 未確定行なのでラベルは(1回目の意図どおり)「create」のまま。
    const queued = store.getQuestionsSnapshot().rows.find((r) => r.clientId === clientId);
    expect(queued!.text).toBe('v2');
    expect(queued!.sync).toEqual({ phase: 'pending', op: 'create' });
    expect(remotePost).toHaveBeenCalledTimes(1);

    d1.resolve({ question: { id: 'server-1', text: 'v1', weight: 1, datasetId: 'default', createdAt: 't', updatedAt: 't' } });
    await flush();

    // 1回目の完了後、キューにあった更新が自動的に実行される(2回目の呼び出しが発生)。
    // このとき送信される text は現在の行の値(v2)であること — 1回目の応答(v1)で上書きされていないこと。
    expect(remotePost).toHaveBeenCalledTimes(2);
    expect(remotePost).toHaveBeenLastCalledWith('saveQuestion', {
      question: { id: 'server-1', text: 'v2', weight: 1, datasetId: 'default' },
    });

    d2.resolve({ question: { id: 'server-1', text: 'v2', weight: 1, datasetId: 'default', createdAt: 't', updatedAt: 't2' } });
    await flush();

    const finalRow = store.getQuestionsSnapshot().rows.find((r) => r.clientId === clientId);
    expect(finalRow!.sync).toEqual({ phase: 'synced' });
    expect(finalRow!.text).toBe('v2');
  });

  it('deleteQuestionOptimistic on an unconfirmed row removes it locally without any network call', async () => {
    const store = await freshQuestionStore();
    await store.listQuestions();

    remotePost.mockReturnValue(new Promise(() => {}));
    const clientId = store.createQuestionOptimistic({ text: 'A', weight: 1, datasetId: 'default' });
    expect(remotePost).toHaveBeenCalledTimes(1);

    store.deleteQuestionOptimistic(clientId);

    expect(store.getQuestionsSnapshot().rows.find((r) => r.clientId === clientId)).toBeUndefined();
    expect(remotePost).toHaveBeenCalledTimes(1); // 削除自体はネットワークを呼ばない
  });

  it('deleteQuestionOptimistic on a confirmed row goes through pending:delete and failed:delete on rejection', async () => {
    const store = await freshQuestionStore();
    await store.listQuestions();

    const d1 = deferred<{ question: unknown }>();
    remotePost.mockReturnValueOnce(d1.promise);
    const clientId = store.createQuestionOptimistic({ text: 'A', weight: 1, datasetId: 'default' });
    d1.resolve({ question: { id: 'server-1', text: 'A', weight: 1, datasetId: 'default', createdAt: 't', updatedAt: 't' } });
    await flush();
    expect(store.getQuestionsSnapshot().rows.find((r) => r.clientId === clientId)!.confirmed).toBe(true);

    const d2 = deferred<unknown>();
    remotePost.mockReturnValueOnce(d2.promise);
    store.deleteQuestionOptimistic(clientId);
    expect(store.getQuestionsSnapshot().rows.find((r) => r.clientId === clientId)!.sync).toEqual({ phase: 'pending', op: 'delete' });

    d2.reject(new Error('delete failed'));
    await flush();

    const row = store.getQuestionsSnapshot().rows.find((r) => r.clientId === clientId);
    expect(row!.sync).toEqual({ phase: 'failed', op: 'delete', error: 'delete failed' });
  });
});
