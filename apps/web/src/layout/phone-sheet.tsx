import { type ReactNode, useEffect, useRef } from 'react';
import { RimPanel, SheetHandle } from '../ui/rim-panel';

interface PhoneSheetProps {
  /** The sheet's heading and accessible name. */
  title: string;
  /** What closing it says ("Đóng"), on the scrim and the handle. */
  closeLabel: string;
  onClose(): void;
  dataId?: string;
  children: ReactNode;
}

/**
 * A sheet rising from the bottom of a phone screen (the kit's `sheet` panel, as M03 and M05 draw it) over a scrim:
 * closed by its handle, a tap on the scrim or Escape. Focus moves into it when it opens and back where it was when it
 * closes. Long content scrolls inside the sheet.
 */
export function PhoneSheet({ title, closeLabel, onClose, dataId, children }: PhoneSheetProps): ReactNode {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      close.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (before?.isConnected) before.focus();
    };
  }, []);
  return (
    <>
      <button type="button" className="phone-scrim" aria-label={closeLabel} tabIndex={-1} onClick={onClose} />
      <div ref={panel} className="phone-dialog" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} data-id={dataId}>
        <RimPanel variant="sheet" as="div" className="phone-dialog-panel">
          <SheetHandle label={closeLabel} onPress={onClose} />
          <h2 className="phone-dialog-title">{title}</h2>
          {children}
        </RimPanel>
      </div>
    </>
  );
}
