import { useTranslation } from '@yalla/i18n';
import wordmark from '../assets/wordmark.png';

/**
 * The logo's own Time to Eat lettering, the same as on the app icon, never the name
 * typed out in a font. Drawn in ivory: it sits on the dark sidebars, the
 * floor tablet's bar, the public page's bar and the sign-in photo.
 */
export function Wordmark({ className }: { readonly className?: string }) {
  const { t } = useTranslation('common');
  return (
    <img
      className={className ? `wordmark ${className}` : 'wordmark'}
      src={wordmark}
      alt={t('appName')}
    />
  );
}
