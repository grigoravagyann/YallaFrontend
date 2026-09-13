import { useTranslation } from '@yalla/i18n';
import { Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { actionIcon, colors, layout, space, typography } from '../../theme';
import { Button } from '../Button';
import { IconButton } from '../IconButton';
import { Screen } from '../Screen';
import { Text } from '../Text';

export interface AuthScaffoldProps {
  readonly title: string;
  readonly body: string;
  readonly onBack: () => void;
  readonly children: ReactNode;
  /** "No account yet?" + a text button, under the form. */
  readonly footer?: {
    readonly prompt: string;
    readonly action: string;
    readonly onPress: () => void;
  };
}

/**
 * The frame the password screens share with the SMS flow: back arrow, serif
 * title, one line of why, a scrolling form that stays above the keyboard.
 */
export function AuthScaffold({ title, body, onBack, children, footer }: AuthScaffoldProps) {
  const { t } = useTranslation('diner');
  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <IconButton
            icon={actionIcon.back}
            accessibilityLabel={t('floorPlan.back')}
            variant="ghost"
            onPress={onBack}
          />
        </View>
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text display style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <Text style={styles.blurb}>{body}</Text>
          {children}
          {footer ? (
            <View style={styles.footer}>
              <Text style={styles.footerText}>{footer.prompt}</Text>
              <Button
                label={footer.action}
                variant="text"
                fullWidth={false}
                onPress={footer.onPress}
              />
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingHorizontal: space.sm, paddingVertical: space.xs },
  body: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    paddingBottom: space.xl,
    gap: space.md,
  },
  title: { ...typography.title, color: colors.text },
  blurb: { ...typography.body, color: colors.textMuted, marginBottom: space.sm },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: space.xs,
    marginTop: space.sm,
  },
  footerText: { ...typography.body, color: colors.textMuted },
});
