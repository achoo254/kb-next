import { type ReactNode, useEffect, useId, useRef } from 'react';
import { type StateArt, stateArtSrc } from './art';
import './motion.css';
import './modal.css';

interface DialogCardProps {
  title: string;
  /** What will happen, in one or two sentences. */
  description?: ReactNode;
  /** An illustration above the title (in a dashed ring), e.g. `crystal-cracked` for a delete. */
  art?: StateArt;
  /** The buttons, right-aligned (`stretch` makes them share the width). */
  actions?: ReactNode;
  actionsLayout?: 'end' | 'stretch';
  children?: ReactNode;
  /** `danger`: the red rim of a destructive confirm (X01). */
  tone?: 'default' | 'danger';
  /** `sm`: the dialog cards of DesignSystem; `lg`: the 440px centred confirm of X01. */
  size?: 'sm' | 'lg';
  className?: string;
}

/** The panel of a dialog. Used inside Modal, or on its own where a board shows a dialog in place. */
export function DialogCard({
  title,
  description,
  art,
  actions,
  actionsLayout = 'end',
  children,
  tone = 'default',
  size = 'sm',
  className,
  titleId,
}: DialogCardProps & { titleId?: string }): ReactNode {
  return (
    <div className={className ? `kf-dialog ${className}` : 'kf-dialog'} data-tone={tone} data-size={size}>
      {art && (
        <div className="kf-dialog-art" aria-hidden="true">
          <span className="kf-dialog-ring" />
          <img src={stateArtSrc(art)} alt="" />
        </div>
      )}
      <span className="kf-dialog-title" id={titleId}>
        {title}
      </span>
      {description && <span className="kf-dialog-description">{description}</span>}
      {children}
      {actions && (
        <div className="kf-dialog-actions" data-layout={actionsLayout}>
          {actions}
        </div>
      )}
    </div>
  );
}

interface ModalProps extends DialogCardProps {
  open: boolean;
  /** Escape, a click on the backdrop or a cancel button closes it. */
  onClose(): void;
  /** Cover only the positioned parent (a kit board) instead of the whole viewport. */
  contained?: boolean;
  dataId?: string;
}

/**
 * A modal dialog over a dimmed backdrop: focus moves into it and back to where it was, Escape closes it. Use it for
 * confirmations; a destructive one sets `tone="danger"`.
 */
export function Modal({ open, onClose, contained = false, dataId, ...card }: ModalProps): ReactNode {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const first = dialog?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    (first ?? dialog)?.focus();
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      before?.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    // The backdrop only catches a click outside the dialog; keyboard users close it with Escape or its buttons.
    <div
      role="presentation"
      className="kf-modal-backdrop"
      data-contained={contained || undefined}
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="kf-modal" data-id={dataId}>
        <DialogCard size="lg" {...card} titleId={titleId} />
      </div>
    </div>
  );
}
