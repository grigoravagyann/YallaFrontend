import { useTranslation } from '@yalla/i18n';

export interface PlaceholderScreenProps {
  /** Key in the `admin` namespace, e.g. `nav.menu`. */
  readonly titleKey: string;
}

/**
 * Every admin route renders this until its real screen is built.
 *
 * Both strings come from i18next rather than being written inline — the rule is
 * that no user-facing literal exists anywhere, including in scaffolding, because
 * scaffolding is exactly where hardcoded English survives to production.
 */
export function PlaceholderScreen({ titleKey }: PlaceholderScreenProps) {
  const { t } = useTranslation(['admin', 'common']);

  return (
    <section className="placeholder">
      <h1>{t(titleKey)}</h1>
      <p>{t('common:placeholder.comingSoon')}</p>
    </section>
  );
}
