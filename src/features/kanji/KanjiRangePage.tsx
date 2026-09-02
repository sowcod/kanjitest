import { useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { useLearnedKanji } from '../../hooks/useLearnedKanji';
import { GRADE_KANJI, type Grade } from '../../kanjiData';
import '../../styles/features.css';

const GRADES: Grade[] = [1, 2, 3, 4, 5, 6];

/** 漢字範囲管理タブ本体。旧UI(index.html)の renderKanjiTab() 相当。 */
export function KanjiRangePage() {
  const { state, learnedThisGradeSet, addLearnedKanji, removeLearnedKanji, setCurrentGrade, advanceGrade } =
    useLearnedKanji();
  const [confirmAdvance, setConfirmAdvance] = useState(false);

  function toggleChar(ch: string) {
    if (learnedThisGradeSet.has(ch)) {
      removeLearnedKanji(ch);
    } else {
      addLearnedKanji([ch]);
    }
  }

  return (
    <div className="k-panel">
      <div className="k-header">
        <label>
          現在の学年:{' '}
          <select value={state.currentGrade} onChange={(e) => setCurrentGrade(Number(e.currentTarget.value) as Grade)}>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {g}年
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn" onClick={() => setConfirmAdvance(true)}>
          学年を進める(年度更新時に1回だけ)
        </button>
      </div>
      <p className="k-hint">
        下の学年の漢字はすべて既習として扱われます。現学年の枠内で、これまでに習った漢字をクリックして登録してください
        (もう一度クリックすると取り消せます)。
      </p>
      <div id="k-grade-lists">
        {GRADES.map((g) => {
          const suffix = g < state.currentGrade ? ' — すべて既習' : g > state.currentGrade ? ' — まだ先の学年' : ' — 現学年';
          return (
            <div className="k-grade-block" key={g}>
              <div className="k-grade-title">
                {g}年生 ({GRADE_KANJI[g].length}字){suffix}
              </div>
              <div className="k-chars">
                {GRADE_KANJI[g].map((ch) => {
                  if (g < state.currentGrade) {
                    return (
                      <div className="k-char locked-past" key={ch}>
                        {ch}
                      </div>
                    );
                  }
                  if (g > state.currentGrade) {
                    return (
                      <div className="k-char locked-future" key={ch}>
                        {ch}
                      </div>
                    );
                  }
                  const learned = learnedThisGradeSet.has(ch);
                  return (
                    <div
                      className={`k-char${learned ? ' learned' : ''}`}
                      key={ch}
                      onClick={() => toggleChar(ch)}
                    >
                      {ch}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog
        open={confirmAdvance}
        title="確認"
        message="学年を1つ進めます。今学年の追加登録した漢字はリセットされます(下位学年としてすべて既習扱いになります)。よろしいですか？"
        danger
        onConfirm={() => {
          setConfirmAdvance(false);
          advanceGrade();
        }}
        onCancel={() => setConfirmAdvance(false)}
      />
    </div>
  );
}
