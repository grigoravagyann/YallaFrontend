import { FloorPlan } from '@yalla/floorplan';
import { useTranslation } from '@yalla/i18n';
import { useEffect, useRef, useState } from 'react';

/**
 * Proves the cross-platform path: this is the same `@yalla/floorplan` component
 * the diner phone and the staff tablet render, running here through
 * `react-native-web`. It draws an empty room for now — tables arrive with the
 * floor plan editor in a later task.
 */
export function FloorPlanRoute() {
  const { t } = useTranslation(['admin', 'common']);
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  // The component scales to whatever box it is given, so the box has to be
  // measured rather than assumed.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setViewport({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <section className="placeholder">
      <h1>{t('nav.floorplan')}</h1>
      <p>{t('common:placeholder.comingSoon')}</p>

      <div ref={containerRef} className="floorplan-frame">
        <FloorPlan
          tables={[]}
          canvas={{ width: 1000, height: 600 }}
          viewport={viewport}
          accessibilityLabel={t('nav.floorplan')}
        />
      </div>
    </section>
  );
}
