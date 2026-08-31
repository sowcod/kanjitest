import { Question, targetKanji, bodyKanji, allKanji, questionKinds, questionGrade } from './questionStore.js';
import { Grade, isKanji } from './kanjiData.js';
import { tokenize } from './parser.js';
import { Settings } from './settingsStore.js';

export interface SelectionResult {
  selected: Question[];
  warnings: string[];
}

/**
 * 書き問題に連なる「漢字[よみ]」を、既習済みの場合だけ書き問題へ昇格させる。
 *
 * 昇格対象は1字の通常ルビであり、ひらがな・句読点・ルビのない漢字などが間に入ると
 * その地点で連鎖は止まる。元から <...>[...] である書き問題を起点として、
 * 同じ連続列にある既習済み漢字をすべて昇格するため、前後どちらへの連鎖にも対応する。
 */
export function promoteAdjacentWriteKanji(text: string, learnedKanji: Set<string>): string {
  const tokens = tokenize(text);
  const promote = new Set<number>();

  type Unit = { start: number; end: number; char: string; write: boolean };
  const units: Unit[] = [];
  for (let i = 0; i < tokens.length;) {
    const token = tokens[i];
    const next = tokens[i + 1];
    if (
      token.kind === 'ANGLE_GROUP' &&
      [...token.value].length > 0 &&
      [...token.value].every(isKanji) &&
      next?.kind === 'RUBY1'
    ) {
      units.push({ start: i, end: i + 1, char: token.value, write: true });
      i += 2;
    } else if (
      token.kind === 'CHAR' &&
      isKanji(token.value) &&
      next?.kind === 'RUBY1'
    ) {
      units.push({ start: i, end: i + 1, char: token.value, write: false });
      i += 2;
    } else {
      // 非対象トークンを境にして連続列を切るための印として保持する。
      units.push({ start: i, end: i, char: '', write: false });
      i += 1;
    }
  }

  for (let i = 0; i < units.length;) {
    if (!units[i].char) { i++; continue; }
    let end = i;
    while (end < units.length && units[end].char) end++;

    // 書き問題を起点に、既習済みの隣接漢字へだけ広げる。未習漢字は通り抜けない。
    const reached = new Set<number>();
    const queue: number[] = [];
    for (let j = i; j < end; j++) {
      if (units[j].write) {
        reached.add(j);
        queue.push(j);
      }
    }
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const next of [current - 1, current + 1]) {
        if (next < i || next >= end || reached.has(next)) continue;
        if (!units[next].write && !learnedKanji.has(units[next].char)) continue;
        reached.add(next);
        queue.push(next);
        if (!units[next].write) promote.add(units[next].start);
      }
    }
    i = end;
  }

  return tokens.map((token, i) => promote.has(i) ? `<${token.text}>` : token.text).join('');
}

function isSubset(sub: Set<string>, sup: Set<string>): boolean {
  for (const x of sub) if (!sup.has(x)) return false;
  return true;
}

/** 学年配当漢字を含まず学年不明な問題は、現学年扱いにする（テスト選出専用のフォールバック） */
function effectiveGrade(q: Question, currentGrade: Grade): number {
  return questionGrade(q.text) ?? currentGrade;
}

/** 直近の出題回数が多いほど選ばれにくくする重み付きシャッフル（Efraimidis-Spirakis法） */
function weightedShuffle(pool: Question[], recentUses: Map<string, number>): Question[] {
  return pool
    .map(q => {
      const weight = 1 / (1 + (recentUses.get(q.id) ?? 0));
      const key = Math.pow(Math.random(), 1 / weight);
      return { q, key };
    })
    .sort((a, b) => b.key - a.key)
    .map(x => x.q);
}

/** 出題対象漢字が他の選出済み問題の文中に出現していないか（vision.mdルール2） */
function conflictsWithSelected(candidate: Question, selected: Question[]): boolean {
  const candTarget = targetKanji(candidate.text);
  const candBody = bodyKanji(candidate.text);
  for (const s of selected) {
    const sTarget = targetKanji(s.text);
    const sBody = bodyKanji(s.text);
    for (const ch of candTarget) if (sBody.has(ch)) return true;
    for (const ch of sTarget) if (candBody.has(ch)) return true;
  }
  return false;
}

function fillGreedy(
  candidates: Question[],
  selected: Question[],
  remainingWeight: number,
  respectConflicts: boolean,
): { selected: Question[]; remainingWeight: number } {
  const result = [...selected];
  let remaining = remainingWeight;
  for (const cand of candidates) {
    if (remaining <= 0) break;
    if (result.some(q => q.id === cand.id)) continue;
    if (cand.weight > remaining) continue;
    if (respectConflicts && conflictsWithSelected(cand, result)) continue;
    result.push(cand);
    remaining -= cand.weight;
  }
  return { selected: result, remainingWeight: remaining };
}

/**
 * 登録済み問題からテスト1回分（重み合計 `settings.questionsPerTest`）を選出する。
 *
 * 1. 習った漢字の範囲内の問題のみを候補にする（ルール1）
 * 2. 出題タイプ（読み／送り仮名）のニッチ枠を `readRatio`/`okuriganaRatio` の割合で優先的に確保する
 * 3. 残り予算を現学年プールと下位学年プールに分け、下位学年を `reviewRatio` の割合で混ぜる
 * 4. 出題対象漢字が他の問題の文中に出てこないよう重複を避けつつ選出する（ルール2, できるだけ）
 * 5. 重複を避けきれない／問題が足りない場合は警告を返しつつベストエフォートで選出する
 */
