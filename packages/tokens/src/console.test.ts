import { describe, expect, it } from 'vitest';
import { consoleColor, consoleRadius, consoleShadow, consoleSize, consoleText } from './console';
import { AA_BODY, contrastRatio } from './contrast';
import { renderTokenCss } from './css';

/**
 * The platform-admin console's own palette, asserting things about itself.
 *
 * Approved on 2026-10-18 in place of the beige accent for this one area: a
 * cream canvas, a dark-brown sidebar and a brown primary button. The values
 * are the artboards' (`docs/design/console/source/_shell.css`), so what these
 * tests hold is that the look the user approved is also one a person can read.
 */

const round = (n: number) => Math.round(n * 100) / 100;
const ratio = (fg: string, bg: string) => round(contrastRatio(fg, bg));

describe('console text', () => {
  const grounds = [
    ['canvas', consoleColor.canvas],
    ['surface', consoleColor.surface],
    ['surfaceMuted', consoleColor.surfaceMuted],
    ['hover', consoleColor.hover],
    ['brandTint', consoleColor.brandTint],
  ] as const;

  for (const [groundName, ground] of grounds) {
    it(`ink, muted and the brand as a link clear AA on ${groundName}`, () => {
      expect(ratio(consoleColor.ink, ground)).toBeGreaterThanOrEqual(AA_BODY);
      expect(ratio(consoleColor.muted, ground)).toBeGreaterThanOrEqual(AA_BODY);
      expect(ratio(consoleColor.brand, ground)).toBeGreaterThanOrEqual(AA_BODY);
    });
  }

  it('the label on the brown button clears AA at rest, hovered and busy', () => {
    for (const fill of [consoleColor.brand, consoleColor.brandHover, consoleColor.brandBusy]) {
      expect(ratio(consoleColor.brandForeground, fill)).toBeGreaterThanOrEqual(AA_BODY);
    }
  });

  it('the sidebar reads: links, the current item, the name and the role line', () => {
    expect(ratio(consoleColor.sidebarText, consoleColor.sidebar)).toBeGreaterThanOrEqual(AA_BODY);
    expect(ratio(consoleColor.sidebarTextStrong, consoleColor.sidebar)).toBeGreaterThanOrEqual(
      AA_BODY,
    );
    expect(
      ratio(consoleColor.sidebarTextStrong, consoleColor.sidebarActive),
    ).toBeGreaterThanOrEqual(AA_BODY);
    expect(ratio(consoleColor.sidebarMuted, consoleColor.sidebar)).toBeGreaterThanOrEqual(AA_BODY);
    expect(ratio(consoleColor.avatarForeground, consoleColor.avatar)).toBeGreaterThanOrEqual(
      AA_BODY,
    );
  });

  it('every status pair reads on its own tint and as plain text on white', () => {
    const pairs = [
      [consoleColor.amber, consoleColor.amberBg],
      [consoleColor.red, consoleColor.redBg],
      [consoleColor.green, consoleColor.greenBg],
      [consoleColor.grey, consoleColor.greyBg],
      [consoleColor.blue, consoleColor.blueBg],
    ] as const;
    for (const [text, tint] of pairs) {
      expect(ratio(text, tint)).toBeGreaterThanOrEqual(AA_BODY);
      expect(ratio(text, consoleColor.surface)).toBeGreaterThanOrEqual(AA_BODY);
    }
  });

  it('a destructive button keeps its label readable at rest and hovered', () => {
    expect(ratio(consoleColor.redForeground, consoleColor.red)).toBeGreaterThanOrEqual(AA_BODY);
    expect(ratio(consoleColor.redForeground, consoleColor.redHover)).toBeGreaterThanOrEqual(
      AA_BODY,
    );
  });

  it('a toast reads: its sentence, its tick and its undo', () => {
    expect(ratio(consoleColor.toastForeground, consoleColor.toast)).toBeGreaterThanOrEqual(AA_BODY);
    expect(ratio(consoleColor.toastAction, consoleColor.toast)).toBeGreaterThanOrEqual(AA_BODY);
    expect(ratio(consoleColor.toastIcon, consoleColor.toast)).toBeGreaterThanOrEqual(3);
  });

  it('the sign-in claim reads on the photo panel ground', () => {
    expect(ratio(consoleColor.photoText, consoleColor.photoGround)).toBeGreaterThanOrEqual(AA_BODY);
    expect(ratio(consoleColor.photoTextMuted, consoleColor.photoGround)).toBeGreaterThanOrEqual(
      AA_BODY,
    );
  });
});

