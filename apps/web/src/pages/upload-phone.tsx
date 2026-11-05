import { type ReactNode, useRef } from 'react';
import { PhoneShell } from '../layout/phone-shell';
import { Icon } from '../ui/icon';
import { FileBadge } from './file-badge';
import { fileSize, useOfficeText } from './office-messages';
import { usePhoneText } from './phone-messages';
import { type UploadRow, errorLine, retryable, rowPercent, useUploadQueue, useUploadTarget } from './upload-queue';
import './upload-phone.css';

/** The kinds the server takes (C03). */
const ACCEPT = '.docx,.xlsx,.pptx,.pdf,.md,.markdown';

function RowState({ row }: { row: UploadRow }): ReactNode {
  const phone = usePhoneText();
  const office = useOfficeText();
  if (row.state === 'failed') return <span className="upload-phone-state" data-state="failed">{office.t(errorLine(row.error))}</span>;
  if (row.state === 'done') return <span className="upload-phone-state" data-state="done">{phone.t('upload.done')}</span>;
  if (row.state === 'cancelled') return <span className="upload-phone-state">{phone.t('upload.cancelled')}</span>;
  if (row.state === 'queued') return <span className="upload-phone-state">{phone.t('upload.queued')}</span>;
  return <span className="upload-phone-state">{phone.t('upload.uploading', { percent: rowPercent(row) })}</span>;
}

/**
 * /upload on a phone (M02's "Tải Office"): pick Office files and upload them one by one with their progress, then
 * open each to read. A phone does not edit Office files (Z02); the screen says so. Same checks and queue as C03.
 */
export function UploadPhone(): ReactNode {
  const { t } = usePhoneText();
  const office = useOfficeText();
  const queue = useUploadQueue(useUploadTarget());
  const input = useRef<HTMLInputElement>(null);
  return (
    <PhoneShell screen="C03" tab="create">
      <div className="upload-phone" data-id="upload-phone">
        <h1 className="upload-phone-title">{t('upload.title')}</h1>
        <p className="upload-phone-note">{t('upload.note')}</p>
        <label className="phone-button upload-phone-pick" data-tone="rim">
          <Icon name="upload" size={18} />
          {t('upload.pick')}
          <input
            ref={input}
            type="file"
            multiple
            accept={ACCEPT}
            className="kf-visually-hidden"
            aria-label={t('upload.pickLabel')}
            onChange={(event) => {
              const files = event.currentTarget.files;
              if (files) queue.add(Array.from(files));
              event.currentTarget.value = '';
            }}
          />
        </label>
        {queue.rows.length > 0 && (
          <ul className="upload-phone-rows">
            {queue.rows.map((row) => (
              <li key={row.key} className="upload-phone-row" data-state={row.state}>
                <FileBadge kind={row.kind} name={row.name} />
                <span className="upload-phone-name">
                  <b>{row.name}</b>
                  <span>
                    {fileSize(office.locale, row.size)} · <RowState row={row} />
                  </span>
                </span>
                {row.state === 'done' && row.stored && (
                  <a className="upload-phone-action" href={`/d/${encodeURIComponent(row.stored.documentId)}`}>
                    {t('upload.open')}
                  </a>
                )}
                {retryable(row) && (
                  <button type="button" className="upload-phone-action" onClick={() => queue.retry(row.key)}>
                    {t('upload.retry')}
                  </button>
                )}
                {(row.state === 'queued' || row.state === 'uploading') && (
                  <button type="button" className="upload-phone-action" onClick={() => queue.cancel(row.key)}>
                    {t('upload.cancel')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </PhoneShell>
  );
}
