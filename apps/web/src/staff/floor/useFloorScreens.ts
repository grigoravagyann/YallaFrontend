import type { AwaitingApproval, ConversationSubjectRef } from '@yalla/api';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { PhoneTab } from '../phone/PhoneShell';
import { usePhoneLayout } from '../phone/usePhoneLayout';
import type { StaffView } from '../StaffHeader';

/** The people who see the phone's Today: a manager and everyone above. */
const MANAGER_ROLES: ReadonlySet<string> = new Set(['manager', 'generalManager', 'owner']);

/** A screen opened from More: its notification switches, or My results. */
export type MoreScreen = 'notifications' | 'results' | null;

/**
 * Which screen is on show, on the tablet and on the phone, and the address
 * that goes with it.
 */
export function useFloorScreens(role: string) {
  /**
   * The screen on show. The Messages tab has its own address, `/staff/messages`
   * (2026-10-23), so a tablet reloaded there — or opened from a link — comes
   * back to it; the others are the floor's own and keep `/staff`.
   */
  const location = useLocation();
  const navigate = useNavigate();
  const onMessagesPath = /\/messages\/?$/u.test(location.pathname);
  const [view, setView] = useState<StaffView>(onMessagesPath ? 'messages' : 'floor');
  const [lastMessagesPath, setLastMessagesPath] = useState(onMessagesPath);
  /**
   * The phone shell (staff phone spec): below 600px, or installed on a phone.
   * The same state, queries and commands as the tablet below; only what is
   * drawn differs.
   */
  const phone = usePhoneLayout();
  const manager = MANAGER_ROLES.has(role);
  const homeTab: PhoneTab = manager ? 'today' : 'now';
  const [phoneTab, setPhoneTab] = useState<PhoneTab>(onMessagesPath ? 'messages' : homeTab);
  /** A screen opened from More: its notification switches, or My results. */
  const [moreScreen, setMoreScreen] = useState<MoreScreen>(null);
  /** The booking open on the phone's Approve screen, as it was last read. */
  const [approving, setApproving] = useState<AwaitingApproval | null>(null);
  if (onMessagesPath !== lastMessagesPath) {
    // Back and forward in the browser move between the floor and the inbox.
    setLastMessagesPath(onMessagesPath);
    if (onMessagesPath) setView('messages');
    else if (view === 'messages') setView('floor');
    if (onMessagesPath) setPhoneTab('messages');
    else if (phoneTab === 'messages') setPhoneTab(homeTab);
  }
  /** The conversation open in the Messages tab; null for the first in its list. */
  const [messageSubject, setMessageSubject] = useState<ConversationSubjectRef | null>(null);

  return {
    location,
    navigate,
    onMessagesPath,
    view,
    setView,
    phone,
    manager,
    phoneTab,
    setPhoneTab,
    moreScreen,
    setMoreScreen,
    approving,
    setApproving,
    messageSubject,
    setMessageSubject,
  };
}
