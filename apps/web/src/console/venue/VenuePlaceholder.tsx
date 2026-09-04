import { useTranslation } from '@yalla/i18n';

export interface VenuePlaceholderProps {
  /** Key in the `admin` namespace, e.g. `nav.menu`. */
  readonly titleKey: string;
  /** Which task fills this in. Shown, not just commented, so nobody files a bug. */
  readonly prompt: string;
}

/**
 * A venue-console screen that does not exist yet.
 *
 * The TODO is on the page rather than only in a comment: an owner clicking
 * "Reports" during a pilot demo should be told it is coming, not left staring
 * at a blank panel wondering whether it broke.
 */
export function VenuePlaceholder({ titleKey, prompt }: VenuePlaceholderProps) {
  const { t } = useTranslation(['admin', 'common']);

  return (
    <section className="page">
      <h2>{t(titleKey)}</h2>
      <div className="todo">
        <span className="todo-label">{t('todo.label')}</span>
        <p className="muted">{t('todo.body', { prompt })}</p>
      </div>
    </section>
  );
}
