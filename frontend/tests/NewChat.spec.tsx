import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import NewChatButton from '@/components/header/NewChat';

const mockClear = vi.fn();
vi.mock('@chainlit/react-client', () => ({
  useChatInteract: () => ({ clear: mockClear })
}));

vi.mock('@/components/i18n', () => ({
  Translator: ({ path }: { path: string }) => <span>{path}</span>
}));

describe('NewChatButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the button correctly', () => {
    render(<NewChatButton />);
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
    expect(button.querySelector('svg')).toBeInTheDocument();
  });

  it('clears chat and navigates immediately', () => {
    const mockNavigate = vi.fn();

    render(<NewChatButton navigate={mockNavigate} />);

    fireEvent.click(screen.getByRole('button'));

    expect(mockClear).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('uses custom onNewChat handler if provided', () => {
    const onNewChat = vi.fn();
    render(<NewChatButton onNewChat={onNewChat} />);

    fireEvent.click(screen.getByRole('button'));

    expect(onNewChat).toHaveBeenCalledTimes(1);
    expect(mockClear).not.toHaveBeenCalled();
  });
});
