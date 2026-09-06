import { useTranslation } from '@yalla/i18n';
import { OnboardingChecklist } from './OnboardingChecklist';

/**
 * Where the venue section opens.
 *
 * Previously it redirected straight to the floor plan, which is the right first
 * screen during the first hour of onboarding and the wrong one for every visit
 * after it. What somebody actually arrives wanting to know is whether the venue
 * is finished, and until now that took opening five screens and remembering
 * what each one should look like.
 */
export function VenueOverviewScreen() {
  const { t } = useTranslation(['admin', 'common']);

  return (
    <section className="page venue-overview">
      <h2>{t('nav.overview')}</h2>
      <p className="muted">{t('checklist.body')}</p>
      <OnboardingChecklist />
    </section>
  );
}
