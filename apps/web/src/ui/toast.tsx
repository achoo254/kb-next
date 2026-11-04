import type { ReactNode } from 'react';
import { useI18n } from '../i18n/i18n';
import { Icon, type IconName } from './icon';
import './toast.css';

export type ToastTone = 'success' | 'info' | 'warn' | 'error' | 'undo';

const TONE_ICON: Record<ToastTone, IconName> = { success: 'check', info: 'info', warn: 'alert', error: 'cross', undo: 'undo' };

interface ToastProps {
  tone: ToastTone;
  message: string;
  /** Shows "Hoàn tác" (undo) when set. */
  onUndo?(): void;
  /** Shows the close button (floating toasts). */
  onClose?(): void;
  /**
   * `floating`: the rim toast over the screen (X01); `row`: a toast in a list of samples (X01);
   * `card`: the solid toast of the DesignSystem board.
   */
  variant?: 'floating' | 'row' | 'card';
  className?: string;
  dataId?: string;
}

/** A toast: what happened, in one line, with undo when the action can be taken back. Announced politely. */
export function Toast({ tone, message, onUndo, onClose, variant = 'floating', className, dataId }: ToastProps): ReactNode {
  const { t } = useI18n();
  const iconSize = variant === 'floating' ? 18 : 16;
  return (
    <div role="status" className={className ? `kf-toast ${className}` : 'kf-toast'} data-tone={tone} data-variant={variant} data-id={dataId}>
      <span className="kf-toast-icon">
        <Icon name={TONE_ICON[tone]} size={iconSize} />
      </span>
      <span className="kf-toast-message">{message}</span>
      {onUndo && (
        <button type="button" className="kf-toast-undo" onClick={onUndo} data-id={dataId ? `${dataId}-undo` : undefined}>
          {t('kit.undo')}
        </button>
      )}
      {onClose && (
        <button type="button" className="kf-toast-close" aria-label={t('kit.closeToast')} onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      )}
    </div>
  );
}
