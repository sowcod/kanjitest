import { beforeEach, describe, expect, it, vi } from 'vitest';

// ────────────────────────────────────────────────────────────
// testHistoryStore.ts はモジュールスコープの全件キャッシュを持つため、datasetStore.test.ts と
// 同様にテストごとに vi.resetModules() で新しいモジュールインスタンスを取得し、
// キャッシュ汚染を避ける。実ユーザーのブラウザ localStorage には一切触れない
// (jsdom のテスト専用 localStorage のみを使用)。
// ────────────────────────────────────────────────────────────

async function freshTestHistoryStore() {
  vi.resetModules();
  return await import('./testHistoryStore');
}

beforeEach(() => {
  localStorage.clear();
});

describe('local-mode CRUD', () => {
  it('starts empty when nothing is stored', async () => {
    const store = await freshTestHistoryStore();
    expect(await store.listTestHistory()).toEqual([]);
  });

  it('falls back to an empty array on corrupted JSON', async () => {
    localStorage.setItem('kanji-test-history', '{not json');
    const store = await freshTestHistoryStore();
    expect(await store.listTestHistory()).toEqual([]);
  });

  it('falls back to an empty array when the stored value is not an array', async () => {
    localStorage.setItem('kanji-test-history', JSON.stringify({ foo: 'bar' }));
    const store = await freshTestHistoryStore();
    expect(await store.listTestHistory()).toEqual([]);
  });

  it('recordTest appends an entry with the given question ids and an ISO date', async () => {
    const store = await freshTestHistoryStore();
    const entry = await store.recordTest(['q1', 'q2']);
    expect(entry.questionIds).toEqual(['q1', 'q2']);
    expect(new Date(entry.date).toISOString()).toBe(entry.date);
    expect(await store.listTestHistory()).toEqual([entry]);
  });

  it('recordTest appends to existing history rather than overwriting it', async () => {
    const store = await freshTestHistoryStore();
    const first = await store.recordTest(['q1']);
    const second = await store.recordTest(['q2']);
    expect(await store.listTestHistory()).toEqual([first, second]);
  });

  it('recordTest trims history to the most recent 50 entries', async () => {
    const store = await freshTestHistoryStore();
    for (let i = 0; i < 55; i++) {
      await store.recordTest([`q${i}`]);
    }
    const history = await store.listTestHistory();
    expect(history).toHaveLength(50);
    // 最初の5件(q0-q4)は切り落とされ、直近50件(q5-q54)が残る
    expect(history[0].questionIds).toEqual(['q5']);
    expect(history.at(-1)?.questionIds).toEqual(['q54']);
  });

  it('deleteHistoryEntry removes only the entry matching the given date key', async () => {
    const store = await freshTestHistoryStore();
    const a = await store.recordTest(['q1']);
    vi.setSystemTime(new Date(Date.now() + 1000));
    const b = await store.recordTest(['q2']);
    await store.deleteHistoryEntry(a.date);
    expect(await store.listTestHistory()).toEqual([b]);
    vi.useRealTimers();
  });

  it('deleteHistoryEntry is a no-op when the date key does not exist', async () => {
    const store = await freshTestHistoryStore();
    const a = await store.recordTest(['q1']);
    await store.deleteHistoryEntry('not-a-real-date');
    expect(await store.listTestHistory()).toEqual([a]);
  });
});

describe('formatTestLabel', () => {
  it('formats an ISO date as YYYY/MM/DD HH:mm with zero-padding', async () => {
    const store = await freshTestHistoryStore();
    const iso = new Date(2026, 2, 5, 9, 3).toISOString(); // 月は0始まり(2=3月)
    expect(store.formatTestLabel(iso)).toBe('2026/03/05 09:03');
  });
});

describe('countRecentUses (純関数: 呼び出し側が履歴配列を渡す)', () => {
  it('counts question id occurrences across the most recent N entries', async () => {
    const store = await freshTestHistoryStore();
    await store.recordTest(['q1', 'q2']);
    await store.recordTest(['q1']);
    await store.recordTest(['q3']);
    const history = await store.listTestHistory();
    const counts = store.countRecentUses(history, 3);
    expect(counts.get('q1')).toBe(2);
    expect(counts.get('q2')).toBe(1);
    expect(counts.get('q3')).toBe(1);
  });

  it('only looks at the most recent recentCount entries, ignoring older ones', async () => {
    const store = await freshTestHistoryStore();
    await store.recordTest(['old']);
    await store.recordTest(['q1']);
    await store.recordTest(['q2']);
    const history = await store.listTestHistory();
    const counts = store.countRecentUses(history, 2);
    expect(counts.has('old')).toBe(false);
    expect(counts.get('q1')).toBe(1);
    expect(counts.get('q2')).toBe(1);
  });

  it('returns an empty map when there is no history', async () => {
    const store = await freshTestHistoryStore();
    expect(store.countRecentUses([], 10).size).toBe(0);
  });
});

describe('モジュールスコープキャッシュ(useSyncExternalStore購読API)', () => {
  it('getTestHistorySnapshot is loading until the initial fetch resolves, then reflects stored history', async () => {
    localStorage.setItem('kanji-test-history', JSON.stringify([{ date: '2026-01-01T00:00:00.000Z', questionIds: ['q1'] }]));
    const store = await freshTestHistoryStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribeTestHistory(listener);

    expect(store.getTestHistorySnapshot().loading).toBe(true);
    await vi.waitFor(() => expect(store.getTestHistorySnapshot().loading).toBe(false));

    expect(store.getTestHistorySnapshot().history).toHaveLength(1);
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it('recordTest updates the cached snapshot immediately, without going through a loading state', async () => {
    const store = await freshTestHistoryStore();
    await store.listTestHistory(); // キャッシュを温める

    const saved = await store.recordTest(['q1']);

    // 再読込を経ずに recordTest の戻り値がそのまま反映されているはず(loading が挟まらない)。
    const snapshot = store.getTestHistorySnapshot();
    expect(snapshot.loading).toBe(false);
    expect(snapshot.history.some((e) => e.date === saved.date)).toBe(true);
  });

  it('deleteHistoryEntry updates the cached snapshot immediately', async () => {
    const store = await freshTestHistoryStore();
    await store.listTestHistory();
    const saved = await store.recordTest(['q1']);

    await store.deleteHistoryEntry(saved.date);

    expect(store.getTestHistorySnapshot().history.some((e) => e.date === saved.date)).toBe(false);
  });

  it('reloadTestHistory discards the cache and re-fetches from the repository', async () => {
    const store = await freshTestHistoryStore();
    await store.listTestHistory();
    const listener = vi.fn();
    const unsubscribe = store.subscribeTestHistory(listener);
    listener.mockClear();

    store.reloadTestHistory();
    expect(store.getTestHistorySnapshot().loading).toBe(true);
    await vi.waitFor(() => expect(store.getTestHistorySnapshot().loading).toBe(false));
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });
});