export function selectQuestions(
  questions: Question[],
  learnedKanji: Set<string>,
  currentGrade: Grade,
  recentUses: Map<string, number>,
  settings: Settings,
): SelectionResult {
  const warnings: string[] = [];
  const eligible = questions.filter(q => isSubset(allKanji(q.text), learnedKanji));

  if (eligible.length === 0) {
    warnings.push('習った漢字の範囲内で使える問題がありません。問題を登録してください。');
    return { selected: [], warnings };
  }

  const total = settings.questionsPerTest;

  // ── 出題タイプ（読み／送り仮名）のニッチ枠を先に確保する ──
  // readRatio/okuriganaRatio が既定値0の場合、以降の nicheUsed は常に0になり、
  // 学年バランス選出に渡る予算は total のまま（既存挙動と完全に一致する）。
  const isNicheKind = (q: Question): boolean => {
    const kinds = questionKinds(q.text);
    return kinds.includes('okurigana') || kinds.includes('read');
  };

  const okuriganaPool = weightedShuffle(
    eligible.filter(q => questionKinds(q.text).includes('okurigana')),
    recentUses,
  );
  const readPool = weightedShuffle(
    eligible.filter(q => questionKinds(q.text).includes('read')),
    recentUses,
  );
  const okuriganaTarget = Math.round(total * settings.okuriganaRatio);
  const readTarget = Math.round(total * settings.readRatio);

  const nicheStep1 = fillGreedy(okuriganaPool, [], okuriganaTarget, true);
  // 送り仮名枠が埋まらなかった分は読み枠に繰り越す
  const nicheStep2 = fillGreedy(readPool, nicheStep1.selected, readTarget + nicheStep1.remainingWeight, true);
  const nicheUsed = okuriganaTarget + readTarget - nicheStep2.remainingWeight;

  const gradeBudget = total - nicheUsed;

  // 読み／送り仮名の枠はニッチ枠(上記)のみで扱う。学年バランス側の通常プールに混ざると
  // readRatio/okuriganaRatio=0 の設定でも読み・送り仮名問題が選ばれてしまうため、ここで除外する。
  const reviewPool = weightedShuffle(
    eligible.filter(q => effectiveGrade(q, currentGrade) < currentGrade && !isNicheKind(q)),
    recentUses,
  );
  const currentPool = weightedShuffle(
    eligible.filter(q => effectiveGrade(q, currentGrade) >= currentGrade && !isNicheKind(q)),
    recentUses,
  );

  const reviewTarget = Math.round(gradeBudget * settings.reviewRatio);
  const currentTarget = gradeBudget - reviewTarget;

  const step1 = fillGreedy(reviewPool, nicheStep2.selected, reviewTarget, true);
  // 下位学年プールで埋まらなかった分は現学年プールで埋め合わせる
  const step2 = fillGreedy(currentPool, step1.selected, currentTarget + step1.remainingWeight, true);

  let selected = step2.selected;
  let remaining = step2.remainingWeight;

  if (remaining > 0) {
    // ベストエフォート: ルール2（本文との重複回避）を緩めて残りの候補から埋める。
    // ただし読み／送り仮名の各割合が0の設定の場合は、不足時のフォールバックでも混ぜない。
    const rest = [
      ...(settings.okuriganaRatio > 0 ? okuriganaPool : []),
      ...(settings.readRatio > 0 ? readPool : []),
      ...reviewPool,
      ...currentPool,
    ].filter(q => !selected.some(s => s.id === q.id));
    const before = selected.length;
    const step3 = fillGreedy(rest, selected, remaining, false);
    selected = step3.selected;
    remaining = step3.remainingWeight;
    if (selected.length > before) {
      warnings.push('出題対象の漢字が他の問題の本文と重複するのを完全には避けられませんでした。');
    }
  }

  if (remaining > 0) {
    warnings.push(
      `問題数が不足しています。あと${remaining}問相当を登録してください（今回は問題${selected.length}件で生成します）。`,
    );
  }

  return { selected, warnings };
}

export interface ColumnLayout {
  /** 各列に格納される問題（weight=slotsPerColumn の問題は単独で1列を占有する） */
  columns: Question[][];
}

/**
 * 選出済みの問題をA4レイアウトの列に割り当てる。
 *
 * weight が `slotsPerColumn` に等しい問題（既定: weight=2）は列を単独で占有する。
 * 残りの問題は高さを計測し、降順ソート後に最大×最小のペアを作ることで
 * 各列の合計高さの分散を最小化する（スワップペアリング）。
 *
 * @param measureHeight - 問題テキスト1件の縦幅(px)を返す関数（Tategaki.measureText().height を渡す）
 */
export function assignColumns(
  selected: Question[],
  measureHeight: (text: string) => number,
  slotsPerColumn: number,
): ColumnLayout {
  const wide = selected.filter(q => q.weight >= slotsPerColumn);
  const narrow = selected.filter(q => q.weight < slotsPerColumn);

  const columns: Question[][] = wide.map(q => [q]);

  const withHeight = narrow
    .map(q => ({ q, height: measureHeight(q.text) }))
    .sort((a, b) => b.height - a.height);

  let lo = 0;
  let hi = withHeight.length - 1;
  while (lo < hi) {
    columns.push([withHeight[lo].q, withHeight[hi].q]);
    lo++;
    hi--;
  }
  if (lo === hi) {
    // 奇数個余った場合の保険（slotsPerColumn=2 の通常運用では発生しない）
    columns.push([withHeight[lo].q]);
  }

  return { columns };
}
