import { lazy, Suspense, useState } from 'react';
import { AppTabs } from './components/AppTabs';
import { QuestionManagementPage } from './features/questions/QuestionManagementPage';

const KanjiRangePage = lazy(() => import('./features/kanji/KanjiRangePage').then((m) => ({ default: m.KanjiRangePage })));
const TestGenerationPage = lazy(() =>
  import('./features/tests/TestGenerationPage').then((m) => ({ default: m.TestGenerationPage })),
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
            {activeTab === 'kanji' && <KanjiRangePage />}
            {activeTab === 'test' && <TestGenerationPage />}
            {activeTab === 'history' && <HistoryStub />}
            {activeTab === 'remote' && <RemoteConfigStub />}
          </div>
        </Suspense>
      </div>
    </>
  );
}
