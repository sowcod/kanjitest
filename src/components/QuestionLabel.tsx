import { parse, type SegmentKind } from '../parser';

const SEGMENT_KIND_LABELS: Partial<Record<SegmentKind, string>> = {
  writeBox: '書き取り',
  readBox: '読み取り',
  bracketBox: '送り仮名',
};

interface QuestionLabelProps {
  text: string;
}

/** 一覧表示用: 出題対象の文字が種別ごとに色分けされたラベル。旧UIの buildQuestionLabel() 相当。 */
export function QuestionLabel({ text }: QuestionLabelProps) {
  const { segments } = parse(text);
  if (segments.length === 0) return <>(空)</>;

  return (
    <>
      {segments.map((seg, i) => {
        const kindLabel = SEGMENT_KIND_LABELS[seg.kind];
        const title = kindLabel ? (seg.ruby ? `${kindLabel}(読み: ${seg.ruby})` : kindLabel) : undefined;
        return (
          <span key={i} className={`q-char q-char-${seg.kind}`} title={title}>
            {seg.char}
          </span>
        );
      })}
    </>
  );
}
