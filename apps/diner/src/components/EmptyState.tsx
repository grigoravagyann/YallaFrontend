import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, space, typography, type IoniconName } from '../theme';
import { Button } from './Button';
import { Rise } from './motion/Rise';
import { StateGlow } from './StateGlow';
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
      <Rise>
        <StateGlow icon={icon} />
      </Rise>
      <Rise delay={80}>
        <Text display style={styles.title}>
          {title}
        </Text>
      </Rise>
      {body ? (
        <Rise delay={140}>
          <Text style={styles.body}>{body}</Text>
        </Rise>
      ) : null}
      {action ? (
        <Rise delay={200}>
          <Button
            label={action.label}
            onPress={action.onPress}
            fullWidth={false}
            style={styles.action}
          />
        </Rise>
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
  title: { ...typography.heading, color: colors.text, textAlign: 'center', marginTop: space.md },
  body: { ...typography.body, color: colors.textMuted, textAlign: 'center', maxWidth: 280 },
  action: { marginTop: space.md, alignSelf: 'center' },
});
