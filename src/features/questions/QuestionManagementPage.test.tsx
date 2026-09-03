import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// FuriganaToolbar/CanvasPreview は kuromoji の初期化や Canvas 描画を伴うため、
// このテストの関心(保存の即時反映・同期ステータス)とは無関係にjsdomを不安定にする。スタブ化する。
vi.mock('../../components/FuriganaToolbar', () => ({ FuriganaToolbar: () => null }));
vi.mock('../../components/CanvasPreview', () => ({ CanvasPreview: () => null }));

vi.mock('../../remoteConfigStore.js', () => ({ resolveDataSourceMode: () => 'remote' }));

const { remoteGet, remotePost } = vi.hoisted(() => ({ remoteGet: vi.fn(), remotePost: vi.fn() }));
vi.mock('../../remoteApiClient.js', () => ({ remoteGet, remotePost }));

// jsdom は scrollIntoView を実装していない(ハイライト行のスクロール用に呼ばれる)。
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

const DATASET = { id: 'default', name: '既定', createdAt: 't0', updatedAt: 't0' };

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function renderPage() {
  vi.resetModules();
  remoteGet.mockImplementation(async (action: string) => {
    if (action === 'listDatasets') return { datasets: [DATASET] };
    if (action === 'listQuestions') return { questions: [] };
    throw new Error(`unexpected remoteGet action: ${action}`);
  });

  const { QuestionManagementPage } = await import('./QuestionManagementPage');
  const utils = render(<QuestionManagementPage />);
  await flush(); // データセット/問題の初回ロード完了を待つ
  return utils;
}

function editorTextarea(): HTMLTextAreaElement {
  return screen.getByLabelText('記法テキスト(1問=1行)') as HTMLTextAreaElement;
}

function listItems(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll('.q-list li'));
}

beforeEach(() => {
  localStorage.clear();
  remoteGet.mockReset();
  remotePost.mockReset();
});

describe('QuestionManagementPage: 保存の即時反映・非同期同期', () => {
  it('新規保存は即座にリストへ反映され、エディタは直ちに次の新規入力を受け付ける', async () => {
    const d = deferred<unknown>();
    remotePost.mockReturnValue(d.promise); // DBへの登録は解決させず「同期中」を保つ

    const { container } = await renderPage();
    expect(screen.getByText('新規登録')).toBeTruthy();

    const textarea = editorTextarea();
    fireEvent.input(textarea, { target: { value: 'あたらしい問題' } });
    fireEvent.click(screen.getByRole('button', { name: /^登録/ }));
    await flush();

    // エディタは保存応答を待たずに即座にリセットされ、次の新規入力を受け付ける。
    expect(editorTextarea().value).toBe('');
    expect(screen.getByText('新規登録')).toBeTruthy();

    // リストには保存した内容が即座に反映され、「登録中」バッジが付いている。
    const items = listItems(container);
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain('あたらしい問題');
    expect(items[0].textContent).toContain('登録中');
  });

  it('DBへの非同期登録が失敗した項目はリスト上で失敗と分かり、クリックで再編集→保存でリトライできる', async () => {
    const failing = deferred<unknown>();
    remotePost.mockReturnValueOnce(failing.promise);

    const { container } = await renderPage();
    const textarea = editorTextarea();
    fireEvent.input(textarea, { target: { value: '失敗する問題' } });
    fireEvent.click(screen.getByRole('button', { name: /^登録/ }));

    failing.reject(new Error('network down'));
    await flush();

    let items = listItems(container);
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain('登録失敗');

    // 失敗した行をクリックすると、そのまま編集状態で開く。
    fireEvent.click(items[0]);
    await flush();
    expect(screen.getByText('編集中')).toBeTruthy();
    expect(screen.getByText('前回の同期に失敗しました。保存すると再試行します。')).toBeTruthy();
    expect(editorTextarea().value).toBe('失敗する問題');

    // 再度保存(更新ボタン)すると、リトライとして送信され、今度は成功する。
    const retry = deferred<{ question: unknown }>();
    remotePost.mockReturnValueOnce(retry.promise);
    fireEvent.click(screen.getByRole('button', { name: /^更新/ }));
    await flush();

    items = listItems(container);
    expect(items[0].textContent).toContain('登録中');

    retry.resolve({ question: { id: 'server-1', text: '失敗する問題', weight: 1, datasetId: 'default', createdAt: 't', updatedAt: 't' } });
    await flush();

    items = listItems(container);
    expect(items[0].textContent).not.toContain('登録失敗');
    expect(items[0].textContent).not.toContain('登録中');
  });
});