describe('console focus and graphics', () => {
  it('the focus outline clears 3:1 on every ground a control sits on', () => {
    for (const ground of [consoleColor.canvas, consoleColor.surface, consoleColor.hover]) {
      expect(ratio(consoleColor.focus, ground)).toBeGreaterThanOrEqual(3);
    }
    expect(ratio(consoleColor.sidebarFocus, consoleColor.sidebar)).toBeGreaterThanOrEqual(3);
    expect(ratio(consoleColor.toastAction, consoleColor.toast)).toBeGreaterThanOrEqual(3);
  });

  it("a dialog's step bars read on white: the current one and the finished ones", () => {
    expect(ratio(consoleColor.brand, consoleColor.surface)).toBeGreaterThanOrEqual(3);
    expect(ratio(consoleColor.stepDone, consoleColor.surface)).toBeGreaterThanOrEqual(3);
  });

  /*
   * WCAG 1.4.11: the edge is the only thing that says "type here" on an empty
   * input, so it must read at 3:1 against every ground an input sits on, at
   * rest and under the pointer. Phase 1 shipped the artboards' #D8C8B6, which
   * is 1.63:1 on white: an empty search field was a faint smudge.
   */
  it("an input's edge clears 3:1 on every ground it sits on, at rest and hovered", () => {
    for (const ground of [
      consoleColor.surface,
      consoleColor.canvas,
      consoleColor.surfaceMuted,
      consoleColor.hover,
      consoleColor.brandTint,
    ]) {
      expect(ratio(consoleColor.control, ground)).toBeGreaterThanOrEqual(3);
      expect(ratio(consoleColor.controlHover, ground)).toBeGreaterThanOrEqual(3);
    }
    // Hovering darkens the edge rather than fading it.
    expect(ratio(consoleColor.controlHover, consoleColor.surface)).toBeGreaterThan(
      ratio(consoleColor.control, consoleColor.surface),
    );
  });

  it('every step of the password meter is a visible bar on white', () => {
    for (const bar of [
      consoleColor.red,
      consoleColor.amber,
      consoleColor.meterFair,
      consoleColor.green,
    ]) {
      expect(ratio(bar, consoleColor.surface)).toBeGreaterThanOrEqual(3);
    }
  });

  it('red is spent on failures only: not-ready amber and the brand are not red', () => {
    expect(consoleColor.amber).not.toBe(consoleColor.red);
    expect(consoleColor.brand).not.toBe(consoleColor.red);
    expect(consoleColor.focus).not.toBe(consoleColor.red);
  });
});

describe('console sizes', () => {
  it('keeps the approved measurements', () => {
    expect(consoleSize.sidebar).toBe(232);
    expect(consoleSize.button).toBe(40);
    expect(consoleSize.buttonSmall).toBe(32);
    expect(consoleSize.pill).toBe(24);
    expect(consoleRadius.card).toBe(12);
  });

  it('sets no text under 12px and leads with a 28px title over 14px body', () => {
    for (const size of Object.values(consoleText)) expect(size).toBeGreaterThanOrEqual(12);
    expect(consoleText.title).toBe(28);
    expect(consoleText.section).toBe(17);
    expect(consoleText.body).toBe(14);
  });
});

