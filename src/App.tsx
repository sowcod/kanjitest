import { lazy, Suspense, useState } from 'react';
import { AppTabs } from './components/AppTabs';
import { QuestionManagementPage } from './features/questions/QuestionManagementPage';

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
    <>
      <AppTabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
      <div className="app-tab-content">
        <Suspense fallback={<p>読み込み中...</p>}>
          <div className="app-tab-panel active">
            {activeTab === 'questions' && <QuestionManagementPage />}
            {activeTab === 'kanji' && <KanjiRangeStub />}
            {activeTab === 'test' && <TestGenerationStub />}
            {activeTab === 'history' && <HistoryStub />}
            {activeTab === 'remote' && <RemoteConfigStub />}
          </div>
        </Suspense>
      </div>
    </>
  );
}
