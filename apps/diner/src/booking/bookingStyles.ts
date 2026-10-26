import { StyleSheet } from 'react-native';
import { colors, space, typography } from '../theme';

/** Styles more than one part of the booking screen draws with. */
export const bookingStyles = StyleSheet.create({
  /** A word under a time or a table: requestable, free it by. */
  slotNote: { ...typography.caption, color: colors.infoInk, paddingHorizontal: space.xs },
});
