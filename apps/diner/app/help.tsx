import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '@yalla/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { IconButton } from '../src/components/IconButton';
import { Screen } from '../src/components/Screen';
import { Text } from '../src/components/Text';
import { supportContact } from '../src/data/appInfo';
import {
  actionIcon,
  colors,
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  typography,
} from '../src/theme';

/**
 * The questions the app's own behaviour raises, answered the way the app
 * actually behaves. When that behaviour changes, the answer changes with it.
 */
const TOPICS = ['booking', 'code', 'table', 'reviews', 'deleteAccount', 'favorites'] as const;

type Topic = (typeof TOPICS)[number];

function open(url: string): void {
  void Linking.openURL(url).catch(() => undefined);
}

/**
 * Help & Support: common questions, and a way to reach a person when the
 * product has one to offer.
 *
 * "Contact support" is drawn only when `EXPO_PUBLIC_SUPPORT_EMAIL` or
 * `EXPO_PUBLIC_SUPPORT_PHONE` is configured. There is no placeholder address:
 * a contact nobody reads is worse than none.
 */
export default function HelpScreen() {
  const { t } = useTranslation('diner');
  const router = useRouter();
  const contact = supportContact();

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  };

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <IconButton
          icon={actionIcon.back}
          onPress={goBack}
          accessibilityLabel={t('floorPlan.back')}
          variant="ghost"
        />
        <Text display numberOfLines={1} style={styles.title} accessibilityRole="header">
          {t('help.title')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.sectionLabel} accessibilityRole="header">
          {t('help.faqTitle')}
        </Text>
        <Card padded={false}>
          {TOPICS.map((topic, index) => (
            <Question key={topic} topic={topic} last={index === TOPICS.length - 1} />
          ))}
        </Card>

        {contact ? (
          <>
            <Text style={styles.sectionLabel} accessibilityRole="header">
              {t('help.contactTitle')}
            </Text>
            <Card style={styles.contact}>
              <Text style={styles.contactBody}>{t('help.contactBody')}</Text>
              {contact.email ? (
                <Button
                  label={t('help.email', { email: contact.email.label })}
                  variant="outline"
                  icon="mail-outline"
                  onPress={() => open(contact.email!.url)}
                />
              ) : null}
              {contact.phone ? (
                <Button
                  label={t('help.phone', { phone: contact.phone.label })}
                  variant="outline"
                  icon="call-outline"
                  onPress={() => open(contact.phone!.url)}
                />
              ) : null}
            </Card>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Question({ topic, last }: { readonly topic: Topic; readonly last: boolean }) {
  const { t } = useTranslation('diner');
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={[styles.question, !last && styles.divider]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
        style={({ pressed }) => [styles.questionRow, pressed && styles.pressed]}
      >
        <Text style={styles.questionText}>{t(`help.faq.${topic}.question`)}</Text>
        <Ionicons
          name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'}
          size={iconSize.md}
          color={colors.textMuted}
        />
      </Pressable>
      {expanded ? <Text style={styles.answer}>{t(`help.faq.${topic}.answer`)}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
  },
  title: { ...typography.heading, color: colors.text, flex: 1, textAlign: 'center' },
  headerSpacer: { width: layout.touchTarget },
  body: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    paddingBottom: space.xxl,
    gap: space.md,
  },
  sectionLabel: {
    ...typography.caption,
    fontWeight: fontWeight.medium,
    color: colors.textMuted,
    marginTop: space.sm,
  },
  question: { paddingHorizontal: space.lg },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  questionRow: {
    minHeight: layout.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderRadius: radius.small,
  },
  pressed: { opacity: 0.7 },
  questionText: {
    ...typography.body,
    fontWeight: fontWeight.medium,
    color: colors.text,
    flex: 1,
  },
  answer: { ...typography.body, color: colors.textMuted, paddingBottom: space.md },
  contact: { gap: space.md },
  contactBody: { ...typography.body, color: colors.textMuted },
});
