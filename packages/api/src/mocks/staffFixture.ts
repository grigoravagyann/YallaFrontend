import type { StaffMember } from '../contracts/staff';
import { slugify } from '../slug';

/**
 * A fixture venue's people, seeded from the same names the venue fixture uses.
 *
 * Shared by the console mock (the staff screen) and the staff auth mock (the
 * PIN screen's roster), so the person a manager sees in the console is the
 * tile a waiter taps on the tablet. The ids are stable — `${branchId}-manager`,
 * `${venueId}-owner` — because the console mock's signed-in user is named by
 * them without seeding first.
 */
export function fixtureStaffFor(
  venueId: string,
  venueName: string,
  branches: readonly { readonly id: string; readonly name: string }[],
): StaffMember[] {
  return [
    {
      id: `${venueId}-owner`,
      venueId,
      // Venue-wide: the owner works everywhere, which is what a null branch
      // means and what this screen finally makes reachable.
      branchId: null,
      fullName: 'Aram Sargsyan',
      phone: '+37477101010',
      role: 'owner',
      isActive: true,
      email: `owner@${slugify(venueName)}.am`,
      hasPasswordSignIn: true,
      isPinLocked: false,
    },
    ...branches.flatMap((branch, index): StaffMember[] => [
      {
        id: `${branch.id}-manager`,
        venueId,
        branchId: branch.id,
        fullName: ['Nare Petrosyan', 'Tigran Avetisyan', 'Lilit Grigoryan'][index % 3] ?? 'Manager',
        phone: `+3747720${index}0${index}0`,
        role: 'manager',
        isActive: true,
        email: null,
        hasPasswordSignIn: false,
        isPinLocked: false,
      },
      {
        id: `${branch.id}-waiter-1`,
        venueId,
        branchId: branch.id,
        // Unique per branch: an owner sees every branch's people in one
        // list, and two rows with the same name are two rows nobody can
        // tell apart.
        fullName: `Ani Hakobyan (${branch.name})`,
        phone: `+3747730${index}111`,
        role: 'waiter',
        isActive: true,
        email: null,
        hasPasswordSignIn: false,
        // Somebody is always locked out mid-service. It is the most
        // time-critical row on the screen, so the fixture has one.
        isPinLocked: index === 0,
      },
      {
        id: `${branch.id}-waiter-2`,
        venueId,
        branchId: branch.id,
        fullName: `Davit Manukyan (${branch.name})`,
        phone: `+3747730${index}222`,
        role: 'waiter',
        // Left in March, and the record stays so a return in June is a
        // reactivation rather than a second person with the same history.
        isActive: false,
        email: null,
        hasPasswordSignIn: false,
        isPinLocked: false,
      },
      {
        id: `${branch.id}-kitchen`,
        venueId,
        branchId: branch.id,
        fullName: `Sona Vardanyan (${branch.name})`,
        phone: `+3747740${index}333`,
        role: 'kitchen',
        isActive: true,
        email: null,
        hasPasswordSignIn: false,
        isPinLocked: false,
      },
    ]),
    {
      id: `${venueId}-manager`,
      venueId,
      // A manager created with no branch: they run every branch, the way an
      // owner does, and the console must show them every branch.
      branchId: null,
      fullName: 'Hasmik Karapetyan',
      phone: '+37477209090',
      role: 'manager',
      isActive: true,
      email: null,
      hasPasswordSignIn: false,
      isPinLocked: false,
    },
  ];
}

/**
 * The PIN every fixture person signs in with on a mock tablet.
 *
 * The console mock keeps no PIN — the same promise the server makes — so the
 * tablet mock cannot check one a manager just set. It checks this one, which
 * is enough to walk the keypad, the wrong-PIN refusal and the lockout.
 */
export const MOCK_STAFF_PIN = '1234';
