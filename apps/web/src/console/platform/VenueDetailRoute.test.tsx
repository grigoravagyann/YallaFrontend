// @vitest-environment jsdom
import { createConsoleMockGateway, type ConsoleGateway } from '@yalla/api';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { VenueDetailRoute } from './VenueDetailRoute';
import { createConsoleHarness, initConsoleTestI18n } from '../venue/reports/testHarness';

/**
 * The venue bootstrap path.
 *
 * A new venue has nobody in it, an owner cannot create another owner, and the
 * only actor above an owner is the platform admin — so this page is where the
 * first owner is made and the only place an owner's sign-in can be issued or
 * repaired. Before this, a hire here produced an owner nobody could ever sign
 * in as, and nobody could fix it afterwards.
 */

beforeAll(async () => {
  await initConsoleTestI18n();
});

afterEach(cleanup);

function renderVenue(gateway?: ConsoleGateway) {
  const harness = createConsoleHarness({
    gateway: gateway ?? createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin' }),
  });
  render(
    harness.wrap(
      <Routes>
        <Route path="/platform/venues/:venueId" element={<VenueDetailRoute />} />
      </Routes>,
      '/platform/venues/v-lumen',
    ),
  );
  return harness;
}

/** Waits for the staff card's list, which arrives after the venue itself. */
async function waitForStaff() {
  await waitFor(() => expect(screen.getByText('Aram Sargsyan')).toBeTruthy(), { timeout: 5000 });
}

const rowOf = (name: string) => screen.getByText(name).closest('li')!;

/** The 409 the server answers a taken address with, as the gateway raises it. */
async function addressTaken() {
  const { ConcurrencyConflictError } = await import('@yalla/api');
  return new ConcurrencyConflictError({
    url: 'mock://yalla',
    problem: {
      type: 'about:blank',
      title: 'Conflicting state',
      status: 409,
      detail: 'That email address already has an account.',
      code: 'conflicting-state',
      traceId: 'mock',
    },
  });
}

/** Holds the issue call open until `release`, as the venue staff screen's tests do. */
function withDeferredIssue(gateway: ConsoleGateway) {
  const real = gateway.issueStaffSignIn.bind(gateway);
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const issue = vi.spyOn(gateway, 'issueStaffSignIn').mockImplementation(async (input) => {
    await gate;
    return real(input);
  });
  return { issue, release: () => release() };
}

async function hireOwner(user: ReturnType<typeof userEvent.setup>, email: string) {
  await user.click(screen.getByRole('button', { name: /add someone/i }));
  const form = screen.getByRole('form');
  await user.type(within(form).getByLabelText(/full name/i), 'Hasmik Sargsyan');
  await user.type(within(form).getByLabelText(/phone/i), '+37477999999');
  await user.type(within(form).getByLabelText(/^email$/i), email);
  await user.type(within(form).getByLabelText(/pin/i), '7315');
  await user.click(within(form).getByRole('button', { name: /^add$/i }));
}

