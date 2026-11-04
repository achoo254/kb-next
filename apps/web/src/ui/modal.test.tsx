import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Button } from './button';
import { DialogCard, Modal } from './modal';

function Harness(): React.ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Xoá ghi chú…</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        tone="danger"
        art="crystal-cracked"
        title='Xoá "Ghi chú: ARP"?'
        description="Bạn có 10 giây để hoàn tác."
        actions={<Button onClick={() => setOpen(false)}>Giữ lại</Button>}
      />
    </>
  );
}

describe('Modal', () => {
  it('opens a named modal dialog, moves focus in and closes on Escape with focus back', () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Xoá ghi chú…' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Xoá "Ghi chú: ARP"?' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Giữ lại' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('DialogCard shows a dialog in place', () => {
    render(<DialogCard title="Tạo bộ sưu tập" description="Đặt tên" />);
    expect(screen.getByText('Tạo bộ sưu tập')).toBeTruthy();
  });
});
