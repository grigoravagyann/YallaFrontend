import { SlugTakenError, ValidationError } from '@yalla/api';
import type { TFunction } from 'i18next';

/**
 * The sentence for a refused venue or branch form, naming the field at fault
 * where the server did: a taken web address, or the one field a 400 blamed.
 * Anything else is "nothing changed, try again", because it is.
 */
export function venueFormRefusal(caught: unknown, t: TFunction): string {
  if (caught instanceof SlugTakenError) return t('create.error.slugTaken', { slug: caught.slug });
  if (caught instanceof ValidationError && caught.violations.length > 1) {
    return t('create.error.fields', {
      fields: caught.violations.map((violation) => violation.field).join(', '),
    });
  }
  if (caught instanceof ValidationError && caught.field) {
    return t('create.error.field', { field: caught.field, detail: caught.message });
  }
  return t('venue.failed');
}
