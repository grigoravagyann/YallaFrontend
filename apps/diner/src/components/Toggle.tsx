import { Switch } from 'react-native';
import { colors } from '../theme';

export interface ToggleProps {
  readonly value: boolean;
  readonly onValueChange: (value: boolean) => void;
  readonly disabled?: boolean;
  readonly accessibilityLabel: string;
}

/**
 * An on/off switch in the app's colours: a white thumb either way, on the
 * brand track when on and on `borderStrong` when off, so the thumb stands
 * out on both and the off track still has an edge on a white card. Position
 * says which as well as colour.
 *
 * react-native-web paints an "on" thumb from `activeThumbColor`, not
 * `thumbColor`, and defaults it to teal: it is passed for the web build.
 */
export function Toggle({
  value,
  onValueChange,
  disabled = false,
  accessibilityLabel,
}: ToggleProps) {
  return (
    <Switch
      value={value}
      disabled={disabled}
      onValueChange={onValueChange}
      trackColor={{ true: colors.brand, false: colors.borderStrong }}
      ios_backgroundColor={colors.borderStrong}
      thumbColor={colors.toggleThumb}
      {...({ activeThumbColor: colors.toggleThumb } as object)}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
