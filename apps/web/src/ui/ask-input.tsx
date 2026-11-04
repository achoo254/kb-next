import { type FormEvent, type ReactNode, useState } from 'react';
import { useI18n } from '../i18n/i18n';
import { Icon } from './icon';
import './ask-input.css';

interface AskInputProps {
  /** Accessible name of the field ("Câu hỏi cho AI"), visually hidden like the mock. */
  label: string;
  placeholder?: string;
  /** Called with the trimmed question; an empty question is not sent. */
  onAsk(question: string): void;
  /** `md`: 52px (C09 AI panel); `sm`: 46px (DesignSystem sample). */
  size?: 'md' | 'sm';
  disabled?: boolean;
  className?: string;
  dataId?: string;
}

/** The glowing question field of the AI panel with its send button (KIT §7). Clears after sending. */
export function AskInput({ label, placeholder, onAsk, size = 'md', disabled = false, className, dataId }: AskInputProps): ReactNode {
  const { t } = useI18n();
  const [question, setQuestion] = useState('');

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const text = question.trim();
    if (!text) return;
    onAsk(text);
    setQuestion('');
  }

  return (
    <form className={className ? `kf-ask ${className}` : 'kf-ask'} data-size={size} onSubmit={submit} data-id={dataId}>
      <label className="kf-ask-box">
        <span className="kf-visually-hidden">{label}</span>
        <input
          className="kf-ask-input"
          type="text"
          value={question}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => setQuestion(event.target.value)}
        />
        <button type="submit" className="kf-ask-send" aria-label={t('kit.send')} disabled={disabled}>
          <Icon name="send" size={size === 'sm' ? 15 : 16} />
        </button>
      </label>
    </form>
  );
}
