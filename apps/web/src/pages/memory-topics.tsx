/**
 * The memory topics of /memory in two groups: "Chung" (used in every conversation) and "Theo hội thoại" (tied to one
 * Chat conversation). Each row opens its note, edits it, or moves it to the trash (the screen confirms first).
 */
import type { ReactNode } from 'react';
import type { MemoryTopic } from '../api/memory-api';
import type { Locale } from '../i18n/i18n';
import { Button } from '../ui/button';
import type { MemoryMessageKey, MemoryTranslate } from './memory-messages';
import { ago } from './mine-model';

export interface MemoryGroups {
  general: MemoryTopic[];
  chats: MemoryTopic[];
}

/** Splits the topics (kept in the API's order, newest first) into general memory and conversation memory. */
export function groupTopics(topics: readonly MemoryTopic[]): MemoryGroups {
  return { general: topics.filter((topic) => topic.chatId === null), chats: topics.filter((topic) => topic.chatId !== null) };
}

function documentPath(id: string): string {
  return `/d/${encodeURIComponent(id)}`;
}

interface RowProps {
  topic: MemoryTopic;
  t: MemoryTranslate;
  locale: Locale;
  now: number;
  onDelete(topic: MemoryTopic): void;
}

function TopicRow({ topic, t, locale, now, onDelete }: RowProps): ReactNode {
  return (
    <li className="memory-row" data-id={`memory-topic-${topic.id}`}>
      <div className="memory-row-text">
        <a className="memory-row-title" href={documentPath(topic.id)}>
          {topic.title}
        </a>
        {topic.summary && <p className="memory-row-summary">{topic.summary}</p>}
        <span className="memory-muted memory-row-meta">
          {topic.chatId !== null && <span className="memory-chat-tag">{t('memory.chat', { id: topic.chatId })}</span>}
          <time dateTime={topic.updatedAt}>{t('memory.updated', { when: ago(locale, topic.updatedAt, now) })}</time>
        </span>
      </div>
      <div className="memory-row-actions">
        <Button variant="ghost" size="sm" icon="pencil" href={`${documentPath(topic.id)}/edit`} dataId={`memory-edit-${topic.id}`}>
          {t('memory.edit')}
        </Button>
        <Button variant="danger" size="sm" icon="trash" onClick={() => onDelete(topic)} dataId={`memory-delete-${topic.id}`}>
          {t('memory.delete')}
        </Button>
      </div>
    </li>
  );
}

interface GroupProps extends Omit<RowProps, 'topic'> {
  id: 'general' | 'chats';
  topics: readonly MemoryTopic[];
}

const GROUP_TEXT: Record<GroupProps['id'], readonly [MemoryMessageKey, MemoryMessageKey]> = {
  general: ['memory.general', 'memory.general.sub'],
  chats: ['memory.chats', 'memory.chats.sub'],
};

export function TopicGroup({ id, topics, t, ...row }: GroupProps): ReactNode {
  const [title, sub] = GROUP_TEXT[id];
  const headingId = `memory-group-${id}`;
  return (
    <section className="memory-group" aria-labelledby={headingId} data-id={headingId}>
      <h2 id={headingId} className="memory-group-title">
        {t(title)} <span className="memory-count">{topics.length}</span>
      </h2>
      <p className="memory-muted">{t(sub)}</p>
      {topics.length === 0 ? (
        <p className="memory-muted memory-group-empty">{t('memory.groupEmpty')}</p>
      ) : (
        <ul className="memory-list" aria-label={t(title)}>
          {topics.map((topic) => (
            <TopicRow key={topic.id} topic={topic} t={t} {...row} />
          ))}
        </ul>
      )}
    </section>
  );
}
