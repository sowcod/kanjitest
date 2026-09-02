import { lazy, Suspense, useState } from 'react';
import { AppTabs } from './components/AppTabs';
import { QuestionManagementPage } from './features/questions/QuestionManagementPage';

const KanjiRangePage = lazy(() => import('./features/kanji/KanjiRangePage').then((m) => ({ default: m.KanjiRangePage })));
const TestGenerationPage = lazy(() =>
  import('./features/tests/TestGenerationPage').then((m) => ({ default: m.TestGenerationPage })),
);
const HistoryPage = lazy(() => import('./features/history/HistoryPage').then((m) => ({ default: m.HistoryPage })));
const RemoteConfigPage = lazy(() =>
  import('./features/remote/RemoteConfigPage').then((m) => ({ default: m.RemoteConfigPage })),
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
            {activeTab === 'history' && <HistoryPage />}
            {activeTab === 'remote' && <RemoteConfigPage />}
          </div>
        </Suspense>
      </div>
    </>
  );
}
