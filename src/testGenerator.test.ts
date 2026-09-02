import { describe, expect, it } from 'vitest';
import { GRADE_KANJI } from './kanjiData';
import type { Question } from './questionStore';
import type { Settings } from './settingsStore';
import { assignColumns, promoteAdjacentWriteKanji, selectQuestions } from './testGenerator';

function mkQuestion(id: string, text: string, weight: 1 | 2 = 1): Question {
  return { id, text, weight, datasetId: 'd', createdAt: id, updatedAt: id };
}

const BASE_SETTINGS: Settings = {
  reviewRatio: 0.2,
  recentHistoryCount: 10,
  questionsPerTest: 10,
  slotsPerColumn: 2,
  readRatio: 0,
  okuriganaRatio: 0,
  promoteAdjacentWriteKanji: false,
  sourceDatasetIds: [],
};

describe('promoteAdjacentWriteKanji', () => {
  it('promotes an adjacent learned ruby char into a write box', () => {
    const result = promoteAdjacentWriteKanji('<漢>[かん]字[じ]', new Set(['字']));
    expect(result).toBe('<漢>[かん]<字>[じ]');
  });

  it('does not promote an unlearned adjacent char', () => {
    const result = promoteAdjacentWriteKanji('<漢>[かん]字[じ]', new Set());
    expect(result).toBe('<漢>[かん]字[じ]');
  });

  it('stops the chain at a non-ruby boundary character', () => {
    const result = promoteAdjacentWriteKanji('<漢>[かん]あ字[じ]', new Set(['字']));
    // あ が境界になるため、字 は連鎖が届かず昇格しない
    expect(result).toBe('<漢>[かん]あ字[じ]');
  });

  it('only promotes as far as the learned-kanji chain reaches', () => {
    const result = promoteAdjacentWriteKanji('<漢>[かん]字[じ]方[かた]', new Set(['字']));
    // 字は学習済みなので昇格するが、方は学習済みでないため昇格しない
    expect(result).toBe('<漢>[かん]<字>[じ]方[かた]');
  });

  it('chains promotion in both directions from the write box', () => {
    const result = promoteAdjacentWriteKanji('字[じ]<漢>[かん]方[かた]', new Set(['字', '方']));
    expect(result).toBe('<字>[じ]<漢>[かん]<方>[かた]');
  });

  it('leaves text with no write box unchanged', () => {
    const result = promoteAdjacentWriteKanji('字[じ]漢[かん]', new Set(['字', '漢']));
    expect(result).toBe('字[じ]漢[かん]');
  });
});

describe('selectQuestions: eligibility', () => {
  it('warns and selects nothing when there are no questions', () => {
    const result = selectQuestions([], new Set(), 1, new Map(), BASE_SETTINGS);
    expect(result.selected).toEqual([]);
    expect(result.warnings).toEqual(['習った漢字の範囲内で使える問題がありません。問題を登録してください。']);
  });

  it('warns and selects nothing when every question uses unlearned kanji', () => {
    const questions = [mkQuestion('q1', '悪'), mkQuestion('q2', '安')];
    const result = selectQuestions(questions, new Set(['違']), 1, new Map(), BASE_SETTINGS);
    expect(result.selected).toEqual([]);
    expect(result.warnings).toEqual(['習った漢字の範囲内で使える問題がありません。問題を登録してください。']);
  });

  it('never includes a question whose kanji falls outside learnedKanji, even when eligible ones exist', () => {
    const learned = new Set(['一', '二']);
    const questions = [mkQuestion('ok1', '一'), mkQuestion('ok2', '二'), mkQuestion('bad', '悪')];
    const result = selectQuestions(questions, learned, 1, new Map(), { ...BASE_SETTINGS, questionsPerTest: 2 });
    expect(result.selected.map(q => q.id).sort()).toEqual(['ok1', 'ok2']);
  });
});

describe('selectQuestions: grade-balance budget split', () => {
  it('splits the grade budget between review (below currentGrade) and current pools per reviewRatio', () => {
    const reviewChars = GRADE_KANJI[1].slice(0, 5);
    const currentChars = GRADE_KANJI[3].slice(0, 12);
    const reviewIds = new Set(reviewChars.map((_, i) => `review${i}`));
    const currentIds = new Set(currentChars.map((_, i) => `current${i}`));

    const questions = [
      ...reviewChars.map((ch, i) => mkQuestion(`review${i}`, ch)),
      ...currentChars.map((ch, i) => mkQuestion(`current${i}`, ch)),
    ];
    const learned = new Set([...GRADE_KANJI[1], ...GRADE_KANJI[2], ...GRADE_KANJI[3]]);

    const result = selectQuestions(questions, learned, 3, new Map(), BASE_SETTINGS);

    expect(result.warnings).toEqual([]);
    expect(result.selected).toHaveLength(10);
    const reviewCount = result.selected.filter(q => reviewIds.has(q.id)).length;
    const currentCount = result.selected.filter(q => currentIds.has(q.id)).length;
    // reviewRatio=0.2, questionsPerTest=10 -> review 2問, current 8問 (十分な候補があるため確定的)
    expect(reviewCount).toBe(2);
    expect(currentCount).toBe(8);
  });

  it('carries unfilled review budget over to the current pool when review candidates run short', () => {
    const reviewChars = GRADE_KANJI[1].slice(0, 1); // reviewTarget(2)より少ない候補数
    const currentChars = GRADE_KANJI[3].slice(0, 12);
    const questions = [
      ...reviewChars.map((ch, i) => mkQuestion(`review${i}`, ch)),
      ...currentChars.map((ch, i) => mkQuestion(`current${i}`, ch)),
    ];
    const learned = new Set([...GRADE_KANJI[1], ...GRADE_KANJI[2], ...GRADE_KANJI[3]]);

    const result = selectQuestions(questions, learned, 3, new Map(), BASE_SETTINGS);

    expect(result.warnings).toEqual([]);
    expect(result.selected).toHaveLength(10); // 1問だけ review、残り9問は current で埋め合わせられる
  });
});

