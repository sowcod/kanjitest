import { useMemo, useState } from 'react';
import {
  addLearnedKanji as addLearnedKanjiToStore,
  advanceGrade as advanceGradeInStore,
  loadLearnedKanjiState,
  removeLearnedKanji as removeLearnedKanjiFromStore,
  setCurrentGrade as setCurrentGradeInStore,
  type LearnedKanjiState,
} from '../learnedKanjiStore';
import type { Grade } from '../kanjiData';

export interface UseLearnedKanji {
  state: LearnedKanjiState;
  learnedThisGradeSet: Set<string>;
  addLearnedKanji: (chars: string[]) => void;
  removeLearnedKanji: (char: string) => void;
  setCurrentGrade: (grade: Grade) => void;
  advanceGrade: () => void;
}

/** 「習った漢字」state を集約するフック。旧UIの renderKanjiTab() の状態部分相当。 */
export function useLearnedKanji(): UseLearnedKanji {
  const [state, setState] = useState<LearnedKanjiState>(() => loadLearnedKanjiState());
  const learnedThisGradeSet = useMemo(() => new Set(state.learnedThisGrade), [state.learnedThisGrade]);

  return {
    state,
    learnedThisGradeSet,
    addLearnedKanji: (chars) => setState(addLearnedKanjiToStore(chars)),
    removeLearnedKanji: (char) => setState(removeLearnedKanjiFromStore(char)),
    setCurrentGrade: (grade) => setState(setCurrentGradeInStore(grade)),
    advanceGrade: () => setState(advanceGradeInStore()),
  };
}
