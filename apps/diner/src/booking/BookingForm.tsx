import { useTranslation } from '@yalla/i18n';
import { Stack } from 'expo-router';
import { useRef } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../components/Screen';
import { Text } from '../components/Text';
import { FreeBySheet } from '../components/bookings/FreeBySheet';
import { BookingBlockedNote, GuestRecordPrivacyLine } from '../components/bookings/GuestRecord';
import { colors, layout, space, typography } from '../theme';
import { BookingFooter } from './BookingFooter';
import { BookingHeader } from './BookingHeader';
import { DayStrip } from './DayStrip';
import { FreeByAlternatives } from './FreeByAlternatives';
import { BookingNoteField, GuestNameField } from './GuestFields';
import { PartyPicker } from './PartyPicker';
import { ChosenTableNote, TablePhotos } from './TablePicker';
import { ChangeTimeGoneNote, TimePicker } from './TimePicker';
import { useBookingForm, type BookingFormInput } from './useBookingForm';

export interface BookingFormProps extends BookingFormInput {
  readonly title: string;
  readonly onBack: () => void;
}

/**
 * The form itself, once the place is here: the day strip, the times, the
 * party, the room photos at the slot, who books — and Book (or Save changes).
 */
export function BookingForm({ title, onBack, ...input }: BookingFormProps) {
  const { t } = useTranslation('diner');
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  // Where "Pick a table" starts in the scroll, so a table taken under the
  // diner's finger can bring them back to the photo.
  const pickTop = useRef(0);
  const form = useBookingForm({ ...input, scrollRef, pickTop });
  const { place, change } = input;
  const freeByAsk = form.freeByAsk;

  return (
    <Screen edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <BookingHeader title={title} onBack={onBack} place={place} />
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <DayStrip
            days={form.days}
            selectedKey={form.activeDateKey}
            timeZoneId={place.timeZoneId}
            label={form.dayLabel}
            onSelect={form.selectDay}
          />

          <TimePicker
            hasSlots={form.shownSlots.length > 0}
            soonSlot={form.soonSlot}
            quick={form.quick}
            leadMinutes={form.leadMinutes}
            activeMs={form.activeMs}
            timeLabel={form.timeLabel}
            onPick={form.pickTime}
            wheelRows={form.wheelRows}
            spokenTime={form.spokenTime}
            snapNote={form.snapNote}
            requestNote={form.requestNote}
            freeByNote={form.freeByNote}
            slotFailed={form.slotFailed}
            onRetrySlot={form.retrySlot}
            struckHint={form.struckHint}
          />
          {/* A change whose time is gone: nothing is chosen for it, and why. */}
          {form.changeTimeGone ? <ChangeTimeGoneNote /> : null}

          <PartyPicker
            partySize={form.partySize}
            moreOpen={form.moreOpen}
            moreSizes={form.moreSizes}
            fits={form.fits}
            onMoreOpenChange={form.setMoreOpen}
            onSelectParty={form.selectParty}
          />

          <TablePhotos
            rooms={form.slotRooms}
            selectedTableId={form.pickedTableId}
            partySize={form.partySize}
            anyRequest={form.anyRequest}
            conflictText={form.conflictText}
            onTop={(y) => {
              pickTop.current = y;
            }}
            onSelect={form.selectTable}
          />

          <ChosenTableNote
            chosenTable={form.chosenTable}
            chosenRefusal={form.chosenRefusal}
            chosenAtSlot={form.chosenAtSlot}
            noTableFits={form.noTableFits}
            noTableText={form.noTableText}
            timeZoneId={place.timeZoneId}
          />

          {form.needsName ? (
            <GuestNameField value={form.guestName} onChange={form.setGuestName} />
          ) : null}

          {/* The note went to the venue with the booking; a change moves the
              booking and leaves the note as it was. */}
          {change ? null : (
            <BookingNoteField value={form.requests} onChange={form.changeRequests} />
          )}

          {form.mustVerify ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {t('confirm.error.phoneNotVerified')}
            </Text>
          ) : null}

          {/* Paused for no-shows: no Book, and until when. */}
          {form.pausedUntil ? <BookingBlockedNote untilUtc={form.pausedUntil} /> : null}

          {form.errorText && !(form.pauseRefused && form.pausedUntil) ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {form.errorText}
            </Text>
          ) : null}

          {/* What the venue sees of the guest, said before Book. */}
          {change ? null : <GuestRecordPrivacyLine />}

          {/* Said no to freeing the table in time: another table or time. */}
          {form.freeByDeclined ? (
            <FreeByAlternatives
              times={form.unlimited}
              timeLabel={form.timeLabel}
              onPick={form.pickTime}
            />
          ) : null}
        </ScrollView>

        <BookingFooter
          bottomInset={insets.bottom}
          bookingsOff={form.bookingsOff}
          label={form.ctaLabel}
          summary={form.summary}
          accessibilityLabel={form.ctaAccessibilityLabel}
          disabled={!form.canConfirm}
          busy={form.pending}
          onPress={() => void form.confirm()}
        />
      </KeyboardAvoidingView>

      {/* "There is a booking at 21:30. Will you free the table by 21:25?" */}
      {freeByAsk ? (
        <FreeBySheet
          visible
          freeByUtc={freeByAsk.freeByUtc}
          nextStartUtc={freeByAsk.nextStartUtc}
          timeZoneId={place.timeZoneId}
          busy={form.pending}
          onAccept={() => form.acceptFreeBy(freeByAsk.freeByUtc)}
          onDecline={form.declineFreeBy}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.xs,
    paddingBottom: space.xl,
    gap: space.lg,
  },
  error: { ...typography.body, color: colors.errorInk },
});
