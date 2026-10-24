import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The redesigned floor tablet names no colour of its own.
 *
 * floor-tablet HANDOFF: the tablet uses the console's tokens, type and colour
 * rules. Every colour it needs is a `--console-*` token from `@yalla/tokens`
 * (`console.ts`, where the contrast tests see it); a hex value typed here is a
 * second palette nobody checks. Files join this list as each phase restyles
 * them.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

const REDESIGNED = [
  'staff.css',
  'StaffHeader.tsx',
  'TableList.tsx',
  'tableCard.ts',
  'FloorRail.tsx',
  'ApprovalPanel.tsx',
  'FloorRoute.tsx',
  'TableActionPanel.tsx',
  'StaffRoute.tsx',
  'auth/PinScreen.tsx',
  'OrderEntry.tsx',
  'TabPanel.tsx',
  'CashKeypad.tsx',
  'OverlayBar.tsx',
  'OrderQueuePanel.tsx',
  'KitchenRoute.tsx',
  'ConflictList.tsx',
  'PreOrderPanel.tsx',
  'OnMyWayAsk.tsx',
  'takeaway/TakeawayAccept.tsx',
  'takeaway/TakeawayCounter.tsx',
  'messages/MessagesInbox.tsx',
  'messages/MessageThread.tsx',
  'messages/MessagesRailSection.tsx',
  'phone/phone.css',
  'phone/PhoneShell.tsx',
  'phone/PhoneNowSections.tsx',
  'phone/PhoneApprove.tsx',
  'phone/PhoneToday.tsx',
  'phone/PhoneMore.tsx',
];

/** Comments may quote a value; only code is checked. */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');
}

const COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch)\(/giu;

describe('the floor tablet redesign', () => {
  it('names no colour outside @yalla/tokens', () => {
    for (const file of REDESIGNED) {
      const code = withoutComments(readFileSync(join(HERE, file), 'utf8'));
      expect(code.match(COLOUR), file).toBeNull();
    }
  });

  it('puts the staff surface on the console tokens', () => {
    const css = withoutComments(readFileSync(join(HERE, 'staff.css'), 'utf8'));
    // The product palette the older staff screens read is remapped, so they
    // follow the tablet's look without a rule of their own.
    for (const variable of [
      '--color-paper',
      '--color-surface',
      '--color-foreground',
      '--color-muted-foreground',
      '--color-primary',
      '--color-danger',
      '--color-warning',
    ]) {
      expect(css, variable).toMatch(new RegExp(`${variable}:\\s*var\\(--console-`, 'u'));
    }
  });
});