describe('hiring the first owner', () => {
  it('creates the owner and issues their sign-in in one go, showing PIN and link once', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin' });
    const create = vi.spyOn(gateway, 'createStaff');
    const issue = vi.spyOn(gateway, 'issueStaffSignIn');
    const user = userEvent.setup();
    renderVenue(gateway);
    await waitForStaff();

    await user.click(screen.getByRole('button', { name: /add someone/i }));
    const form = screen.getByRole('form');
    // Owner is the platform admin's default: the one hire nobody else can make.
    expect((within(form).getByLabelText(/^role$/i) as HTMLSelectElement).value).toBe('owner');

    await user.type(within(form).getByLabelText(/full name/i), 'Hasmik Sargsyan');
    await user.type(within(form).getByLabelText(/phone/i), '+37477999999');
    await user.type(within(form).getByLabelText(/^email$/i), 'hasmik@lumen.am');
    await user.type(within(form).getByLabelText(/pin/i), '7315');
    await user.click(within(form).getByRole('button', { name: /^add$/i }));

    // Two calls, one address, and no email anywhere near the create call: the
    // server refuses an email without a password there.
    await waitFor(() => expect(issue).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0]?.[0].staff).not.toHaveProperty('email');
    expect(create.mock.calls[0]?.[0].staff.role).toBe('owner');
    const created = await create.mock.results[0]!.value;
    expect(issue.mock.calls[0]?.[0]).toEqual({
      venueId: 'v-lumen',
      staffMemberId: created.id,
      email: 'hasmik@lumen.am',
    });

    const dialog = await screen.findByRole('dialog');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(within(dialog).getByText('7315')).toBeTruthy();
    const token = dialog.textContent?.match(/#token=([a-z0-9]{32})/u)?.[1];
    expect(token).toBeTruthy();

    await user.click(within(dialog).getByRole('button', { name: /^done$/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.body.textContent).not.toContain('7315');
    expect(document.body.textContent).not.toContain(token!);

    // The new owner is listed as awaiting their password, address shown.
    await waitFor(() => {
      const row = rowOf('Hasmik Sargsyan');
      expect(within(row).getByText(/awaiting password/i)).toBeTruthy();
      expect(within(row).getByText('hasmik@lumen.am')).toBeTruthy();
    });
  });

  it('still shows the PIN when the sign-in was refused, and leaves the row repairable', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin' });
    const { ConcurrencyConflictError } = await import('@yalla/api');
    vi.spyOn(gateway, 'issueStaffSignIn').mockRejectedValueOnce(
      new ConcurrencyConflictError({
        url: 'mock://yalla',
        problem: {
          type: 'about:blank',
          title: 'Conflicting state',
          status: 409,
          detail: 'That email address already has an account.',
          code: 'conflicting-state',
          traceId: 'mock',
        },
      }),
    );
    const user = userEvent.setup();
    renderVenue(gateway);
    await waitForStaff();

    await user.click(screen.getByRole('button', { name: /add someone/i }));
    const form = screen.getByRole('form');
    await user.type(within(form).getByLabelText(/full name/i), 'Hasmik Sargsyan');
    await user.type(within(form).getByLabelText(/phone/i), '+37477999999');
    await user.type(within(form).getByLabelText(/^email$/i), 'owner@lumen-coffee.am');
    await user.type(within(form).getByLabelText(/pin/i), '7315');
    await user.click(within(form).getByRole('button', { name: /^add$/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('7315')).toBeTruthy();
    expect(within(dialog).getByRole('alert').textContent).toContain('already has an account');
    await user.click(within(dialog).getByRole('button', { name: /^done$/i }));

    await waitFor(() => {
      const row = rowOf('Hasmik Sargsyan');
      expect(within(row).getByText(/no sign-in/i)).toBeTruthy();
      expect(within(row).getByRole('button', { name: /issue sign-in/i })).toBeTruthy();
    });
  });

  it("carries the refusal to the row's prompt on try again, with the cursor in the field", async () => {
    /*
     * The dialog's alert unmounts with the dialog. The sentence the person is
     * meant to act on has to be under the field they are about to correct,
     * exactly as a failed send from the row leaves it.
     */
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin' });
    vi.spyOn(gateway, 'issueStaffSignIn').mockRejectedValueOnce(await addressTaken());
    const user = userEvent.setup();
    renderVenue(gateway);
    await waitForStaff();

    await hireOwner(user, 'owner@lumen-coffee.am');
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    const prompt = screen.getByRole('form', { name: /sign-in for hasmik/i });
    const field = within(prompt).getByLabelText(/^email$/i) as HTMLInputElement;
    expect(field.value).toBe('owner@lumen-coffee.am');
    expect(within(prompt).getByRole('alert').textContent).toContain('already has an account');
    expect(document.activeElement).toBe(field);
  });

  it('keeps the form saving until the dialog is ready', async () => {
    // Same rule as the venue staff screen: no moment with the owner made and
    // nothing on screen about it.
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin' });
    const { issue, release } = withDeferredIssue(gateway);
    const user = userEvent.setup();
    renderVenue(gateway);
    await waitForStaff();

    await hireOwner(user, 'hasmik@lumen.am');
    await waitFor(() => expect(issue).toHaveBeenCalledTimes(1));

    const form = screen.getByRole('form');
    const submit = within(form).getByRole('button', { name: /saving/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();

    release();
    await screen.findByRole('dialog');
    expect(screen.queryByRole('form')).toBeNull();
  });
});

describe('the branch rows', () => {
  it('link each branch to its public page, floor plan and reviews', async () => {
    renderVenue();
    const branches = await screen.findByRole('heading', { name: /^branches$/i });
    const card = branches.closest('.card') as HTMLElement;
    const publicLinks = within(card).getAllByRole('link', { name: /public page/i });
    expect(publicLinks.length).toBeGreaterThan(0);
    const href = publicLinks[0]!.getAttribute('href')!;
    expect(href).toMatch(/^\/platform\/venues\/v-lumen\/branches\/[^/]+\/public$/u);
    const branchId = href.split('/')[5];
    expect(
      within(card)
        .getAllByRole('link', { name: /floor plan/i })
        .map((link) => link.getAttribute('href')),
    ).toContain(`/platform/venues/v-lumen/branches/${branchId}/floorplan`);
    expect(
      within(card)
        .getAllByRole('link', { name: /reviews/i })
        .map((link) => link.getAttribute('href')),
    ).toContain(`/platform/venues/v-lumen/branches/${branchId}/reviews`);
  });
});

describe('the staff card', () => {
  it('shows every sign-in state and offers the platform admin the action on each admin row', async () => {
    renderVenue();
    await waitForStaff();

    // The seeded owner signs in already: no badge, but a new link can be sent.
    const owner = rowOf('Aram Sargsyan');
    expect(within(owner).queryByText(/no sign-in/i)).toBeNull();
    expect(within(owner).queryByText(/awaiting password/i)).toBeNull();
    expect(within(owner).getByText('owner@lumen-coffee.am')).toBeTruthy();
    expect(within(owner).getByRole('button', { name: /send new link/i })).toBeTruthy();

    // Every seeded manager has no address.
    const manager = rowOf('Nare Petrosyan');
    expect(within(manager).getByText(/no sign-in/i)).toBeTruthy();
    expect(within(manager).getByRole('button', { name: /issue sign-in/i })).toBeTruthy();

    // A waiter never signs in here: no badge, no action.
    const waiter = rowOf('Ani Hakobyan (Northern Avenue)');
    expect(within(waiter).queryByText(/sign-in/i)).toBeNull();
    expect(within(waiter).queryByRole('button')).toBeNull();
  });

  it('shows no sign-in warning on a deactivated row, where no action is offered', async () => {
    // "Deactivated" explains the state; a warning nobody can act on is noise.
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin' });
    const list = gateway.listStaff.bind(gateway);
    vi.spyOn(gateway, 'listStaff').mockImplementation(async (venueId) =>
      (await list(venueId)).map((member) =>
        member.id === 'b-lumen-north-manager' ? { ...member, isActive: false } : member,
      ),
    );
    renderVenue(gateway);
    await waitForStaff();

    const manager = rowOf('Nare Petrosyan');
    expect(within(manager).getByText(/deactivated/i)).toBeTruthy();
    expect(within(manager).queryByRole('button')).toBeNull();
    expect(within(manager).queryByText(/no sign-in/i)).toBeNull();
  });
});

describe('repairing an existing owner', () => {
  it('re-points their address after a second click and hands over one link', async () => {
    /*
     * The only path that reaches an owner: an owner cannot act on a peer. The
     * owner already signs in, so a different address is read back before it
     * is sent — it changes the moment the server answers — and their
     * password keeps working until the link is used.
     */
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin' });
    const issue = vi.spyOn(gateway, 'issueStaffSignIn');
    const user = userEvent.setup();
    renderVenue(gateway);
    await waitForStaff();

    await user.click(
      within(rowOf('Aram Sargsyan')).getByRole('button', { name: /send new link/i }),
    );
    const prompt = screen.getByRole('form', { name: /sign-in for aram/i });
    const field = within(prompt).getByLabelText(/^email$/i) as HTMLInputElement;
    expect(field.value).toBe('owner@lumen-coffee.am');
    // He signs in already, so what is at stake is the password, said here.
    expect(within(prompt).getByText(/current password keeps working/i)).toBeTruthy();
    expect(within(prompt).queryByText(/previous link stops working/i)).toBeNull();

    await user.clear(field);
    await user.type(field, 'aram@lumen.am');
    await user.click(within(prompt).getByRole('button', { name: /send link/i }));
    expect(
      within(prompt).getByText(/aram@lumen\.am instead of owner@lumen-coffee\.am/i),
    ).toBeTruthy();
    expect(issue).not.toHaveBeenCalled();

    await user.click(within(prompt).getByRole('button', { name: /yes, send it/i }));
    await waitFor(() => expect(issue).toHaveBeenCalledTimes(1));
    expect(issue.mock.calls[0]?.[0]).toEqual({
      venueId: 'v-lumen',
      staffMemberId: 'v-lumen-owner',
      email: 'aram@lumen.am',
    });

    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toMatch(/current password keeps working/i);
    expect(dialog.textContent).toMatch(/good until/i);
    await user.click(within(dialog).getByRole('button', { name: /^done$/i }));

    // Address changed, password untouched: no badge, new address on the row.
    await waitFor(() => {
      const row = rowOf('Aram Sargsyan');
      expect(within(row).getByText('aram@lumen.am')).toBeTruthy();
      expect(within(row).queryByText(/awaiting password/i)).toBeNull();
    });
  });
});

describe('hiring an owner who will be given their sign-in later', () => {
  it('creates them with a PIN alone when the address is left empty, and shows the PIN once', async () => {
    /*
     * The address was required, so an owner who never touches a tablet still
     * could not be added without an email on hand — and "Issue sign-in", the
     * row action that exists for exactly this, was unreachable for anybody
     * new. The server needs a PIN on every create; it does not need an email.
     */
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin' });
    const create = vi.spyOn(gateway, 'createStaff');
    const issue = vi.spyOn(gateway, 'issueStaffSignIn');
    const user = userEvent.setup();
    renderVenue(gateway);
    await waitForStaff();

    await user.click(screen.getByRole('button', { name: /add someone/i }));
    const form = screen.getByRole('form');
    await user.type(within(form).getByLabelText(/full name/i), 'Hasmik Sargsyan');
    await user.type(within(form).getByLabelText(/phone/i), '+37477999999');
    await user.type(within(form).getByLabelText(/pin/i), '7315');
    await user.click(within(form).getByRole('button', { name: /^add$/i }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0]![0].staff).not.toHaveProperty('email');
    expect(issue).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('7315')).toBeTruthy();
    expect(within(dialog).queryByText(/sign-in link/i)).toBeNull();

    // The row offers the sign-in from here on, as it does for any owner without one.
    await user.click(within(dialog).getByRole('button'));
    const row = await waitFor(() => rowOf('Hasmik Sargsyan'));
    expect(within(row).getByText(/no sign-in/i)).toBeTruthy();
    expect(within(row).getByRole('button', { name: /issue sign-in/i })).toBeTruthy();
  });
});

describe('editing the venue and adding a branch', () => {
  /*
   * The page offered tier, staff, suspend and delete, and nothing for the two
   * things the backend has served all along: PATCH the venue's name, web
   * address and type, and POST a second branch. A venue with a typo in its
   * name, or a second site, meant a hand call to the API.
   */
  it('saves a new name through "Edit venue" and shows it', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin' });
    const update = vi.spyOn(gateway, 'updateVenue');
    const user = userEvent.setup();
    renderVenue(gateway);
    await waitForStaff();

    await user.click(screen.getByRole('button', { name: /edit venue/i }));
    const form = screen.getByRole('form', { name: /edit venue/i });
    const name = within(form).getByLabelText(/^venue name$/i) as HTMLInputElement;
    expect(name.value).toBe('Lumen Coffee');
    await user.clear(name);
    await user.type(name, 'Lumen Coffee House');
    await user.selectOptions(within(form).getByLabelText(/type/i), 'restaurant');
    await user.click(within(form).getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0]![0]).toMatchObject({
      venueId: 'v-lumen',
      name: 'Lumen Coffee House',
      type: 'restaurant',
    });
    expect(await screen.findByRole('heading', { name: 'Lumen Coffee House' })).toBeTruthy();
    expect(screen.queryByRole('form', { name: /edit venue/i })).toBeNull();
  });

  it('names a web address already in use and keeps the form open', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin' });
    const user = userEvent.setup();
    renderVenue(gateway);
    await waitForStaff();

    await user.click(screen.getByRole('button', { name: /edit venue/i }));
    const form = screen.getByRole('form', { name: /edit venue/i });
    const slug = within(form).getByLabelText(/web address/i);
    await user.clear(slug);
    await user.type(slug, 'green-bean');
    await user.click(within(form).getByRole('button', { name: /^save$/i }));

    expect(await within(form).findByText(/"green-bean" is already in use/i)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Lumen Coffee' })).toBeTruthy();
  });

  it('adds a branch with its own address, pin and web address', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin' });
    const add = vi.spyOn(gateway, 'addBranch');
    const user = userEvent.setup();
    renderVenue(gateway);
    await waitForStaff();

    await user.click(screen.getByRole('button', { name: /add a branch/i }));
    const form = screen.getByRole('form', { name: /add a branch/i });
    await user.type(within(form).getByLabelText(/branch name/i), 'Komitas');
    await user.type(within(form).getByLabelText(/street address/i), '5 Komitas Avenue, Yerevan');
    await user.type(within(form).getByLabelText(/latitude/i), '40.2');
    await user.type(within(form).getByLabelText(/longitude/i), '44.5');
    await user.click(within(form).getByRole('button', { name: /^add$/i }));

    await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    expect(add.mock.calls[0]![0]).toMatchObject({
      venueId: 'v-lumen',
      name: 'Komitas',
      slug: 'komitas',
      address: '5 Komitas Avenue, Yerevan',
      latitude: 40.2,
      longitude: 44.5,
      timeZoneId: 'Asia/Yerevan',
    });
    expect(await screen.findByText('Komitas')).toBeTruthy();
    expect(screen.queryByRole('form', { name: /add a branch/i })).toBeNull();
  });
});

