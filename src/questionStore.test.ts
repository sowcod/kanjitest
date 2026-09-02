import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  allKanji,
  bodyKanji,
  plainText,
  questionGrade,
  questionKinds,
  targetKanji,
  testedKanji,
} from './questionStore';

describe('plainText', () => {
  it('strips notation and returns the rendered characters only', () => {
    expect(plainText('<今>[きょう]は{明日}[あした]の準備をする。')).toBe('今は明日の準備をする。');
  });

  it('collapses a bracketBox group into its literal chars', () => {
    expect(plainText('{{書く}}[かく]')).toBe('書く');
  });
});

describe('targetKanji', () => {
  it('collects kanji from writeBox and bracketBox segments only', () => {
    expect(targetKanji('<今>[きょう]は明日の話。')).toEqual(new Set(['今']));
    expect(targetKanji('{{使う}}[つかう]')).toEqual(new Set(['使']));
  });

  it('excludes kana even inside a write/bracket box', () => {
    expect(targetKanji('<漢字>[かんじ]')).toEqual(new Set(['漢', '字']));
    expect(targetKanji('{{見せる}}[みせる]')).toEqual(new Set(['見']));
  });

  it('is empty when there is no writeBox/bracketBox', () => {
    expect(targetKanji('今日は晴れです。')).toEqual(new Set());
  });
});

describe('bodyKanji', () => {
  it('collects kanji from normal and readBox segments only', () => {
    expect(bodyKanji('今日[[きょう]]は晴れです。')).toEqual(new Set(['今', '日', '晴']));
  });

  it('excludes kanji that only appear inside a writeBox', () => {
    expect(bodyKanji('<今>[きょう]は明日です。')).toEqual(new Set(['明', '日']));
  });
});

describe('questionKinds', () => {
  it('detects write for writeBox segments', () => {
    expect(questionKinds('<今>[きょう]は晴れ。')).toEqual(['write']);
  });

  it('detects read for readBox segments', () => {
    expect(questionKinds('今日[[きょう]]は晴れ。')).toEqual(['read']);
  });

  it('detects okurigana for bracketBox segments', () => {
    expect(questionKinds('{{書く}}[かく]')).toEqual(['okurigana']);
  });

  it('detects a composite question with multiple kinds, de-duplicated', () => {
    const kinds = questionKinds('<今>[きょう]日[[きょう]]{{書く}}[かく]');
    expect(new Set(kinds)).toEqual(new Set(['write', 'read', 'okurigana']));
  });

  it('is empty for plain text with no boxes', () => {
    expect(questionKinds('今日は晴れです。')).toEqual([]);
  });
});

describe('allKanji', () => {
  it('unions targetKanji and bodyKanji', () => {
    expect(allKanji('<今>[きょう]は明日です。')).toEqual(new Set(['今', '明', '日']));
  });
});

describe('testedKanji', () => {
  it('includes writeBox, bracketBox, and readBox kanji, but not plain normal kanji', () => {
    const result = testedKanji('<今>[きょう]日[[きょう]]は明日の話。');
    expect(result).toEqual(new Set(['今', '日']));
    expect(result.has('明')).toBe(false); // normal セグメントの漢字は問われていない
  });
});

