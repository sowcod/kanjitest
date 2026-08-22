// 教育漢字1026字の読みデータを kanjiapi.dev から取得し、src/kanjiReadings.ts を生成する。
// 開発時に1回だけ実行するツール（ビルドには含まれない）。冪等: 何度実行しても同じ内容を生成する。
//
// 使い方: node scripts/fetch-kanji-readings.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const kanjiDataPath = path.join(__dirname, '..', 'src', 'kanjiData.ts');
const outPath = path.join(__dirname, '..', 'src', 'kanjiReadings.ts');

const CONCURRENCY = 5;

function extractKanjiSet(tsSource) {
  const chars = new Set();
  const re = /"([^"\\])"/gu;
  let m;
  while ((m = re.exec(tsSource)) !== null) {
    if (/^\p{Script=Han}$/u.test(m[1])) chars.add(m[1]);
  }
  return [...chars].sort();
}

// カタカナ → ひらがな
function katakanaToHiragana(s) {
  return s.replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

// kun_reading（例: "まな.ぶ" "-がた"）→ ベース部分（例: "まなぶ" → 送り仮名前の "まな"、"がた"）
function kunReadingBase(kun) {
  const beforeDot = kun.split('.')[0];
  return beforeDot.replace(/^-/, '').replace(/-$/, '');
}

async function fetchReadings(kanji) {
  const res = await fetch(`https://kanjiapi.dev/v1/kanji/${encodeURIComponent(kanji)}`);
  if (!res.ok) throw new Error(`${kanji}: HTTP ${res.status}`);
  const data = await res.json();
  const onReadings = (data.on_readings ?? []).map(katakanaToHiragana);
  const kunReadings = (data.kun_readings ?? []).map(kunReadingBase);
  const candidates = [...new Set([...onReadings, ...kunReadings])];
  return [kanji, candidates];
}

async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let next = 0;
  async function runOne() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, runOne));
  return results;
}

async function main() {
  const tsSource = readFileSync(kanjiDataPath, 'utf-8');
  const kanjiList = extractKanjiSet(tsSource);
  console.log(`対象漢字: ${kanjiList.length}字`);

  const entries = await runPool(kanjiList, fetchReadings, CONCURRENCY);
  entries.sort((a, b) => a[0].localeCompare(b[0]));

  const lines = [];
  lines.push('/**');
  lines.push(' * 教育漢字1026字の読み候補（自動生成、手動編集しないこと）。');
  lines.push(' *');
  lines.push(' * 生成元: kanjiapi.dev (KANJIDIC2ベース)。');
  lines.push(' * on読みはカタカナ→ひらがなに変換済み。kun読みは送り仮名部分（`.`以降）と');
  lines.push(' * 連濁を示す前後の `-` を除いたベース部分のみを収録。');
  lines.push(' *');
  lines.push(' * 再生成: node scripts/fetch-kanji-readings.mjs');
  lines.push(' */');
  lines.push('');
  lines.push('export const KANJI_READING_CANDIDATES: Record<string, string[]> = {');
  for (const [kanji, readings] of entries) {
    const readingsLiteral = readings.map((r) => JSON.stringify(r)).join(', ');
    lines.push(`  ${JSON.stringify(kanji)}: [${readingsLiteral}],`);
  }
  lines.push('};');
  lines.push('');

  writeFileSync(outPath, lines.join('\n'), 'utf-8');
  console.log(`書き出し完了: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