/**
 * The general manager and the branch manager on the platform's form: the
 * same binding the venue's own dialogs follow, and the server's refusals
 * under the field they are about.
 */
describe('the roles a platform admin hires', () => {
  const PIN_TAKEN = 'Somebody who signs in on this tablet already uses that PIN. Choose another.';

  it('offers a general manager with no branch, and a branch manager with no "All branches"', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin' });
    const create = vi.spyOn(gateway, 'createStaff');
    const user = userEvent.setup();
    renderVenue(gateway);
    await waitForStaff();

    await user.click(screen.getByRole('button', { name: /add someone/i }));
    const form = screen.getByRole('form');
    const role = within(form).getByLabelText(/^role$/i) as HTMLSelectElement;
    expect([...role.options].map((option) => option.textContent)).toEqual([
      'Owner',
      'General manager',
      'Branch manager',
      'Waiter',
      'Kitchen',
    ]);

    await user.selectOptions(role, 'manager');
    const branch = within(form).getByLabelText(/which branch/i) as HTMLSelectElement;
    expect([...branch.options].map((option) => option.value)).not.toContain('__all__');

    await user.selectOptions(role, 'generalManager');
    expect(within(form).queryByLabelText(/which branch/i)).toBeNull();
    expect(within(form).getByText(/every branch of the venue/i)).toBeTruthy();

    await user.type(within(form).getByLabelText(/full name/i), 'Hasmik Sargsyan');
    await user.type(within(form).getByLabelText(/phone/i), '+37477999999');
    await user.type(within(form).getByLabelText(/pin/i), '7315');
    await user.click(within(form).getByRole('button', { name: /^add$/i }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0]?.[0].staff).toMatchObject({
      role: 'generalManager',
      branchId: null,
    });
  });

  it('puts a taken PIN under the PIN field', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin' });
    const user = userEvent.setup();
    renderVenue(gateway);
    await waitForStaff();

    for (const name of ['Hasmik Sargsyan', 'Lilit Sargsyan']) {
      await user.click(screen.getByRole('button', { name: /add someone/i }));
      const form = screen.getByRole('form');
      await user.selectOptions(within(form).getByLabelText(/^role$/i), 'waiter');
      await user.type(within(form).getByLabelText(/full name/i), name);
      await user.type(within(form).getByLabelText(/phone/i), '+37477999999');
      await user.type(within(form).getByLabelText(/pin/i), '7315');
      await user.click(within(form).getByRole('button', { name: /^add$/i }));
      if (name === 'Hasmik Sargsyan') {
        const dialog = await screen.findByRole('dialog');
        await user.click(within(dialog).getByRole('button'));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      }
    }

    const form = screen.getByRole('form');
    const alert = await within(form).findByRole('alert');
    expect(alert.textContent).toBe(PIN_TAKEN);
    expect(within(form).getByLabelText(/pin/i).getAttribute('aria-describedby')).toBe(alert.id);
  });
});
