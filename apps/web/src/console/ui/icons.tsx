import type { ReactNode } from 'react';

/**
 * The line icons the console artboards draw, as components.
 *
 * Every one is decorative: `aria-hidden`, because the control or sentence
 * beside it already says what it means. The paths are the artboards' own
 * (Lucide shapes), so the console reads the same as the approved design.
 */

interface IconProps {
  readonly className?: string;
  readonly strokeWidth?: number;
}

function Icon({
  className = 'yc-i',
  strokeWidth = 1.8,
  children,
}: IconProps & { readonly children: ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 22V12h6v10" />
    </Icon>
  );
}

export function VenuesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m2 7 4.4-4.4A2 2 0 0 1 7.8 2h8.4a2 2 0 0 1 1.4.6L22 7" />
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" />
      <path d="M2 7h20v3a2 2 0 0 1-2 2 2.7 2.7 0 0 1-2-1 2.7 2.7 0 0 1-4 0 2.7 2.7 0 0 1-4 0 2.7 2.7 0 0 1-4 0 2.7 2.7 0 0 1-2 1 2 2 0 0 1-2-2z" />
    </Icon>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.7l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7v.2a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.7v-.5a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

export function SignOutIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </Icon>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.1 12.3a1 1 0 0 1 0-.7 10.7 10.7 0 0 1 19.8 0 1 1 0 0 1 0 .7 10.7 10.7 0 0 1-19.8 0" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

export function EyeOffIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10.7 5.1a10.7 10.7 0 0 1 11.2 6.6 1 1 0 0 1 0 .7 10.7 10.7 0 0 1-1.4 2.5" />
      <path d="M14.1 14.2a3 3 0 0 1-4.2-4.2" />
      <path d="M17.5 17.5a10.7 10.7 0 0 1-15.4-5.2 1 1 0 0 1 0-.7 10.7 10.7 0 0 1 4.4-5.1" />
      <path d="m2 2 20 20" />
    </Icon>
  );
}

export function AlertCircleIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2} {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" />
    </Icon>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2} {...props}>
      <rect width="18" height="11" x="3" y="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2.2} {...props}>
      <path d="M20 6 9 17l-5-5" />
    </Icon>
  );
}

export function CrossIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2.4} {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Icon>
  );
}

export function DotIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2.4} {...props}>
      <path d="M12 12h.01" />
    </Icon>
  );
}

export function LinkOffIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2} {...props}>
      <path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 1 1 0 10h-2" />
      <path d="m2 2 20 20" />
    </Icon>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2} {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M20 21a8 8 0 0 0-16 0" />
    </Icon>
  );
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2} {...props}>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </Icon>
  );
}

/** The five error-state icons, from the Errors artboard's DCLogic. */
export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M21 21l-4.3-4.3" />
      <path d="M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z" />
    </Icon>
  );
}

export function PadlockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      <path d="M5 11h14v10H5z" />
    </Icon>
  );
}

export function WifiOffIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2 8.8a15 15 0 0 1 20 0M5 12.9a10 10 0 0 1 14 0M8.5 16.4a5 5 0 0 1 7 0" />
      <path d="M2 2l20 20" />
    </Icon>
  );
}

export function WarningIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M21.7 18l-8-14a2 2 0 0 0-3.5 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3" />
      <path d="M12 9v4M12 17h.01" />
    </Icon>
  );
}

export function GlobeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" />
    </Icon>
  );
}

/** The Venues artboard's icons. */
export function PlusIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2} {...props}>
      <path d="M5 12h14M12 5v14" />
    </Icon>
  );
}

/** Up and down chevrons: a control that switches between values. */
export function ChevronsUpDownIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2} {...props}>
      <path d="m7 15 5 5 5-5M7 9l5-5 5 5" />
    </Icon>
  );
}

/** The ⋮ of a row's menu. */
export function MoreIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2} {...props}>
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="19" r="1" />
    </Icon>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2} {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M10 15V9M14 15V9" />
    </Icon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2} {...props}>
      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </Icon>
  );
}

/** Back the way it was: restore, undo a delete. */
export function RestoreIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2} {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </Icon>
  );
}

/** A cover photo that is not there yet. */
export function ImageOffIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m2 2 20 20" />
      <path d="M10.4 10.4a2 2 0 1 1-2.8-2.8" />
      <path d="M13.5 13.5 6 21" />
      <path d="M3.6 3.6A2 2 0 0 0 3 5v14a2 2 0 0 0 2 2h14c.6 0 1-.2 1.4-.6" />
      <path d="M21 15V5a2 2 0 0 0-2-2H9" />
    </Icon>
  );
}

/** A bill: the Paid refusal's box. */
export function ReceiptIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2} {...props}>
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z" />
      <path d="M8 7h8M8 11h8M8 15h5" />
    </Icon>
  );
}