describe('selectQuestions: niche kind (read/okurigana) reservation', () => {
  it('reserves a readRatio-sized slice of the budget for read-type questions', () => {
    const readChars = GRADE_KANJI[1].slice(0, 5);
    const plainChars = GRADE_KANJI[1].slice(5, 8);
    const readIds = new Set(readChars.map((_, i) => `read${i}`));

    const questions = [
      ...readChars.map((ch, i) => mkQuestion(`read${i}`, `${ch}[[よみ]]`)),
      ...plainChars.map((ch, i) => mkQuestion(`plain${i}`, ch)),
    ];
    const learned = new Set(GRADE_KANJI[1]);
    const settings: Settings = { ...BASE_SETTINGS, questionsPerTest: 6, readRatio: 0.5, reviewRatio: 0 };

    const result = selectQuestions(questions, learned, 1, new Map(), settings);

    expect(result.warnings).toEqual([]);
    expect(result.selected).toHaveLength(6);
    const readCount = result.selected.filter(q => readIds.has(q.id)).length;
    // readTarget = round(6*0.5) = 3, 候補が十分にあるため確定的
    expect(readCount).toBe(3);
  });

  it('does not select any read/okurigana question when both ratios are 0, even as a shortfall fallback', () => {
    const readChars = GRADE_KANJI[1].slice(0, 5);
    const plainChars = GRADE_KANJI[1].slice(5, 6); // 予算に対して不足させる
    const questions = [
      ...readChars.map((ch, i) => mkQuestion(`read${i}`, `${ch}[[よみ]]`)),
      ...plainChars.map((ch, i) => mkQuestion(`plain${i}`, ch)),
    ];
    const learned = new Set(GRADE_KANJI[1]);
    const settings: Settings = { ...BASE_SETTINGS, questionsPerTest: 6, readRatio: 0, okuriganaRatio: 0 };

    const result = selectQuestions(questions, learned, 1, new Map(), settings);

    expect(result.selected.every(q => q.id.startsWith('plain'))).toBe(true);
    expect(result.warnings.some(w => w.includes('問題数が不足'))).toBe(true);
  });
});

describe('selectQuestions: insufficient candidates', () => {
  it('warns with the exact shortfall amount and still returns every eligible question', () => {
    const chars = GRADE_KANJI[1].slice(0, 3);
    const questions = chars.map((ch, i) => mkQuestion(`q${i}`, ch));
    const learned = new Set(GRADE_KANJI[1]);

    const result = selectQuestions(questions, learned, 1, new Map(), { ...BASE_SETTINGS, reviewRatio: 0 });

    expect(result.selected).toHaveLength(3);
    expect(result.warnings).toContain('問題数が不足しています。あと7問相当を登録してください（今回は問題3件で生成します）。');
  });
});

describe('assignColumns', () => {
  const measureHeight = (text: string) => Number(text);

  it('gives a weight>=slotsPerColumn question its own column', () => {
    const wide = mkQuestion('w', 'ignored-height', 2);
    const { columns } = assignColumns([wide], measureHeight, 2);
    expect(columns).toEqual([[wide]]);
  });

  it('pairs narrow questions by max+min height (swap pairing) for an even count', () => {
    const q100 = mkQuestion('a', '100');
    const q80 = mkQuestion('b', '80');
    const q60 = mkQuestion('c', '60');
    const q40 = mkQuestion('d', '40');
    const { columns } = assignColumns([q60, q100, q40, q80], measureHeight, 2);
    expect(columns).toEqual([
      [q100, q40],
      [q80, q60],
    ]);
  });

  it('puts the leftover question alone in its own column for an odd count', () => {
    const q30 = mkQuestion('a', '30');
    const q20 = mkQuestion('b', '20');
    const q10 = mkQuestion('c', '10');
    const { columns } = assignColumns([q30, q20, q10], measureHeight, 2);
    expect(columns).toEqual([
      [q30, q10],
      [q20],
    ]);
  });

  it('places wide-question columns before narrow-pair columns', () => {
    const wide = mkQuestion('w', 'x', 2);
    const q10 = mkQuestion('a', '10');
    const q5 = mkQuestion('b', '5');
    const { columns } = assignColumns([q10, wide, q5], measureHeight, 2);
    expect(columns[0]).toEqual([wide]);
    expect(columns[1]).toEqual([q10, q5]);
  });
});
