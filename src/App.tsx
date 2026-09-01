import { lazy, Suspense, useState } from 'react';
import { QuestionManagementStub } from './features/questions/QuestionManagementStub';

const KanjiRangeStub = lazy(() => import('./features/kanji/KanjiRangeStub').then((m) => ({ default: m.KanjiRangeStub })));
const TestGenerationStub = lazy(() =>
  import('./features/tests/TestGenerationStub').then((m) => ({ default: m.TestGenerationStub })),
);
const HistoryStub = lazy(() => import('./features/history/HistoryStub').then((m) => ({ default: m.HistoryStub })));
const RemoteConfigStub = lazy(() =>
  import('./features/remote/RemoteConfigStub').then((m) => ({ default: m.RemoteConfigStub })),
);

type TabId = 'questions' | 'kanji' | 'test' | 'history' | 'remote';

const TABS: { id: TabId; label: string }[] = [
  { id: 'questions', label: '問題管理' },
  { id: 'kanji', label: '漢字範囲管理' },
  { id: 'test', label: 'テスト生成・印刷' },
  { id: 'history', label: '履歴確認' },
  { id: 'remote', label: '外部DB連携' },
];

export function App() {
  const [activeTab, setActiveTab] = useState<TabId>('questions');

  return (
    <div>
      <nav>
        {TABS.map((tab) => (
          <button key={tab.id} type="button" aria-current={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}>
            {tab.label}
          </button>
        ))}
      </nav>
      <Suspense fallback={<p>読み込み中...</p>}>
        {activeTab === 'questions' && <QuestionManagementStub />}
        {activeTab === 'kanji' && <KanjiRangeStub />}
        {activeTab === 'test' && <TestGenerationStub />}
        {activeTab === 'history' && <HistoryStub />}
        {activeTab === 'remote' && <RemoteConfigStub />}
      </Suspense>
    </div>
  );
}
