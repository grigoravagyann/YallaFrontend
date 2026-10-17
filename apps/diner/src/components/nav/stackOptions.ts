import { colors } from '../../theme';

/**
 * Screen options every stack in the app shares.
 *
 * Every pushed screen sits on the dark ground, including the frame a native
 * transition shows before the screen has drawn, and the few screens that show
 * a native header get it in the same colours, with no hairline under it.
 */
export const STACK_OPTIONS = {
  headerShown: false,
  contentStyle: { backgroundColor: colors.background },
  headerStyle: { backgroundColor: colors.background },
  headerTintColor: colors.text,
  headerTitleStyle: { color: colors.text },
  headerShadowVisible: false,
};
