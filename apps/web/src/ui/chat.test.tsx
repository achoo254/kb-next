import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithI18n } from '../test/render';
import { AiAvatar } from './ai-avatar';
import { AskInput } from './ask-input';
import { ChatBubble } from './chat-bubble';
import { SourceRow } from './source-row';

describe('AI chat pieces', () => {
  it('ChatBubble tells the question from the answer', () => {
    renderWithI18n(
      <>
        <AiAvatar />
        <ChatBubble from="user">Máy mới lấy IP thế nào?</ChatBubble>
        <ChatBubble from="ai">Qua 4 bước DORA.</ChatBubble>
      </>,
    );
    expect(screen.getByText('Máy mới lấy IP thế nào?').dataset.from).toBe('user');
    expect(screen.getByText('Qua 4 bước DORA.').dataset.from).toBe('ai');
  });

  it('SourceRow links the cited document with its version', () => {
    renderWithI18n(<SourceRow title="Giao thức DHCP" meta="§ DORA 4 bước · Chính thức" tag="v4" href="/d/dhcp" />);
    const row = screen.getByRole('link', { name: /Giao thức DHCP/ });
    expect(row.getAttribute('href')).toBe('/d/dhcp');
    expect(row.textContent).toContain('v4');
    expect(row.textContent).toContain('§ DORA 4 bước');
  });

  it('AskInput sends the trimmed question and clears, but never an empty one', () => {
    const onAsk = vi.fn();
    renderWithI18n(<AskInput label="Câu hỏi cho AI" onAsk={onAsk} />);
    const field = screen.getByLabelText('Câu hỏi cho AI');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onAsk).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: '  DHCP là gì? ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onAsk).toHaveBeenCalledWith('DHCP là gì?');
    expect((field as HTMLInputElement).value).toBe('');
  });
});
