import { beforeEach, describe, expect, it } from 'vitest';
import { GRADE_KANJI } from './kanjiData';
import {
  addLearnedKanji,
  advanceGrade,
  computeLearnedKanjiSet,
  loadLearnedKanjiState,
  removeLearnedKanji,
  setCurrentGrade,
} from './learnedKanjiStore';

// jsdom のテスト用 localStorage のみを使用する。実ユーザーのブラウザには一切触れない。
beforeEach(() => {
  localStorage.clear();
});

describe('loadLearnedKanjiState', () => {
  it('defaults to grade 1 with no learned kanji when nothing is stored', () => {
    expect(loadLearnedKanjiState()).toEqual({ currentGrade: 1, learnedThisGrade: [] });
  });

  it('falls back to defaults on corrupted JSON', () => {
    localStorage.setItem('kanji-test-learned-kanji', '{not json');
    expect(loadLearnedKanjiState()).toEqual({ currentGrade: 1, learnedThisGrade: [] });
  });

  it('falls back to defaults when the shape is invalid', () => {
    localStorage.setItem('kanji-test-learned-kanji', JSON.stringify({ currentGrade: '3', learnedThisGrade: 'x' }));
    expect(loadLearnedKanjiState()).toEqual({ currentGrade: 1, learnedThisGrade: [] });
  });
});

describe('addLearnedKanji / removeLearnedKanji', () => {
  it('adds new kanji and persists them', () => {
    addLearnedKanji(['悪', '安']);
    expect(loadLearnedKanjiState().learnedThisGrade.sort()).toEqual(['安', '悪']);
  });

  it('de-duplicates repeated additions', () => {
    addLearnedKanji(['悪']);
    addLearnedKanji(['悪', '安']);
    expect(loadLearnedKanjiState().learnedThisGrade.sort()).toEqual(['安', '悪']);
  });

  it('removes a single kanji without touching others', () => {
    addLearnedKanji(['悪', '安', '暗']);
    removeLearnedKanji('安');
    expect(loadLearnedKanjiState().learnedThisGrade.sort()).toEqual(['悪', '暗']);
  });

  it('removing a kanji that was never added is a no-op', () => {
    addLearnedKanji(['悪']);
    removeLearnedKanji('安');
    expect(loadLearnedKanjiState().learnedThisGrade).toEqual(['悪']);
  });
});

describe('advanceGrade', () => {
  it('increments the grade and resets learnedThisGrade', () => {
    setCurrentGrade(2);
    addLearnedKanji(['悪']);
    const result = advanceGrade();
    expect(result).toEqual({ currentGrade: 3, learnedThisGrade: [] });
  });

  it('caps at grade 6', () => {
    setCurrentGrade(6);
    const result = advanceGrade();
    expect(result.currentGrade).toBe(6);
  });
});

describe('setCurrentGrade', () => {
  it('sets the grade directly and resets learnedThisGrade', () => {
    addLearnedKanji(['悪']);
    const result = setCurrentGrade(4);
    expect(result).toEqual({ currentGrade: 4, learnedThisGrade: [] });
  });
});

describe('computeLearnedKanjiSet', () => {
  it('includes no grade-table kanji for grade 1 (only learnedThisGrade)', () => {
    const set = computeLearnedKanjiSet({ currentGrade: 1, learnedThisGrade: ['一'] });
    expect(set.has('一')).toBe(true);
    expect(set.size).toBe(1);
  });

  it('includes all kanji from grades below currentGrade, but not currentGrade itself', () => {
    const set = computeLearnedKanjiSet({ currentGrade: 3, learnedThisGrade: [] });
    for (const ch of GRADE_KANJI[1]) expect(set.has(ch)).toBe(true);
    for (const ch of GRADE_KANJI[2]) expect(set.has(ch)).toBe(true);
    // 3年生自体の配当表はまだ含まれない
    for (const ch of GRADE_KANJI[3]) expect(set.has(ch)).toBe(false);
  });

  it('merges learnedThisGrade on top of the lower-grade tables', () => {
    const set = computeLearnedKanjiSet({ currentGrade: 3, learnedThisGrade: ['悪'] });
    expect(set.has('悪')).toBe(true); // 3年配当表の字だが都度登録で追加済み
    expect(set.has('一')).toBe(true); // 1年配当表由来
  });
});