describe('the branch pages', () => {
  it("the app card's preview reads as the app does: name, lines, chips, both buttons", () => {
    const card = consoleColor.appCard;
    expect(ratio(consoleColor.appCardText, card)).toBeGreaterThanOrEqual(AA_BODY);
    expect(ratio(consoleColor.appCardMuted, card)).toBeGreaterThanOrEqual(AA_BODY);
    expect(ratio(consoleColor.appCardChipText, card)).toBeGreaterThanOrEqual(AA_BODY);
    expect(ratio(consoleColor.appCardOffText, card)).toBeGreaterThanOrEqual(AA_BODY);
    expect(
      ratio(consoleColor.appCardButtonText, consoleColor.appCardButton),
    ).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('the save bar reads, its outline shows, and its cream button keeps a brown label', () => {
    expect(ratio(consoleColor.savebarText, consoleColor.savebar)).toBeGreaterThanOrEqual(AA_BODY);
    expect(ratio(consoleColor.savebarFocus, consoleColor.savebar)).toBeGreaterThanOrEqual(3);
    expect(ratio(consoleColor.brand, consoleColor.savebarText)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it("a review's lit stars show on a card, hidden or not", () => {
    expect(ratio(consoleColor.star, consoleColor.surface)).toBeGreaterThanOrEqual(3);
    expect(ratio(consoleColor.star, consoleColor.reviewHidden)).toBeGreaterThanOrEqual(3);
    // The ones it did not get are lighter still: a shape, not a reading.
    expect(ratio(consoleColor.starOff, consoleColor.surface)).toBeLessThan(
      ratio(consoleColor.star, consoleColor.surface),
    );
  });
});

describe('Home and Settings', () => {
  it("the chart's bars stand out on a card: the days, today, and either one hovered", () => {
    for (const bar of [
      consoleColor.chartBar,
      consoleColor.brand,
      consoleColor.stepDone,
      consoleColor.chartBarTodayHover,
    ]) {
      expect(ratio(bar, consoleColor.surface)).toBeGreaterThanOrEqual(3);
    }
    // Today stays told apart from the days around it when hovered.
    expect(consoleColor.chartBarTodayHover).not.toBe(consoleColor.chartBar);
  });

  it("a read-only field's value still reads, and its ground is not a control's white", () => {
    expect(ratio(consoleColor.muted, consoleColor.readonlyField)).toBeGreaterThanOrEqual(AA_BODY);
    expect(consoleColor.readonlyField).not.toBe(consoleColor.surface);
  });

  it("a card's hovered edge is darker than its resting line", () => {
    expect(ratio(consoleColor.cardHoverEdge, consoleColor.surface)).toBeGreaterThan(
      ratio(consoleColor.line, consoleColor.surface),
    );
  });
});

describe("the venue console's sidebar (docs/design/venue-console)", () => {
  it('reads: the group heads, the branch switcher and a count on a link', () => {
    const side = consoleColor.sidebar;
    expect(ratio(consoleColor.sidebarGroup, side)).toBeGreaterThanOrEqual(AA_BODY);
    expect(ratio(consoleColor.sidebarFieldText, consoleColor.sidebarField)).toBeGreaterThanOrEqual(
      AA_BODY,
    );
    expect(ratio(consoleColor.sidebarMuted, consoleColor.sidebarField)).toBeGreaterThanOrEqual(
      AA_BODY,
    );
    expect(ratio(consoleColor.navBadgeForeground, consoleColor.navBadge)).toBeGreaterThanOrEqual(
      AA_BODY,
    );
  });

  it("draws the switcher's edge at 3:1 on the sidebar and on its own fill", () => {
    // WCAG 1.4.11, as for `control`: the artboards' #4E2D1B is 1.40:1.
    expect(ratio(consoleColor.sidebarFieldEdge, consoleColor.sidebar)).toBeGreaterThanOrEqual(3);
    expect(ratio(consoleColor.sidebarFieldEdge, consoleColor.sidebarField)).toBeGreaterThanOrEqual(
      3,
    );
  });

  it("draws the reports' bars and the previous period's line at 3:1 on a card", () => {
    // WCAG 1.4.11: a bar or a line is the chart's whole message. The
    // artboards' #B89B7E and #B8A28A are 2.62:1 and 2.45:1 on white.
    for (const mark of [consoleColor.reportBar, consoleColor.reportPreviousLine]) {
      expect(ratio(mark, consoleColor.surface)).toBeGreaterThanOrEqual(3);
      expect(ratio(mark, consoleColor.surfaceMuted)).toBeGreaterThanOrEqual(3);
    }
  });

  it('shows a badge on the current link as well as on a resting one', () => {
    expect(ratio(consoleColor.navBadge, consoleColor.sidebar)).toBeGreaterThanOrEqual(3);
    expect(ratio(consoleColor.navBadge, consoleColor.sidebarActive)).toBeGreaterThanOrEqual(3);
  });
});

/*
 * The floor tablet (docs/design/floor-tablet) wears the console's palette with
 * a few values of its own: the table states' tints and inks, and the top bar's
 * chips. Every table state is read from its words, so each ink and the muted
 * line under it must read on the state's own tint.
 */
describe('the floor tablet', () => {
  const states = [
    [consoleColor.floorFreeInk, consoleColor.floorFree],
    [consoleColor.floorBookedInk, consoleColor.floorBooked],
    [consoleColor.floorHeldInk, consoleColor.floorHeld],
    [consoleColor.red, consoleColor.floorOccupied],
    // The out-of-service card is painted muted throughout, label and words.
    [consoleColor.muted, consoleColor.floorOut],
  ] as const;

  /** An `rgba()` stripe laid over a hex tint: what the eye gets where they cross. */
  function over(stripe: string, tint: string): string {
    const [r, g, b, a] = stripe.match(/[\d.]+/gu)!.map(Number) as [number, number, number, number];
    const base = tint.replace('#', '');
    const channel = (i: number, top: number) =>
      Math.round(top * a + Number.parseInt(base.slice(i * 2, i * 2 + 2), 16) * (1 - a))
        .toString(16)
        .padStart(2, '0');
    return `#${channel(0, r)}${channel(1, g)}${channel(2, b)}`;
  }

  it("still reads where a striped card's stripe crosses its words", () => {
    const bookedStripe = over(consoleColor.floorBookedStripe, consoleColor.floorBooked);
    const outStripe = over(consoleColor.floorOutStripe, consoleColor.floorOut);
    for (const ground of [bookedStripe]) {
      expect(ratio(consoleColor.floorBookedInk, ground)).toBeGreaterThanOrEqual(AA_BODY);
      expect(ratio(consoleColor.muted, ground)).toBeGreaterThanOrEqual(AA_BODY);
    }
    expect(ratio(consoleColor.muted, outStripe)).toBeGreaterThanOrEqual(AA_BODY);
    // A late booking's words are amber on the same striped tint.
    expect(ratio(consoleColor.amber, consoleColor.floorBooked)).toBeGreaterThanOrEqual(AA_BODY);
    expect(ratio(consoleColor.amber, bookedStripe)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it("says every table state in an ink that reads on the state's own tint", () => {
    for (const [ink, tint] of states) {
      expect(ratio(ink, tint)).toBeGreaterThanOrEqual(AA_BODY);
      expect(ratio(consoleColor.ink, tint)).toBeGreaterThanOrEqual(AA_BODY);
      expect(ratio(consoleColor.muted, tint)).toBeGreaterThanOrEqual(AA_BODY);
    }
  });

  it('keeps the top bar readable: place, tabs, chips and the person', () => {
    for (const text of [
      consoleColor.floorBarText,
      consoleColor.sidebarMuted,
      consoleColor.sidebarText,
      consoleColor.sidebarFieldText,
      consoleColor.floorOfflineText,
      consoleColor.floorFailureText,
      consoleColor.sidebarTextStrong,
    ]) {
      expect(ratio(text, consoleColor.sidebar)).toBeGreaterThanOrEqual(AA_BODY);
    }
    // The current tab is cream with brown on it; its count is amber with cream.
    expect(ratio(consoleColor.brand, consoleColor.brandForeground)).toBeGreaterThanOrEqual(AA_BODY);
    expect(ratio(consoleColor.brandForeground, consoleColor.amber)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('keeps the table panel readable: facts, notes and its filled buttons', () => {
    // Facts on the canvas, the three notes on their own tints.
    expect(ratio(consoleColor.muted, consoleColor.canvas)).toBeGreaterThanOrEqual(AA_BODY);
    expect(ratio(consoleColor.red, consoleColor.canvas)).toBeGreaterThanOrEqual(AA_BODY);
    expect(ratio(consoleColor.amber, consoleColor.amberBg)).toBeGreaterThanOrEqual(AA_BODY);
    expect(ratio(consoleColor.red, consoleColor.redBg)).toBeGreaterThanOrEqual(AA_BODY);
    // Seat (green), free (red) and the primary (brown), with their words.
    expect(ratio(consoleColor.brandForeground, consoleColor.green)).toBeGreaterThanOrEqual(AA_BODY);
    expect(ratio(consoleColor.redForeground, consoleColor.red)).toBeGreaterThanOrEqual(AA_BODY);
    expect(ratio(consoleColor.red, consoleColor.surface)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it("keeps the PIN gate's names readable on their rows", () => {
    // A row is a light wash over the bar; a chosen row is cream with brown.
    const row = over(consoleColor.sidebarPanel, consoleColor.sidebar);
    for (const text of [
      consoleColor.sidebarFieldText,
      consoleColor.sidebarMuted,
      consoleColor.sidebarGroup,
    ]) {
      expect(ratio(text, row)).toBeGreaterThanOrEqual(AA_BODY);
    }
    expect(ratio(consoleColor.brand, consoleColor.sidebarTextStrong)).toBeGreaterThanOrEqual(
      AA_BODY,
    );
    expect(ratio(consoleColor.muted, consoleColor.sidebarTextStrong)).toBeGreaterThanOrEqual(
      AA_BODY,
    );
  });

  it("draws each connection state's dot and edge at 3:1 on the bar", () => {
    for (const mark of [
      consoleColor.floorLive,
      consoleColor.floorOffline,
      consoleColor.floorFailure,
      consoleColor.sidebarFocus,
    ]) {
      expect(ratio(mark, consoleColor.sidebar)).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps an urgent rail item readable on its tint', () => {
    expect(ratio(consoleColor.muted, consoleColor.floorUrgent)).toBeGreaterThanOrEqual(AA_BODY);
    expect(ratio(consoleColor.red, consoleColor.floorUrgent)).toBeGreaterThanOrEqual(AA_BODY);
    expect(ratio(consoleColor.amber, consoleColor.surface)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('keeps the order, tab and cash words readable where they sit', () => {
    // Change to hand back, on the cash summary; a tile's "sold out" badge; the
    // bill request's words on its blue; the button text on the green "Take cash".
    expect(ratio(consoleColor.green, consoleColor.surface)).toBeGreaterThanOrEqual(AA_BODY);
    expect(ratio(consoleColor.red, consoleColor.redBg)).toBeGreaterThanOrEqual(AA_BODY);
    expect(ratio(consoleColor.ink, consoleColor.floorHeld)).toBeGreaterThanOrEqual(AA_BODY);
    expect(ratio(consoleColor.surface, consoleColor.green)).toBeGreaterThanOrEqual(AA_BODY);
    // A sold-out tile's muted words on the canvas it greys to.
    expect(ratio(consoleColor.muted, consoleColor.canvas)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('keeps red for failures: waiting is amber, and no table state is red but occupied', () => {
    expect(consoleColor.floorBookedInk).not.toBe(consoleColor.red);
    expect(consoleColor.floorHeldInk).not.toBe(consoleColor.red);
    expect(consoleColor.floorOffline).not.toBe(consoleColor.floorFailure);
  });
});

describe('the public page (docs/design/public-page)', () => {
  it('keeps its top bar readable: the wordmark, the languages and the current one', () => {
    expect(ratio(consoleColor.sidebarTextStrong, consoleColor.sidebar)).toBeGreaterThanOrEqual(
      AA_BODY,
    );
    expect(ratio(consoleColor.floorBarText, consoleColor.sidebar)).toBeGreaterThanOrEqual(AA_BODY);
    expect(ratio(consoleColor.brand, consoleColor.brandForeground)).toBeGreaterThanOrEqual(AA_BODY);
    // The focus ring on the bar's dark ground.
    expect(ratio(consoleColor.sidebarFocus, consoleColor.sidebar)).toBeGreaterThanOrEqual(3);
  });

  it("draws a page state's icon and the open dot at 3:1, as graphics", () => {
    expect(ratio(consoleColor.publicStateIcon, consoleColor.lineSoft)).toBeGreaterThanOrEqual(3);
    expect(ratio(consoleColor.publicOpenDot, consoleColor.surface)).toBeGreaterThanOrEqual(3);
  });

  it('keeps the words on a photo readable over the brightest photo', () => {
    // The cover's "2 / 7" and the "All 7" tile sit on whatever the photo is:
    // checked over plain white, the worst it can be.
    const onWhite = (scrim: string) => {
      const [r, g, b, a] = scrim.match(/[\d.]+/gu)!.map(Number) as [number, number, number, number];
      const channel = (top: number) =>
        Math.round(top * a + 255 * (1 - a))
          .toString(16)
          .padStart(2, '0');
      return `#${channel(r)}${channel(g)}${channel(b)}`;
    };
    for (const scrim of [consoleColor.publicPhotoScrim, consoleColor.publicPhotoCount]) {
      expect(ratio(consoleColor.photoText, onWhite(scrim))).toBeGreaterThanOrEqual(AA_BODY);
    }
  });

  it("draws a review's stars at 3:1 on the card and the page", () => {
    expect(ratio(consoleColor.publicStar, consoleColor.surface)).toBeGreaterThanOrEqual(3);
    expect(ratio(consoleColor.publicStar, consoleColor.canvas)).toBeGreaterThanOrEqual(3);
  });

  it('writes the Telegram button white on its blue, hovered or not, at body contrast', () => {
    for (const fill of [consoleColor.publicTelegram, consoleColor.publicTelegramHover]) {
      expect(ratio(consoleColor.publicTelegramForeground, fill)).toBeGreaterThanOrEqual(AA_BODY);
    }
  });

  it('keeps its type at 12px and up, with inputs at 16 so iOS does not zoom', () => {
    const publicSteps = Object.entries(consoleText).filter(([name]) => name.startsWith('public'));
    expect(publicSteps.length).toBeGreaterThan(0);
    for (const [, size] of publicSteps) expect(size).toBeGreaterThanOrEqual(12);
    expect(consoleText.publicInput).toBeGreaterThanOrEqual(16);
    expect(consoleText.publicBody).toBeGreaterThanOrEqual(16);
  });

  it('makes every control at least the 44px target', () => {
    for (const size of [
      consoleSize.publicButton,
      consoleSize.publicButtonTall,
      consoleSize.publicControl,
      consoleSize.publicLang,
    ]) {
      expect(size).toBeGreaterThanOrEqual(44);
    }
  });
});

describe('the console tokens reach the stylesheet', () => {
  const css = renderTokenCss();

  it('as one custom property per colour, size, radius, step and shadow', () => {
    const kebab = (name: string) => name.replace(/([a-z0-9])([A-Z])/gu, '$1-$2').toLowerCase();
    for (const [name, value] of Object.entries(consoleColor)) {
      expect(css).toContain(`--console-${kebab(name)}: ${value};`);
    }
    for (const [name, value] of Object.entries(consoleSize)) {
      expect(css).toContain(`--console-size-${kebab(name)}: ${value}px;`);
    }
    for (const [name, value] of Object.entries(consoleRadius)) {
      expect(css).toContain(`--console-radius-${kebab(name)}: ${value}px;`);
    }
    for (const [name, value] of Object.entries(consoleText)) {
      expect(css).toContain(`--console-text-${kebab(name)}: ${value}px;`);
    }
    for (const [name, value] of Object.entries(consoleShadow)) {
      expect(css).toContain(`--console-shadow-${kebab(name)}: ${value};`);
    }
  });
});