/** "Stays the same" in a list of consequences, between a tick and a cross. */
export function MinusIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2.2} {...props}>
      <path d="M5 12h14" />
    </Icon>
  );
}

/** Home's bookings card. */
export function CalendarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </Icon>
  );
}

/** Home's "awaiting approval" card. */
export function ClockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </Icon>
  );
}

/** Home's open-tabs card: the receipt with a dram-like stroke. */
export function TabIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z" />
      <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
      <path d="M12 17.5v-11" />
    </Icon>
  );
}

/** "Go there": a card or a link that opens another page. */
export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2} {...props}>
      <path d="m9 18 6-6-6-6" />
    </Icon>
  );
}

/** "Further down this page". */
export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2} {...props}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

/** Move a row up a step. */
export function ChevronUpIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2.2} {...props}>
      <path d="m18 15-6-6-6 6" />
    </Icon>
  );
}

/** A photo: bulk photos, and a dish with none yet. */
export function ImageIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
    </Icon>
  );
}

/** A feed line about a tier change. */
export function ArrowsUpDownIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2} {...props}>
      <path d="m7 15 5 5 5-5M7 9l5-5 5 5" />
    </Icon>
  );
}

/** A feed line about a sign-in link or a message. */
export function SendIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2} {...props}>
      <path d="M14.5 21.7a.5.5 0 0 0 .9 0l6.5-19a.5.5 0 0 0-.6-.6l-19 6.5a.5.5 0 0 0 0 .9l7.9 3.2a2 2 0 0 1 1.1 1.1z" />
      <path d="m21.9 2.1-11 11" />
    </Icon>
  );
}

// --- The venue console's sidebar (docs/design/venue-console) ----------------

/** Overview: the day at a glance. */
export function OverviewIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect width="7" height="9" x="3" y="3" rx="1" />
      <rect width="7" height="5" x="14" y="3" rx="1" />
      <rect width="7" height="9" x="14" y="12" rx="1" />
      <rect width="7" height="5" x="3" y="16" rx="1" />
    </Icon>
  );
}

/** The menu: a fork and a knife. */
export function MenuIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
      <path d="M7 2v20" />
      <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
    </Icon>
  );
}

/** The phone's navigation drawer: three lines (not the dish menu above). */
export function DrawerIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2} {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </Icon>
  );
}

/** Rooms and tables. */
export function RoomsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M3 9h18M9 21V9" />
    </Icon>
  );
}

/** The reservation policy: a calendar with a tick. */
export function PolicyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4" />
    </Icon>
  );
}

/** The public page: the globe drawn with its meridian. */
export function PublicPageIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" />
    </Icon>
  );
}

/** Staff: two people. */
export function StaffIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
    </Icon>
  );
}

/** Reviews. */
export function StarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M11.5 2.3a.5.5 0 0 1 1 0l2.3 4.7 5.2.8a.5.5 0 0 1 .3.9l-3.8 3.6.9 5.2a.5.5 0 0 1-.8.6L12 15.6l-4.6 2.5a.5.5 0 0 1-.8-.6l.9-5.2L3.7 8.7a.5.5 0 0 1 .3-.9l5.2-.8z" />
    </Icon>
  );
}

/** Messages with guests: a speech bubble. */
export function MessagesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </Icon>
  );
}

/** Reports: a line going up. */
export function ReportsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 3v18h18" />
      <path d="m19 9-5 5-4-4-3 3" />
    </Icon>
  );
}

/** The one branch a branch manager works at. */
export function MapPinIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2} {...props}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </Icon>
  );
}

/** A computer: a sign-in from a desktop browser. */
export function MonitorIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2 3h20v14H2zM8 21h8M12 17v4" />
    </Icon>
  );
}

/** A reported review: a flag (Overview's "worth a look"). */
export function FlagIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2} {...props}>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7" />
    </Icon>
  );
}

/** A tablet on the floor or in the kitchen. */
export function TabletIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2} {...props}>
      <rect width="16" height="20" x="4" y="2" rx="2" />
      <path d="M12 18h.01" />
    </Icon>
  );
}

/** Information, not a warning: a result that is said and kept on the page. */
export function InfoIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2} {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </Icon>
  );
}

/** A guest's phone: what a diner sees (Policy's examples). */
export function PhoneIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2} {...props}>
      <rect width="14" height="20" x="5" y="2" rx="2" />
      <path d="M12 18h.01" />
    </Icon>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2} {...props}>
      <path d="m15 18-6-6 6-6" />
    </Icon>
  );
}

/** A download: "Export everything (CSV)" on the Reports page. */
export function DownloadIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2} {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
      <path d="M12 15V3" />
    </Icon>
  );
}

/** History (2026-10-24): a clock with its hand turning back. */
export function HistoryIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </Icon>
  );
}
