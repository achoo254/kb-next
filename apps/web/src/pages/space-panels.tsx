/**
 * The fixed parts of the Space screen (board C10): the crystal with its orbits and the Space's header on the left,
 * "Thành viên & quyền" and "Space liên quan" on the right.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { SpaceCard, SpaceDetail, SpaceMember } from '../api/content-api';
import type { Locale } from '../i18n/i18n';
import { SHELL_PATHS } from '../layout/app-shell';
import { SPACE_ICON, SPACE_KINDS, type SpaceKind } from '../ui/art';
import { Icon, type IconName } from '../ui/icon';
import { type OrbitDot, OrbitField, type OrbitPath } from '../ui/orbit-field';
import { RimPanel } from '../ui/rim-panel';
import { copilotHref } from './copilot-links';
import { langList, languagesOf, relevanceText } from './space-labels';
import { type ScreenTranslate, type SpaceMessageKey, useSpaceText } from './space-messages';

/** The three orbits around the Space's crystal and their dots, at the board's coordinates. */
const ORBITS: readonly OrbitPath[] = [
  { d: 'M376.7 214.8 A150.0 44.0 -12.0 1 1 83.3 277.2 A150.0 44.0 -12.0 1 1 376.7 214.8', width: 1.5 },
  { d: 'M338.6 313.8 A128.0 74.0 32.0 1 1 121.4 178.2 A128.0 74.0 32.0 1 1 338.6 313.8', width: 1.1 },
  { d: 'M315.8 174.0 A112.0 32.0 -40.0 1 1 144.2 318.0 A112.0 32.0 -40.0 1 1 315.8 174.0', width: 1.1 },
];
const DOTS: readonly OrbitDot[] = [
  { orbit: 0, size: 12, tone: 'sky', duration: 16, delay: 0 },
  { orbit: 0, size: 9, tone: 'violet', duration: 16, delay: -4 },
  { orbit: 0, size: 10, tone: 'lavender', duration: 16, delay: -8 },
  { orbit: 0, size: 7, tone: 'cyan', duration: 16, delay: -12 },
  { orbit: 1, size: 12, tone: 'sky', duration: 12, delay: 0, reverse: true },
  { orbit: 1, size: 9, tone: 'violet', duration: 12, delay: -4, reverse: true },
  { orbit: 1, size: 10, tone: 'lavender', duration: 12, delay: -8, reverse: true },
  { orbit: 2, size: 12, tone: 'sky', duration: 10, delay: 0 },
  { orbit: 2, size: 9, tone: 'violet', duration: 10, delay: -5 },
];

function isSpaceKind(value: string): value is SpaceKind {
  return (SPACE_KINDS as readonly string[]).includes(value);
}

/** The icon of a Space: its own for the Spaces of the Universe, the personal star for "Vũ trụ của bạn". */
export function spaceIcon(space: Pick<SpaceCard, 'slug' | 'kind'>): IconName {
  if (space.kind === 'personal') return SPACE_ICON.personal;
  return isSpaceKind(space.slug) ? SPACE_ICON[space.slug] : 'orbit';
}

export function spaceName(locale: Locale, space: Pick<SpaceCard, 'nameVi' | 'nameEn'>): string {
  return locale === 'vi' ? space.nameVi : space.nameEn;
}

/** A crystal's tint and glow from the data (the Space's own colours), for its CSS. */
export function tintStyle(item: { tint: string; glow: string }): CSSProperties {
  return { '--space-tint': item.tint, '--space-glow': item.glow } as CSSProperties;
}

/** The big crystal of the Space with its orbits (decorative: the header next to it says the same). */
export function SpaceCrystal({ detail, locale, t }: { detail: SpaceDetail; locale: Locale; t: ScreenTranslate<SpaceMessageKey> }): ReactNode {
  const { space } = detail;
  const caption = locale === 'vi' ? space.caption.vi : space.caption.en;
  return (
    <>
      <OrbitField className="space-orbits" width={460} height={420} orbits={ORBITS} gradientX={[80, 380]} dots={DOTS} />
      <div className="space-crystal" style={tintStyle(space)} aria-hidden="true">
        <img className="space-crystal-art" src={space.art} alt="" />
        <span className="space-crystal-core" />
        <span className="space-crystal-label">
          <Icon name={spaceIcon(space)} size={32} strokeWidth={2.1} className="space-crystal-icon" />
          <span className="space-crystal-name">{spaceName(locale, space)}</span>
          <span className="space-crystal-count">
            {caption} · {t('space.collectionCount', { count: space.collectionCount })}
          </span>
        </span>
      </div>
    </>
  );
}

