import { describe, expect, it } from 'vitest';
import { parse, tokenize } from './parser';

describe('tokenize', () => {
  it('splits plain text into CHAR tokens', () => {
    const tokens = tokenize('猫');
    expect(tokens).toEqual([{ kind: 'CHAR', text: '猫', value: '猫', offset: 0, length: 1 }]);
  });

  it('recognizes a RUBY1 token after a char', () => {
    const tokens = tokenize('漢[かん]');
    expect(tokens.map(t => t.kind)).toEqual(['CHAR', 'RUBY1']);
    expect(tokens[1].value).toBe('かん');
  });

  it('recognizes RUBY2, CURLY1_GROUP, ANGLE_GROUP, CURLY2_GROUP', () => {
    expect(tokenize('肉[[にく]]').map(t => t.kind)).toEqual(['CHAR', 'RUBY2']);
    expect(tokenize('{明日}[あした]').map(t => t.kind)).toEqual(['CURLY1_GROUP', 'RUBY1']);
    expect(tokenize('<今日>[きょう]').map(t => t.kind)).toEqual(['ANGLE_GROUP', 'RUBY1']);
    expect(tokenize('{{書く}}[かく]').map(t => t.kind)).toEqual(['CURLY2_GROUP', 'RUBY1']);
  });

  it('tracks codepoint offsets across multi-char tokens, not UTF-16 indices', () => {
    const tokens = tokenize('a{明日}[あした]b');
    // a(0) {(1) 明(2) 日(3) }(4) [(5) あ(6) し(7) た(8) ](9) b(10)
    expect(tokens.map(t => t.offset)).toEqual([0, 1, 5, 10]);
  });
});

describe('parse: normal ruby', () => {
  it('parses a single-char ruby into one normal segment', () => {
    const { segments, errors } = parse('漢[かん]');
    expect(errors).toEqual([]);
    expect(segments).toEqual([{ kind: 'normal', char: '漢', ruby: 'かん', rubyIndex: 0, rubyTotal: 1 }]);
  });

  it('parses a group ruby into one normal segment per char, ruby only on the first', () => {
    const { segments, errors } = parse('{明日}[あした]');
    expect(errors).toEqual([]);
    expect(segments).toEqual([
      { kind: 'normal', char: '明', ruby: 'あした', rubyIndex: 0, rubyTotal: 2 },
      { kind: 'normal', char: '日', ruby: null, rubyIndex: 1, rubyTotal: 2 },
    ]);
  });

  it('leaves a char with no ruby as a normal segment', () => {
    const { segments } = parse('あ');
    expect(segments).toEqual([{ kind: 'normal', char: 'あ', ruby: null, rubyIndex: 0, rubyTotal: 1 }]);
  });
});

describe('parse: writeBox (angle group)', () => {
  it('parses a single-char write box', () => {
    const { segments, errors } = parse('<今>[きょう]');
    expect(errors).toEqual([]);
    expect(segments).toEqual([{ kind: 'writeBox', char: '今', ruby: 'きょう', rubyIndex: 0, rubyTotal: 1 }]);
  });

  it('parses a multi-char write box, ruby only on the first char', () => {
    const { segments, errors } = parse('<漢字>[かんじ]');
    expect(errors).toEqual([]);
    expect(segments).toEqual([
      { kind: 'writeBox', char: '漢', ruby: 'かんじ', rubyIndex: 0, rubyTotal: 2 },
      { kind: 'writeBox', char: '字', ruby: null, rubyIndex: 1, rubyTotal: 2 },
    ]);
  });

  it('errors when <...> is not followed by [ruby]', () => {
    const { segments, errors } = parse('<漢字>');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('[ルビ] がありません');
    // フォールバック: 中身を normal として出力
    expect(segments).toEqual([
      { kind: 'normal', char: '漢', ruby: null, rubyIndex: 0, rubyTotal: 1 },
      { kind: 'normal', char: '字', ruby: null, rubyIndex: 0, rubyTotal: 1 },
    ]);
  });
});

describe('parse: readBox', () => {
  it('parses a single-char read box (RUBY2)', () => {
    const { segments, errors } = parse('肉[[にく]]');
    expect(errors).toEqual([]);
    expect(segments).toEqual([{ kind: 'readBox', char: '肉', ruby: 'にく', rubyIndex: 0, rubyTotal: 1 }]);
  });

  it('parses a group read box, ruby only on the first char', () => {
    const { segments, errors } = parse('{漢字}[[かんじ]]');
    expect(errors).toEqual([]);
    expect(segments).toEqual([
      { kind: 'readBox', char: '漢', ruby: 'かんじ', rubyIndex: 0, rubyTotal: 2 },
      { kind: 'readBox', char: '字', ruby: null, rubyIndex: 1, rubyTotal: 2 },
    ]);
  });
});

describe('parse: bracketBox (okurigana write box)', () => {
  it('parses {{...}}[ruby] into a single bracketBox segment holding all chars', () => {
    const { segments, errors } = parse('{{書く}}[かく]');
    expect(errors).toEqual([]);
    expect(segments).toEqual([
      { kind: 'bracketBox', char: '書く', ruby: 'かく', rubyIndex: 0, rubyTotal: 1, boxCount: 3 },
    ]);
  });

  it.each([
    ['あ', 1, 3],
    ['あい', 2, 3],
    ['あいう', 3, 5],
    ['あいうえ', 4, 5],
    ['あいうえお', 5, 7],
  ])('maps %s (%i chars) to boxCount %i', (chars, _len, expected) => {
    const { segments } = parse(`{{${chars}}}[る]`);
    expect(segments[0].boxCount).toBe(expected);
  });

  it('errors when {{...}} is not followed by [ruby]', () => {
    const { errors } = parse('{{書く}}');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('{{...}}');
  });
});

describe('parse: error recovery for bare ruby tokens', () => {
  it('errors when [ruby] appears with no preceding char/group', () => {
    const { segments, errors } = parse('[かん]');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('[...]');
    // フォールバック: ルビの中身を normal として出力
    expect(segments.map(s => s.char).join('')).toBe('かん');
  });

  it('errors when [[ruby]] appears with no preceding char/group', () => {
    const { errors } = parse('[[にく]]');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('[[...]]');
  });

  it('continues parsing after an error instead of aborting', () => {
    const { segments, errors } = parse('[かん]漢[かん]');
    expect(errors).toHaveLength(1);
    expect(segments.at(-1)).toEqual({ kind: 'normal', char: '漢', ruby: 'かん', rubyIndex: 0, rubyTotal: 1 });
  });
});

describe('parse: mixed real-world sentence', () => {
  it('parses a sentence combining normal ruby, writeBox, and plain chars', () => {
    const { segments, errors } = parse('<今>[きょう]は{明日}[あした]の準備をする。');
    expect(errors).toEqual([]);
    expect(segments[0]).toMatchObject({ kind: 'writeBox', char: '今' });
    expect(segments.map(s => s.char).join('')).toBe('今は明日の準備をする。');
  });
});
