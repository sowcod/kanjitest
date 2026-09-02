import { useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { Notice } from '../../components/Notice';
import { clearRemoteConfig, loadRemoteConfig, resolveDataSourceMode, saveRemoteConfig } from '../../remoteConfigStore';
import '../../styles/features.css';

/** 外部DB連携タブ本体。旧UI(index.html)の #tab-remote 相当。 */
export function RemoteConfigPage() {
  const [config] = useState(() => loadRemoteConfig());
  const [urlInput, setUrlInput] = useState(config.apiUrl ?? '');
  const [tokenInput, setTokenInput] = useState(config.apiToken ?? '');
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const mode = resolveDataSourceMode();

  function save() {
    const url = urlInput.trim();
    if (!url) {
      setError('URLを入力してください。');
      return;
    }
    saveRemoteConfig({ apiUrl: url, apiToken: tokenInput.trim() || null });
    location.reload();
  }

  function clear() {
    setConfirmClear(false);
    clearRemoteConfig();
    location.reload();
  }

  return (
    <div className="r-panel">
      <div className="r-form">
        <p className="r-hint">
          Google Sheets x GAS(Google Apps Script)で作成したAPIのURLを登録すると、以後は問題・データセットの保存先がそのAPIに切り替わります(未登録ならブラウザ内(LocalStorage)にそのまま保存されます)。ローカルと外部DBの同期は行われません。切り替えた時点で見えるデータは切り替え先のものだけになります。
        </p>
        <div className="r-field">
          <label htmlFor="r-api-url">GAS Web App URL</label>
          <input
            type="text"
            id="r-api-url"
            placeholder="https://script.google.com/macros/s/XXXX/exec"
            value={urlInput}
            onChange={(e) => setUrlInput(e.currentTarget.value)}
          />
        </div>
        <div className="r-field">
          <label htmlFor="r-api-token">APIトークン(任意)</label>
          <input
            type="text"
            id="r-api-token"
            placeholder="GAS側で照合する簡易トークン"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.currentTarget.value)}
          />
        </div>
        <div className="r-actions">
          <button type="button" className="btn btn-primary" onClick={save}>
            保存して外部DBに切り替える
          </button>
          <button type="button" className="btn btn-danger" onClick={() => setConfirmClear(true)}>
            解除してローカルに戻す
          </button>
        </div>
        {error ? <Notice message={error} /> : null}
        <div className={`r-status${mode === 'remote' ? ' r-status-remote' : ''}`}>
          {mode === 'remote' ? `外部DBに接続中(URL: ${config.apiUrl})` : 'ローカル(ブラウザ内保存)で動作中'}
        </div>
        <p className="r-hint">
          URLパラメータ「?ds=local」「?ds=remote」を付けて開くと、そのページ表示に限り一時的にモードを切り替えられます(通常の運用では使いません)。
        </p>
      </div>

      <Dialog
        open={confirmClear}
        title="確認"
        message="外部DB接続を解除し、ローカル保存に戻しますか？"
        danger
        onConfirm={clear}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}
