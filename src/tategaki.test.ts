import { describe, expect, it } from 'vitest';
import { Tategaki } from './tategaki';

// measureText/measureChar は ctx に一切アクセスしないため、プレースホルダで構わない。
const FAKE_CTX = {} as CanvasRenderingContext2D;

describe('Tategaki.measureChar', () => {
  it('returns fontSize * columnGap width and fontSize * lineHeight height, using defaults', () => {
    const t = new Tategaki(FAKE_CTX, { font: '40px sans-serif' });
    // lineHeight default 1.1, columnGap default 5
    expect(t.measureChar()).toEqual({ width: 40 * 5, height: 40 * 1.1 });
  });

  it('honors custom lineHeight/columnGap', () => {
    const t = new Tategaki(FAKE_CTX, { font: '30px sans-serif', lineHeight: 2, columnGap: 3.5 });
    expect(t.measureChar()).toEqual({ width: 30 * 3.5, height: 30 * 2 });
  });

  it('parses a decimal font size', () => {
    const t = new Tategaki(FAKE_CTX, { font: '32.5px sans-serif', lineHeight: 1, columnGap: 1 });
    expect(t.measureChar()).toEqual({ width: 32.5, height: 32.5 });
  });

  it('falls back to 16px when the font string has no size', () => {
    const t = new Tategaki(FAKE_CTX, { font: 'sans-serif', lineHeight: 1, columnGap: 1 });
    expect(t.measureChar()).toEqual({ width: 16, height: 16 });
  });
});

describe('Tategaki.measureText: normal segments', () => {
  it('measures a single char with no ruby', () => {
    const t = new Tategaki(FAKE_CTX, { font: '40px sans-serif', lineHeight: 1.1 });
    const m = t.measureText('あ');
    expect(m).toEqual({ width: 40, height: 44, bodyLeft: 20, bodyRight: 20 });
  });

  it('widens bodyRight to fit the ruby, using rubyRatio', () => {
    const t = new Tategaki(FAKE_CTX, { font: '40px sans-serif', lineHeight: 1.1, rubyRatio: 0.5 });
    const m = t.measureText('漢[かん]');
    // rubySize = 40*0.5 = 20; bodyRight = 20 + 20*1.2 = 44
    expect(m).toEqual({ width: 20 + 44, height: 44, bodyLeft: 20, bodyRight: 44 });
  });

  it('accumulates height per char, one step each, for a multi-char group ruby', () => {
    const t = new Tategaki(FAKE_CTX, { font: '40px sans-serif', lineHeight: 1.1 });
    const m = t.measureText('{明日}[あした]');
    expect(m.height).toBe(44 * 2);
    // 幅は明・日のうち ruby がある「明」のみ広がるので、全体の bodyRight はそれで決まる
    expect(m.bodyRight).toBe(20 + 20 * 1.2);
  });

  it('plain text with no notation has zero-width ruby margin', () => {
    const t = new Tategaki(FAKE_CTX, { font: '40px sans-serif', lineHeight: 1.1 });
    const m = t.measureText('これはテスト');
    expect(m.bodyLeft).toBe(20);
    expect(m.bodyRight).toBe(20);
    expect(m.height).toBe(44 * 6);
  });
});

describe('Tategaki.measureText: writeBox segments', () => {
  it('measures a single write box, boxSize defaulting to fontSize * 2.5', () => {
    const t = new Tategaki(FAKE_CTX, { font: '40px sans-serif', lineHeight: 1.1, rubyRatio: 0.5 });
    const m = t.measureText('<今>[きょう]');
    // boxSize = 100; bodyLeft = 50; bodyRight = 50 + 20*1.2 = 74
    expect(m.bodyLeft).toBe(50);
    expect(m.bodyRight).toBe(74);
    // writePad(11) + boxSize(100) + writePad(11), single-segment run
    expect(m.height).toBe(11 + 100 + 11);
  });

  it('does not add inter-segment padding between consecutive write boxes in the same run', () => {
    const t = new Tategaki(FAKE_CTX, { font: '40px sans-serif', lineHeight: 1.1 });
    const m = t.measureText('<漢字>[かんじ]');
    // 1回だけ前後パディング(writePad*2)。中間には入らない。
    expect(m.height).toBe(11 + 100 + 100 + 11);
  });

  it('honors a custom boxSize', () => {
    const t = new Tategaki(FAKE_CTX, { font: '40px sans-serif', lineHeight: 1.1, boxSize: 80 });
    const m = t.measureText('<今>[きょう]');
    expect(m.bodyLeft).toBe(40);
  });
});

describe('Tategaki.measureText: readBox segments', () => {
  it('measures a single read box', () => {
    const t = new Tategaki(FAKE_CTX, { font: '20px sans-serif', lineHeight: 1.1 });
    const m = t.measureText('肉[[にく]]');
    // fontSize=20, step=22; readBoxRight = 10 + 6 + 40 = 56
    expect(m.bodyLeft).toBe(10);
    expect(m.bodyRight).toBe(56);
    // readPad(11) + readStep(33) + readPad(11)
    expect(m.height).toBe(11 + 33 + 11);
  });

  it('adds padding only once for a multi-char read box group', () => {
    const t = new Tategaki(FAKE_CTX, { font: '20px sans-serif', lineHeight: 1.1 });
    const m = t.measureText('{漢字}[[かんじ]]');
    expect(m.height).toBe(11 + 33 + 33 + 11);
  });
});

describe('Tategaki.measureText: bracketBox segments', () => {
  it('measures a bracket box, boxCount derived from ruby-string length via the 2-char step table', () => {
    const t = new Tategaki(FAKE_CTX, { font: '40px sans-serif', lineHeight: 1.1, rubyRatio: 0.5 });
    const m = t.measureText('{{書く}}[かく]');
    // bracketWidth = 120; bodyLeft = 60; bodyRight = 60 + 20*1.2 = 84
    expect(m.bodyLeft).toBe(60);
    expect(m.bodyRight).toBe(84);
    // boxCount(2 chars) = 3; bracketHeight = 3*100=300; gap = 120/2=60; height = 300+120
    expect(m.height).toBe(300 + 120);
  });

  it('scales height with a longer okurigana group (5 chars -> boxCount 7)', () => {
    const t = new Tategaki(FAKE_CTX, { font: '40px sans-serif', lineHeight: 1.1 });
    const m = t.measureText('{{あいうえお}}[る]');
    expect(m.height).toBe(7 * 100 + 120);
  });
});

describe('Tategaki.measureText: mixed content', () => {
  it('sums heights and takes the max left/right offset across differing segment kinds', () => {
    const t = new Tategaki(FAKE_CTX, { font: '40px sans-serif', lineHeight: 1.1, rubyRatio: 0.5 });
    const plain = t.measureText('あ');
    const withWriteBox = t.measureText('<今>[きょう]あ');
    expect(withWriteBox.height).toBeGreaterThan(plain.height);
    // writeBox の bodyLeft(50) が normal(20) を上回るため、全体の bodyLeft は writeBox 側になる
    expect(withWriteBox.bodyLeft).toBe(50);
  });
});