describe('questionGrade', () => {
  it('uses the max grade among testedKanji when present', () => {
    // 「今」は2年、「悪」は3年配当 (writeBox = testedKanji)
    expect(questionGrade('<今>[きょう]<悪>[あく]')).toBe(3);
  });

  it('falls back to bodyKanji max grade when there is no testedKanji', () => {
    // writeBox/readBox/bracketBoxが無いので全て normal = bodyKanji。今2/日1/悪3年の最大は3
    expect(questionGrade('今日は悪いです。')).toBe(3);
  });

  it('returns null when the text has no grade-table kanji at all', () => {
    expect(questionGrade('これはひらがなのみです。')).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────
// CRUD (ローカルストレージモード)
//
// questionStore.ts はモジュールスコープの全件キャッシュを持つため、
// テストごとに vi.resetModules() で新しいモジュールインスタンスを取得し、
// キャッシュ汚染を避ける。実ユーザーのブラウザ localStorage には一切触れない
// (jsdom のテスト専用 localStorage のみを使用)。
// ────────────────────────────────────────────────────────────

async function freshQuestionStore() {
  vi.resetModules();
  return await import('./questionStore');
}

beforeEach(() => {
  localStorage.clear();
});

describe('local-mode CRUD', () => {
  it('starts empty and saveQuestion creates a new question with an id/timestamps', async () => {
    const store = await freshQuestionStore();
    expect(await store.listQuestions()).toEqual([]);

    const saved = await store.saveQuestion({ text: '今[きょう]日', weight: 1, datasetId: 'default' });
    expect(saved.id).toBeTruthy();
    expect(saved.text).toBe('今[きょう]日');
    expect(saved.createdAt).toBe(saved.updatedAt);

    const all = await store.listQuestions();
    expect(all).toEqual([saved]);
  });

  it('saveQuestion with an existing id updates in place and bumps updatedAt', async () => {
    const store = await freshQuestionStore();
    const created = await store.saveQuestion({ text: 'A', weight: 1, datasetId: 'default' });

    vi.setSystemTime(new Date(Date.now() + 1000));
    const updated = await store.saveQuestion({ id: created.id, text: 'B', weight: 2, datasetId: 'default' });
    vi.useRealTimers();

    expect(updated.id).toBe(created.id);
    expect(updated.text).toBe('B');
    expect(updated.weight).toBe(2);
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.updatedAt).not.toBe(created.updatedAt);

    const all = await store.listQuestions();
    expect(all).toHaveLength(1);
  });

  it('getQuestion finds by id, returns null when missing', async () => {
    const store = await freshQuestionStore();
    const created = await store.saveQuestion({ text: 'A', weight: 1, datasetId: 'default' });
    expect(await store.getQuestion(created.id)).toEqual(created);
    expect(await store.getQuestion('nonexistent')).toBeNull();
  });

  it('deleteQuestion removes the question from subsequent listQuestions calls', async () => {
    const store = await freshQuestionStore();
    const created = await store.saveQuestion({ text: 'A', weight: 1, datasetId: 'default' });
    await store.deleteQuestion(created.id);
    expect(await store.listQuestions()).toEqual([]);
  });

  it('listQuestions sorts by createdAt descending', async () => {
    const store = await freshQuestionStore();
    const first = await store.saveQuestion({ text: 'first', weight: 1, datasetId: 'default' });
    vi.setSystemTime(new Date(Date.now() + 1000));
    const second = await store.saveQuestion({ text: 'second', weight: 1, datasetId: 'default' });
    vi.useRealTimers();

    expect(await store.listQuestions()).toEqual([second, first]);
  });

  it('listQuestions filters by datasetIds when given', async () => {
    const store = await freshQuestionStore();
    await store.saveQuestion({ text: 'a', weight: 1, datasetId: 'ds1' });
    const b = await store.saveQuestion({ text: 'b', weight: 1, datasetId: 'ds2' });

    expect(await store.listQuestions({ datasetIds: ['ds2'] })).toEqual([b]);
  });

  it('findDuplicate matches trimmed text within the same dataset only', async () => {
    const store = await freshQuestionStore();
    const original = await store.saveQuestion({ text: '同じ文', weight: 1, datasetId: 'ds1' });
    await store.saveQuestion({ text: '同じ文', weight: 1, datasetId: 'ds2' }); // 別データセットなので重複扱いしない

    expect(await store.findDuplicate('  同じ文  ', 'ds1')).toEqual(original);
    expect(await store.findDuplicate('同じ文', 'ds2', undefined)).not.toBeNull();
    expect(await store.findDuplicate('違う文', 'ds1')).toBeNull();
  });

  it('findDuplicate excludes the question being edited via excludeId', async () => {
    const store = await freshQuestionStore();
    const original = await store.saveQuestion({ text: 'X', weight: 1, datasetId: 'ds1' });
    expect(await store.findDuplicate('X', 'ds1', original.id)).toBeNull();
  });
});
