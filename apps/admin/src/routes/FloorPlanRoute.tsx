import { FloorPlan, Legend, cafeFloorPlan } from '@yalla/floorplan';
import { useTranslation } from '@yalla/i18n';
import { Link } from 'react-router-dom';
import { useElementSize } from '../useElementSize';

/**
 * Read-only preview of the branch floor plan.
 *
 * The drag-and-drop editor is a later task; for now this renders the same
 * `@yalla/floorplan` component the diner phone and staff tablet use, through
 * `react-native-web`, against mock data.
 */
export function FloorPlanRoute() {
  const { t } = useTranslation(['admin', 'common']);
  const [containerRef, size] = useElementSize<HTMLDivElement>();

  return (
    <section className="placeholder">
      <h1>{t('nav.floorplan')}</h1>
      <p>
        {t('common:placeholder.comingSoon')} <Link to="/dev/floorplan">Open the dev harness →</Link>
      </p>

      <Legend mode="staff" translate={(key) => t(`common:${key}`)} />

      <div ref={containerRef} className="floorplan-frame">
        <FloorPlan
          plan={cafeFloorPlan}
          mode="staff"
          viewport={size}
          accessibilityLabel={t('nav.floorplan')}
        />
      </div>
    </section>
  );
}
