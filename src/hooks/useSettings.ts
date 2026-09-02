import { useState } from 'react';
import { loadSettings, saveSettings, type Settings } from '../settingsStore';

export interface UseSettings {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
}

/** テスト生成設定(settingsStore)を controlled component から使うためのフック。 */
export function useSettings(): UseSettings {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());

  function updateSettings(patch: Partial<Settings>) {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }

  return { settings, updateSettings };
}
