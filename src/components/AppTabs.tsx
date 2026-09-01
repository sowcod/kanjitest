import './AppTabs.css';

export interface TabDef<TabId extends string> {
  id: TabId;
  label: string;
}

interface AppTabsProps<TabId extends string> {
  tabs: TabDef<TabId>[];
  activeTab: TabId;
  onChange: (id: TabId) => void;
}

export function AppTabs<TabId extends string>({ tabs, activeTab, onChange }: AppTabsProps<TabId>) {
  return (
    <nav className="app-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          className={activeTab === tab.id ? 'active' : undefined}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
