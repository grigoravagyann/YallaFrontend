import type {
  AwaitingApproval,
  BranchConversations,
  ConversationSubjectRef,
  StaffFloor,
} from '@yalla/api';
import type { TFunction } from 'i18next';
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { Location, NavigateFunction } from 'react-router-dom';
import type { PhoneTab } from '../phone/PhoneShell';
import { staffLinkOf, type StaffLink } from '../pwa/deepLinks';
import type { StaffView } from '../StaffHeader';
import type { SetNotice } from './notices';
import type { Selection } from './useFloorCommands';
import type { MoreScreen } from './useFloorScreens';

export interface UseStaffDeepLinkOptions {
  readonly location: Location;
  readonly navigate: NavigateFunction;
  readonly active: boolean;
  readonly phone: boolean;
  readonly t: TFunction;
  readonly awaiting: {
    readonly data: readonly AwaitingApproval[] | undefined;
    readonly isError: boolean;
  };
  readonly inbox: BranchConversations | null;
  readonly inboxFailed: boolean;
  readonly floor: StaffFloor | null;
  readonly floorFailed: boolean;
  readonly setSelection: Dispatch<SetStateAction<Selection | null>>;
  readonly setApproving: Dispatch<SetStateAction<AwaitingApproval | null>>;
  readonly setMoreScreen: Dispatch<SetStateAction<MoreScreen>>;
  readonly setView: Dispatch<SetStateAction<StaffView>>;
  readonly setPhoneTab: Dispatch<SetStateAction<PhoneTab>>;
  readonly setMessageSubject: Dispatch<SetStateAction<ConversationSubjectRef | null>>;
  readonly setNotice: SetNotice;
}

/**
 * A tapped notification (`docs/notifications.md` §6a).
 *
 * `/staff/approve/{id}`, `/staff/messages/{conversationId}`, `/staff/now?call=`,
 * `/staff/takeaway/{orderId}` and `/staff/floor?table=` (`pwa/deepLinks.ts`):
 * read once, when what it points at has loaded and the screen is unlocked,
 * then the address goes back to the screen's own so Back does not reopen it.
 */
export function useStaffDeepLink({
  location,
  navigate,
  active,
  phone,
  t,
  awaiting,
  inbox,
  inboxFailed,
  floor,
  floorFailed,
  setSelection,
  setApproving,
  setMoreScreen,
  setView,
  setPhoneTab,
  setMessageSubject,
  setNotice,
}: UseStaffDeepLinkOptions): void {
  const [pendingLink, setPendingLink] = useState<StaffLink | null>(() =>
    staffLinkOf(location.pathname, location.search),
  );
  const [lastLinkKey, setLastLinkKey] = useState(location.key);
  if (location.key !== lastLinkKey) {
    setLastLinkKey(location.key);
    const link = staffLinkOf(location.pathname, location.search);
    if (link) setPendingLink(link);
  }
  /**
   * Where the address goes once a link is read: a fresh object each time, so
   * the effect below navigates once per link.
   */
  const [linkHome, setLinkHome] = useState<{ readonly path: string } | null>(null);
  // Resolved while rendering, as the Messages address is: what the link
  // points at has loaded, so the screen it opens is set in this render.
  if (pendingLink && active) {
    const settle = (path: string) => {
      setPendingLink(null);
      setLinkHome({ path });
    };
    switch (pendingLink.kind) {
      case 'approve': {
        const list = awaiting.data;
        if (!list && !awaiting.isError) break;
        const request = list?.find((one) => one.id === pendingLink.reservationId) ?? null;
        setSelection(null);
        setMoreScreen(null);
        setView('floor');
        setPhoneTab('now');
        // On the phone, its own screen; on the tablet, the rail beside the
        // floor lists it already.
        setApproving(phone ? request : null);
        if (!request) setNotice({ kind: 'info', text: t('phone.approve.gone') });
        settle('/staff');
        break;
      }
      case 'message': {
        if (!inbox && !inboxFailed) break;
        const item = inbox?.items.find((one) => one.conversationId === pendingLink.conversationId);
        setSelection(null);
        setApproving(null);
        setMoreScreen(null);
        setMessageSubject(item ? { kind: item.subject.kind, id: item.subject.id } : null);
        setView('messages');
        setPhoneTab('messages');
        settle('/staff/messages');
        break;
      }
      case 'call':
      case 'takeaway':
        setSelection(null);
        setApproving(null);
        setMoreScreen(null);
        setView(pendingLink.kind === 'takeaway' ? 'takeaway' : 'floor');
        setPhoneTab(pendingLink.kind === 'takeaway' ? 'takeaway' : 'now');
        settle('/staff');
        break;
      case 'table': {
        if (!floor && !floorFailed) break;
        setApproving(null);
        setMoreScreen(null);
        setView('floor');
        setPhoneTab('floor');
        const tableId = pendingLink.tableId;
        setSelection(
          tableId && floor?.plan.tables.some((table) => table.id === tableId) ? { tableId } : null,
        );
        settle('/staff');
        break;
      }
    }
  }
  useEffect(() => {
    if (linkHome) navigate(linkHome.path, { replace: true });
  }, [linkHome, navigate]);
}
