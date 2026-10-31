import { useTranslation } from '@yalla/i18n';
import { Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { colors, layout, space, typography } from '../../theme';
import { Button } from '../Button';
import { Rise } from '../motion/Rise';
import { Screen } from '../Screen';
import { Text } from '../Text';
import { AuthHeader } from './AuthHeader';
import { BookingSummary } from './BookingSummary';
import { carriesBooking } from './useAuthFinish';

export interface AuthScaffoldProps {
  readonly title: string;
  readonly body: string;
  readonly onBack: () => void;
  readonly children: ReactNode;
  /**
   * The booking being made, when sign-in interrupted one (`useAuthFinish`'s
   * `forward`). Its table is shown at the top, and the header says this is the
   * last step before it.
   */
  readonly booking?: Readonly<Record<string, string>>;
  /** "No account yet?" + a text button, under the form. */
  readonly footer?: {
    readonly prompt: string;
    readonly action: string;
    readonly onPress: () => void;
  };
}

/**
 * The frame the password screens share with the code flow: a glass back
 * button beside the serif title, the booking this is for when there is one,
 * one line of why, and a scrolling form that stays above the keyboard.
 */
export function AuthScaffold({
  title,
  body,
  onBack,
  children,
  booking,
  footer,
}: AuthScaffoldProps) {
  const { t } = useTranslation('diner');
  const forBooking = carriesBooking(booking);
  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <AuthHeader
          title={title}
          subline={forBooking ? t('verify.beforeBooking') : null}
          onBack={onBack}
        />
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {booking && forBooking ? <BookingSummary booking={booking} /> : null}
          <Rise style={styles.form}>
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
          </Rise>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    paddingBottom: space.xl,
    gap: space.lg,
  },
  form: { gap: space.md + 2 },
  blurb: { ...typography.body, color: colors.textMuted },
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
