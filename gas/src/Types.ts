// GAS はファイル間で import/export を使わず単一グローバルスコープで動作するため、
// クライアント側の型(src/questionStore.ts の Question, src/datasetStore.ts の Dataset)と
// 同一シェイプをここに複製する。契約全体は ../../remote-api-design.md を参照。
// 3箇所(ここ・questionStore.ts・datasetStore.ts)の同期を維持すること。

interface Question {
  id: string;
  text: string;
  weight: 1 | 2;
  datasetId: string;
  createdAt: string;
  updatedAt: string;
}

interface Dataset {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}
