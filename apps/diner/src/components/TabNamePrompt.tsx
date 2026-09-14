import { isTabAccessEnded } from '@yalla/api';
import { useGateway } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { orderKeys } from '../data/orderQueries';
import { useSession } from '../stores/session';
import { colors, fontWeight, space, typography } from '../theme';
import { FieldInput } from './auth/Field';
import { Button } from './Button';
import { Card } from './Card';
import { Text } from './Text';
import { TAB_NAME_MAX, hasOwnTabName, tidyTabName } from './tabName';

/**
 * Tabs this phone has answered the prompt for this launch — named or skipped.
 * Kept outside the component so moving from the pending screen to the tab does
 * not ask a second time.
 */
const answered = new Set<string>();

/** For tests: forget every answer. */
export function forgetTabNamePrompts(): void {
  answered.clear();
}

export interface TabNamePromptProps {
  readonly tabId: string;
  /** This phone's participant name as the tab read has it. */
  readonly currentName: string | null | undefined;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * "Your name on this tab" — optional, for somebody the tab only knows as a guest.
 *
 * A scanner the phone had no name for reaches the host as "Guest 2", and the
 * host is left approving a stranger. One field, one Save, one Not now; the name
 * goes to `POST /api/tabs/{tabId}/display-name` and is remembered on the phone
 * for the next scan. Never shown to someone who already has a name.
 */
export function TabNamePrompt({ tabId, currentName, style }: TabNamePromptProps) {
  const { t } = useTranslation('diner');
  const gateway = useGateway();
  const queryClient = useQueryClient();
  const rememberedName = useSession((s) => s.guestName);
  const rememberName = useSession((s) => s.setGuestName);

  const [name, setName] = useState(rememberedName ?? '');
  const [closed, setClosed] = useState(() => answered.has(tabId));
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (displayName: string) => gateway.setTabDisplayName(tabId, displayName),
    onSuccess: (_change, displayName) => {
      rememberName(displayName);
      // The roster and the shares both carry the name; read them again.
      void queryClient.invalidateQueries({ queryKey: orderKeys.dinerTab(tabId) });
      void queryClient.invalidateQueries({ queryKey: orderKeys.shares(tabId) });
    },
  });

  if (closed || hasOwnTabName(currentName)) return null;

  const close = () => {
    answered.add(tabId);
    setClosed(true);
  };

  const tidy = tidyTabName(name);

  const submit = async () => {
    if (!tidy || save.isPending) return;
    setError(null);
    try {
      await save.mutateAsync(tidy);
      close();
    } catch (caught) {
      setError(isTabAccessEnded(caught) ? t('tab.accessEnded.body') : t('people.failed'));
    }
  };

  return (
    <Card style={[styles.card, style]}>
      <Text style={styles.title} accessibilityRole="header">
        {t('tab.name.title')}
      </Text>
      <FieldInput
        value={name}
        onChangeText={(next) => {
          setName(next);
          if (error) setError(null);
        }}
        placeholder={t('tab.name.placeholder')}
        accessibilityLabel={t('tab.name.title')}
        maxLength={TAB_NAME_MAX}
        autoCapitalize="words"
        autoCorrect={false}
        autoComplete="name"
        returnKeyType="done"
        editable={!save.isPending}
        invalid={error !== null}
        onSubmitEditing={() => void submit()}
      />
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button
          label={t('tab.name.save')}
          size="small"
          fullWidth={false}
          disabled={!tidy}
          busy={save.isPending}
          onPress={() => void submit()}
        />
        <Button
          label={t('tab.name.skip')}
          variant="text"
          size="small"
          fullWidth={false}
          disabled={save.isPending}
          onPress={close}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm },
  title: { ...typography.bodyLg, fontWeight: fontWeight.bold, color: colors.text },
  error: { ...typography.caption, color: colors.errorInk },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
