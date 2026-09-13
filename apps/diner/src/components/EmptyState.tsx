import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, iconSize, radius, space, typography, type IoniconName } from '../theme';
import { Button } from './Button';
import { Text } from './Text';

export interface EmptyStateAction {
  readonly label: string;
  readonly onPress: () => void;
}

export interface EmptyStateProps {
  readonly icon: IoniconName;
  readonly title: string;
  readonly body?: string;
  /** One outline button under the copy — "Explore places", "Scan a table". */
  readonly action?: EmptyStateAction;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * Nothing here yet — said calmly, with the one thing to do about it.
 */
export function EmptyState({ icon, title, body, action, style }: EmptyStateProps) {
  return (
    <View style={[styles.root, style]}>
      <View style={styles.iconWell}>
        <Ionicons name={icon} size={iconSize.xl} color={colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {action ? (
        <Button
          label={action.label}
          onPress={action.onPress}
          variant="outline"
          fullWidth={false}
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    paddingVertical: space.xxl,
    paddingHorizontal: space.xl,
    gap: space.sm,
  },
  iconWell: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  title: { ...typography.h3, color: colors.text, textAlign: 'center' },
  body: { ...typography.body, color: colors.textMuted, textAlign: 'center', maxWidth: 280 },
  action: { marginTop: space.md, alignSelf: 'center' },
});