/** The Space's header: kicker, name, what it holds, the views (Tổng quan / Canvas / Graph) and Copilot. */
export function SpaceHeader({ detail, locale, t }: { detail: SpaceDetail; locale: Locale; t: ScreenTranslate<SpaceMessageKey> }): ReactNode {
  const { space } = detail;
  const caption = locale === 'vi' ? space.caption.vi : space.caption.en;
  const langs = languagesOf([...detail.collections.flatMap((c) => c.documents), ...detail.uncollected]);
  const description = locale === 'vi' ? space.descriptionVi : space.descriptionEn;
  const meta = [caption, t('space.collectionCount', { count: space.collectionCount }), langList(langs)].filter(Boolean).join(' · ');
  return (
    <section className="space-header" aria-labelledby="space-title" data-id="space-header">
      <span className="space-kicker">{t(space.kind === 'personal' ? 'space.kicker.personal' : 'space.kicker.public')}</span>
      <h1 id="space-title" className="space-title">
        {spaceName(locale, space)}
      </h1>
      <span className="space-meta">{meta}</span>
      {description && <p className="space-description">{description}</p>}
      <nav className="space-views" aria-label={t('space.views')} data-id="space-views">
        <a href={`/s/${encodeURIComponent(space.slug)}`} aria-current="page">
          {t('space.view.overview')}
        </a>
        <a href={`${SHELL_PATHS.canvas}?${new URLSearchParams({ space: space.slug }).toString()}`}>{t('space.view.canvas')}</a>
        <a href={`${SHELL_PATHS.graph}?${new URLSearchParams({ space: space.slug }).toString()}`}>{t('space.view.graph')}</a>
      </nav>
      <a className="space-copilot" href={copilotHref(undefined, { scope: { kind: 'space', id: space.slug } })} data-id="space-copilot">
        <Icon name="sparkles" size={16} />
        {t('space.askCopilot')}
      </a>
    </section>
  );
}

const AVATAR_TONES = ['violet', 'cyan', 'amber', 'emerald'] as const;

function initialOf(name: string | null): string {
  const first = Array.from(name?.trim() ?? '')[0];
  return first ? first.toLocaleUpperCase() : '·';
}

/** Who reviews in the Space: its admins and reviewers, by name. */
function reviewers(members: readonly SpaceMember[]): string[] {
  return members.filter((m) => m.role === 'admin' || m.role === 'reviewer').flatMap((m) => (m.name ? [m.name] : []));
}

export function MembersPanel({ detail }: { detail: SpaceDetail }): ReactNode {
  const { t } = useSpaceText();
  const personal = detail.space.kind === 'personal';
  const reviewerNames = reviewers(detail.members);
  const rows: Array<[SpaceMessageKey, string]> = [
    ['space.who.read', t(personal ? 'space.read.personal' : 'space.read.public')],
    ['space.who.contribute', t(personal ? 'space.contribute.personal' : 'space.contribute.public')],
    ['space.who.review', personal ? t('space.review.personal') : reviewerNames.join(', ') || t('space.review.nobody')],
  ];
  return (
    <RimPanel as="aside" radius="card" className="space-members" label={t('space.membersLabel')} dataId="space-members">
      <h2 className="space-panel-title">{t('space.members')}</h2>
      <ul className="space-member-list">
        {detail.members.map((member, index) => (
          <li key={`${index}-${member.name ?? ''}`} className="space-member">
            <span className="space-avatar" data-tone={AVATAR_TONES[index % AVATAR_TONES.length]} aria-hidden="true">
              {initialOf(member.name)}
            </span>
            <span className="space-member-name">{member.name ?? '—'}</span>
            <span className="space-chip">{t(`role.${member.role}`)}</span>
          </li>
        ))}
      </ul>
      <div className="space-rule" />
      <dl className="space-rights">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{t(label)}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </RimPanel>
  );
}

export function RelatedSpacesPanel({ detail }: { detail: SpaceDetail }): ReactNode {
  const { t, locale } = useSpaceText();
  const related = detail.related.slice(0, 2);
  return (
    <RimPanel as="aside" radius="card" className="space-related" label={t('space.related')} dataId="space-related">
      <h2 className="space-panel-title">{t('space.related')}</h2>
      {related.length === 0 ? (
        <p className="space-related-note">{t('space.relatedNone')}</p>
      ) : (
        <>
          <ul className="space-related-list">
            {related.map((space) => {
              const caption = locale === 'vi' ? space.caption.vi : space.caption.en;
              const name = spaceName(locale, space);
              return (
                <li key={space.slug}>
                  <a
                    href={`/s/${encodeURIComponent(space.slug)}`}
                    className="space-related-card"
                    style={tintStyle(space)}
                    aria-label={t('space.relatedLabel', { name, caption, relevance: relevanceText(locale, space.relevance) })}
                    data-id={`space-related-${space.slug}`}
                  >
                    <span className="space-related-art" aria-hidden="true">
                      <img src={space.art} alt="" />
                    </span>
                    <span className="space-related-name">{name}</span>
                    <span className="space-related-caption">{caption}</span>
                  </a>
                </li>
              );
            })}
          </ul>
          <p className="space-related-note">{t('space.relatedNote')}</p>
        </>
      )}
    </RimPanel>
  );
}
