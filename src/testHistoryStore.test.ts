import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  countRecentUses,
  deleteHistoryEntry,
  formatTestLabel,
  loadHistory,
  recordTest,
} from './testHistoryStore';

// jsdom のテスト用 localStorage のみを使用する。実ユーザーのブラウザには一切触れない。
beforeEach(() => {
  localStorage.clear();
});

describe('loadHistory', () => {
  it('returns an empty array when nothing is stored', () => {
    expect(loadHistory()).toEqual([]);
  });

  it('falls back to an empty array on corrupted JSON', () => {
    localStorage.setItem('kanji-test-history', '{not json');
    expect(loadHistory()).toEqual([]);
  });

  it('falls back to an empty array when the stored value is not an array', () => {
    localStorage.setItem('kanji-test-history', JSON.stringify({ foo: 'bar' }));
    expect(loadHistory()).toEqual([]);
  });
});

describe('recordTest', () => {
  it('appends an entry with the given question ids and an ISO date', () => {
    const entry = recordTest(['q1', 'q2']);
    expect(entry.questionIds).toEqual(['q1', 'q2']);
    expect(new Date(entry.date).toISOString()).toBe(entry.date);
    expect(loadHistory()).toEqual([entry]);
  });

  it('appends to existing history rather than overwriting it', () => {
    const first = recordTest(['q1']);
    const second = recordTest(['q2']);
    expect(loadHistory()).toEqual([first, second]);
  });

  it('trims history to the most recent 50 entries', () => {
    for (let i = 0; i < 55; i++) {
      recordTest([`q${i}`]);
    }
    const history = loadHistory();
    expect(history).toHaveLength(50);
    // 最初の5件(q0-q4)は切り落とされ、直近50件(q5-q54)が残る
    expect(history[0].questionIds).toEqual(['q5']);
    expect(history.at(-1)?.questionIds).toEqual(['q54']);
  });
});

describe('formatTestLabel', () => {
  it('formats an ISO date as YYYY/MM/DD HH:mm with zero-padding', () => {
    const iso = new Date(2026, 2, 5, 9, 3).toISOString(); // 月は0始まり(2=3月)
    expect(formatTestLabel(iso)).toBe('2026/03/05 09:03');
  });
});

describe('deleteHistoryEntry', () => {
  it('removes only the entry matching the given date key', () => {
    const a = recordTest(['q1']);
    vi.setSystemTime(new Date(Date.now() + 1000));
    const b = recordTest(['q2']);
    deleteHistoryEntry(a.date);
    expect(loadHistory()).toEqual([b]);
    vi.useRealTimers();
  });

  it('is a no-op when the date key does not exist', () => {
    const a = recordTest(['q1']);
    deleteHistoryEntry('not-a-real-date');
    expect(loadHistory()).toEqual([a]);
  });
});

describe('countRecentUses', () => {
  it('counts question id occurrences across the most recent N entries', () => {
    recordTest(['q1', 'q2']);
    recordTest(['q1']);
    recordTest(['q3']);
    const counts = countRecentUses(3);
    expect(counts.get('q1')).toBe(2);
    expect(counts.get('q2')).toBe(1);
    expect(counts.get('q3')).toBe(1);
  });

  it('only looks at the most recent recentCount entries, ignoring older ones', () => {
    recordTest(['old']);
    recordTest(['q1']);
    recordTest(['q2']);
    const counts = countRecentUses(2);
    expect(counts.has('old')).toBe(false);
    expect(counts.get('q1')).toBe(1);
    expect(counts.get('q2')).toBe(1);
  });

  it('returns an empty map when there is no history', () => {
    expect(countRecentUses(10).size).toBe(0);
  });
});
