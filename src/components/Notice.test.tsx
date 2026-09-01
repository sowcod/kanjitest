import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Notice } from './Notice';

describe('Notice', () => {
  it('renders the message', () => {
    render(<Notice message="読み込みに失敗しました" />);
    expect(screen.getByRole('alert')).toHaveTextContent('読み込みに失敗しました');
  });

  it('omits the retry button when onRetry is not given', () => {
    render(<Notice message="読み込みに失敗しました" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('calls onRetry when the retry button is clicked', () => {
    const onRetry = vi.fn();
    render(<Notice message="読み込みに失敗しました" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: '再試行' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
