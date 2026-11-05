import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithI18n } from '../test/render';
import { UploadScreen } from './upload-screen';

afterEach(() => {
  delete document.documentElement.dataset.device;
  vi.unstubAllGlobals();
});

describe('uploading on a phone', () => {
  it('picks files with the same checks as C03 and says Office files are edited on a bigger screen', () => {
    document.documentElement.dataset.device = 'phone';
    vi.stubGlobal('fetch', vi.fn());
    renderWithI18n(<UploadScreen />);
    expect(document.querySelector('[data-screen="C03"]')).not.toBeNull();
    expect(screen.getByText('On a phone you upload and view files; edit them on a desktop or tablet.')).toBeTruthy();
    const input = screen.getByLabelText('Choose files to upload');
    expect(input.getAttribute('accept')).toContain('.docx');
    fireEvent.change(input, { target: { files: [new File(['x'], 'setup.exe')] } });
    const row = document.querySelector('.upload-phone-row');
    expect(row?.textContent).toContain('setup.exe');
    expect(row?.getAttribute('data-state')).toBe('failed');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});
