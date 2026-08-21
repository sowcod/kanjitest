import { GRADE_KANJI, Grade } from './kanjiData.js';

/**
 * 「習った漢字」の管理。
 *
 * 下の学年は学年配当表の全字を既習とみなし、現学年分のみ都度登録した漢字を追加する
 * （vision.md の運用方針どおり）。
 */
export interface LearnedKanjiState {
  currentGrade: Grade;
  /** 現学年で都度追加登録した漢字 */
  learnedThisGrade: string[];
}

const STORAGE_KEY = 'kanji-test-learned-kanji';

const DEFAULT_STATE: LearnedKanjiState = { currentGrade: 1, learnedThisGrade: [] };

export function loadLearnedKanjiState(): LearnedKanjiState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULT_STATE };
  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.currentGrade === 'number' &&
      Array.isArray(parsed?.learnedThisGrade)
    ) {
      return parsed as LearnedKanjiState;
    }
  } catch {
    // fallthrough
  }
  return { ...DEFAULT_STATE };
}

function save(state: LearnedKanjiState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/** 現学年で新しく習った漢字を追加登録する */
export function addLearnedKanji(chars: string[]): LearnedKanjiState {
  const state = loadLearnedKanjiState();
  const set = new Set(state.learnedThisGrade);
  for (const ch of chars) set.add(ch);
  const updated: LearnedKanjiState = { ...state, learnedThisGrade: [...set] };
  save(updated);
  return updated;
}

export function removeLearnedKanji(char: string): LearnedKanjiState {
  const state = loadLearnedKanjiState();
  const updated: LearnedKanjiState = {
    ...state,
    learnedThisGrade: state.learnedThisGrade.filter(c => c !== char),
  };
  save(updated);
  return updated;
}

/**
 * 学年を1つ進める。下位学年の配当表に現学年の全漢字が繰り込まれるため、
 * learnedThisGrade はリセットしてよい（年度更新時に1回だけ操作する想定）。
 */
export function advanceGrade(): LearnedKanjiState {
  const state = loadLearnedKanjiState();
  const nextGrade = Math.min(6, state.currentGrade + 1) as Grade;
  const updated: LearnedKanjiState = { currentGrade: nextGrade, learnedThisGrade: [] };
  save(updated);
  return updated;
}

export function setCurrentGrade(grade: Grade): LearnedKanjiState {
  const updated: LearnedKanjiState = { currentGrade: grade, learnedThisGrade: [] };
  save(updated);
  return updated;
}

/** 現在「習った漢字」とみなされる漢字の集合を返す */
export function computeLearnedKanjiSet(state: LearnedKanjiState): Set<string> {
  const result = new Set<string>();
  for (let g = 1; g < state.currentGrade; g++) {
    for (const ch of GRADE_KANJI[g as Grade]) result.add(ch);
  }
  for (const ch of state.learnedThisGrade) result.add(ch);
  return result;
}
