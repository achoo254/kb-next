import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StageCards } from './stage-cards';

describe('StageCards', () => {
  it('fans the cards out in 3D and links each one', () => {
    const cards = [
      { id: 'read', href: '/d/dhcp', title: 'Tiếp tục đọc', icon: 'bookmark', progress: 72 },
      { id: 'update', href: '/me', title: 'Cần cập nhật', icon: 'warning', warning: '● Đã 45 ngày', iconTone: 'warn' },
      { id: 'graph', href: '/graph', title: 'Khám phá', icon: 'graph', highlight: true },
      { id: 'docs', href: '/me', title: 'Tài liệu liên quan', icon: 'cube' },
      { id: 'ask', href: '/copilot', title: 'Hỏi AI', icon: 'sparkles' },
    ] as const;
    render(<StageCards cards={cards} more={{ href: '/me', label: 'Mở rộng khay' }} />);
    const first = screen.getByRole('link', { name: /Tiếp tục đọc/ });
    expect(first.style.transform).toContain('perspective(900px)');
    expect(first.style.transform).toContain('rotateY(16deg)');
    expect(first.textContent).toContain('72%');
    expect(screen.getByRole('link', { name: /Khám phá/ }).dataset.highlight).toBe('true');
    expect(screen.getByRole('link', { name: 'Mở rộng khay' }).getAttribute('href')).toBe('/me');
  });
});
