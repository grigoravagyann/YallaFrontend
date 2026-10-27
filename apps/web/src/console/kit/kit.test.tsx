// @vitest-environment jsdom
import { ApiError, parseProblem, ServerError } from '@yalla/api';
import { I18nextProvider, i18next } from '@yalla/i18n';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../ui/toast';
import { initConsoleTestI18n } from '../venue/reports/testHarness';
import {
  ChipGroup,
  DataTable,
  DateField,
  EmptyLine,
  EmptyState,
  LoadingLine,
  NoValue,
  PagedFooter,
  QueryFailure,
  TableHead,
  pickParam,
  putParam,
  useFileExport,
  usePagedRows,
  useUrlFilters,
  type PagedQuery,
  type UrlFilterCodec,
} from '.';

/**
 * The console kit on its own: what each part promises the pages that use it
 * (History, Message history, Staff → Results, the person page, the timeline,
 * Reports, Reviews), so a page test failing points at the page, not the kit.
 */

beforeAll(async () => {
  await initConsoleTestI18n();
});

afterEach(() => {
  cleanup();
});

function withI18n(children: ReactNode) {
  return <I18nextProvider i18n={i18next}>{children}</I18nextProvider>;
}

// --- The address ---------------------------------------------------------------

describe('pickParam and putParam', () => {
  it('reads a known value, and the fallback for a missing or unknown one', () => {
    const kinds = ['all', 'booking', 'takeaway'] as const;
    expect(pickParam('booking', kinds, 'all')).toBe('booking');
    expect(pickParam('bogus', kinds, 'all')).toBe('all');
    expect(pickParam(null, kinds, 'all')).toBe('all');
  });

  it('sets a value and deletes a null one', () => {
    const params = new URLSearchParams('a=1&b=2');
    putParam(params, 'a', '3');
    putParam(params, 'b', null);
    putParam(params, 'c', 'x');
    expect(params.toString()).toBe('a=3&c=x');
  });
});

interface Demo {
  readonly kind: 'all' | 'open';
  readonly q: string;
}

const demoCodec: UrlFilterCodec<Demo> = {
  read: (params) => ({
    kind: pickParam(params.get('kind'), ['all', 'open'] as const, 'all'),
    q: params.get('q') ?? '',
  }),
  write: (params, next) => {
    putParam(params, 'kind', next.kind === 'all' ? null : next.kind);
    putParam(params, 'q', next.q === '' ? null : next.q);
  },
};

function FiltersDemo() {
  const { filters, update, setParam, clear } = useUrlFilters(demoCodec);
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output aria-label="address">{location.search}</output>
      <output aria-label="kind">{filters.kind}</output>
      <button type="button" onClick={() => update({ kind: 'open' })}>
        open
      </button>
      <button type="button" onClick={() => update({ q: 'tea' }, { replace: true })}>
        search
      </button>
      <button type="button" onClick={() => setParam('row', '7', { replace: true })}>
        row
      </button>
      <button type="button" onClick={clear}>
        clear
      </button>
      <button type="button" onClick={() => void navigate(-1)}>
        back
      </button>
    </>
  );
}

function renderFilters(at: string) {
  render(
    <MemoryRouter initialEntries={['/start', at]} initialIndex={1}>
      <FiltersDemo />
    </MemoryRouter>,
  );
  return {
    address: () => screen.getByLabelText('address').textContent,
    kind: () => screen.getByLabelText('kind').textContent,
  };
}

describe('useUrlFilters', () => {
  it('reads an unknown value as its default', () => {
    const view = renderFilters('/list?kind=bogus');
    expect(view.kind()).toBe('all');
  });

  it('pushes a change Back can undo, and replaces one it cannot', async () => {
    const user = userEvent.setup();
    const view = renderFilters('/list?other=1');

    await user.click(screen.getByRole('button', { name: 'open' }));
    expect(view.address()).toBe('?other=1&kind=open');
    await user.click(screen.getByRole('button', { name: 'search' }));
    expect(view.address()).toBe('?other=1&kind=open&q=tea');

    // The search replaced the entry the kind pushed: one Back undoes both.
    await user.click(screen.getByRole('button', { name: 'back' }));
    expect(view.address()).toBe('?other=1');
  });

  it('writes a default as no parameter at all, and keeps the rest of the address', async () => {
    const user = userEvent.setup();
    const view = renderFilters('/list?kind=open&row=2');
    await user.click(screen.getByRole('button', { name: 'search' }));
    expect(view.address()).toBe('?kind=open&row=2&q=tea');
    await user.click(screen.getByRole('button', { name: 'row' }));
    expect(view.address()).toBe('?kind=open&row=7&q=tea');
  });

  it('clears every filter as a new entry', async () => {
    const user = userEvent.setup();
    const view = renderFilters('/list?kind=open&q=tea');
    await user.click(screen.getByRole('button', { name: 'clear' }));
    expect(view.address()).toBe('');
    await user.click(screen.getByRole('button', { name: 'back' }));
    expect(view.address()).toBe('?kind=open&q=tea');
  });
});

// --- A paged list ------------------------------------------------------------------

interface Row {
  readonly id: string;
}

const idOf = (row: Row) => row.id;

function pagedQuery(pages: readonly (readonly string[])[], more = false): PagedQuery<Row> {
  return {
    data: { pages: pages.map((ids) => ({ items: ids.map((id) => ({ id })) })) },
    hasNextPage: more,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(() => Promise.resolve()),
  };
}

describe('usePagedRows', () => {
  it('flattens the pages in order, each row once', () => {
    const { result } = renderHook(() =>
      usePagedRows(
        pagedQuery([
          ['a', 'b'],
          ['b', 'c'],
        ]),
        idOf,
        () => {},
      ),
    );
    expect(result.current.rows.map(idOf)).toEqual(['a', 'b', 'c']);
  });

  it('keeps the same rows while the pages do', () => {
    const query = pagedQuery([['a']]);
    const { result, rerender } = renderHook(() => usePagedRows(query, idOf, () => {}));
    const first = result.current.rows;
    rerender();
    expect(result.current.rows).toBe(first);
  });

  it('asks the next page, and hands its first row to the focus once it is there', () => {
    const focused: string[] = [];
    let query = pagedQuery([['a', 'b']], true);
    const { result, rerender } = renderHook(() =>
      usePagedRows(query, idOf, (row, index) => focused.push(`${row.id}@${index}`)),
    );
    act(() => result.current.more());
    expect(query.fetchNextPage).toHaveBeenCalledOnce();
    expect(focused).toEqual([]);

    query = pagedQuery([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    rerender();
    expect(focused).toEqual(['c@2']);
    // Once: a later redraw leaves the focus where the keyboard took it.
    rerender();
    expect(focused).toEqual(['c@2']);
  });

  it('drops the focus when the list became another before the page came', () => {
    const focused: string[] = [];
    let query = pagedQuery([['a', 'b']], true);
    const { result, rerender } = renderHook(() =>
      usePagedRows(query, idOf, (row) => focused.push(row.id)),
    );
    act(() => result.current.more());
    // A filter changed: another list, longer than the old one was.
    query = pagedQuery([['x', 'y', 'z']]);
    rerender();
    query = pagedQuery([['x', 'y', 'z'], ['w']]);
    rerender();
    expect(focused).toEqual([]);
  });
});

describe('PagedFooter', () => {
  it('says how many are shown, and offers More only while there is another page', async () => {
    const user = userEvent.setup();
    const onMore = vi.fn();
    const { rerender } = render(
      withI18n(
        <PagedFooter
          status="12 shown"
          moreLabel="More"
          hasMore
          loadingMore={false}
          onMore={onMore}
        />,
      ),
    );
    expect(screen.getByRole('status').textContent).toBe('12 shown');
    await user.click(screen.getByRole('button', { name: 'More' }));
    expect(onMore).toHaveBeenCalledOnce();

    rerender(
      withI18n(
        <PagedFooter status="12 shown" moreLabel="More" hasMore loadingMore onMore={onMore} />,
      ),
    );
    const busy = screen.getByRole('button', { name: 'Loading…' }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);

    rerender(
      withI18n(
        <PagedFooter
          status="20 shown"
          moreLabel="More"
          hasMore={false}
          loadingMore={false}
          onMore={onMore}
        />,
      ),
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});

// --- Tables -----------------------------------------------------------------------

describe('DataTable', () => {
  it('names the table by a hidden caption, with column headers and a dash a reader can say', () => {
    render(
      <DataTable caption="Activity" className="yc-act-tbl">
        <TableHead columns={[{ label: 'Who' }, { label: 'Amount', numeric: true }]} />
        <tbody>
          <tr>
            <td>Ani</td>
            <td>
              <NoValue label="Nothing measured" />
            </td>
          </tr>
        </tbody>
      </DataTable>,
    );
    const table = screen.getByRole('table', { name: 'Activity' });
    expect(table.className).toBe('yc-tbl yc-act-tbl');
    expect(table.parentElement?.className).toBe('yc-tscroll');
    expect(table.hasAttribute('aria-busy')).toBe(false);
    expect(table.querySelector('caption')?.className).toBe('yc-sr');

    const headers = screen.getAllByRole('columnheader');
    expect(headers.map((header) => header.getAttribute('scope'))).toEqual(['col', 'col']);
    expect(headers.map((header) => header.className)).toEqual(['', 'yc-num']);

    const cell = screen.getAllByRole('cell')[1]!;
    expect(cell.querySelector('[aria-hidden="true"]')?.textContent).toBe('—');
    expect(cell.querySelector('.yc-sr')?.textContent).toBe('Nothing measured');
  });

  it('says it is busy while the rows are the last filters’, and can show its caption', () => {
    render(
      <DataTable caption="Today" captionClassName="yc-res-cap" busy>
        <tbody />
      </DataTable>,
    );
    const table = screen.getByRole('table', { name: 'Today' });
    expect(table.getAttribute('aria-busy')).toBe('true');
    expect(table.querySelector('caption')?.className).toBe('yc-res-cap');
  });

  it('keeps sideways scrolling unless asked for cards, and labels no cell then', () => {
    render(
      <DataTable caption="Activity">
        <TableHead columns={[{ label: 'Who' }]} />
        <tbody>
          <tr>
            <td>Ani</td>
          </tr>
        </tbody>
      </DataTable>,
    );
    expect(screen.getByRole('table').className).toBe('yc-tbl');
    expect(screen.getByRole('cell').hasAttribute('data-label')).toBe(false);
  });

  it('as cards on a phone, labels each cell from its header and keeps the row’s actions', async () => {
    function Rows() {
      const [more, setMore] = useState(false);
      return (
        <>
          <section aria-labelledby="t">
            <h2 id="t">Venues</h2>
            <DataTable labelledBy="t" className="yc-x" phone="cards">
              <thead>
                <tr>
                  <th scope="col">
                    <button type="button">
                      Name
                      <span aria-hidden="true">↕</span>
                    </button>
                  </th>
                  <th scope="col" className="yc-num">
                    Tables
                  </th>
                  <th scope="col" data-label="Rating">
                    <svg aria-hidden="true" />
                  </th>
                  <th scope="col">
                    <span className="yc-sr">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Lumen</td>
                  <td className="yc-num">12</td>
                  <td data-label="">4.7</td>
                  <td className="yc-mcell">
                    <button type="button" aria-label="Actions for Lumen">
                      ⋮
                    </button>
                  </td>
                </tr>
                {more ? (
                  <tr>
                    <td>Ararat</td>
                    <td className="yc-num">8</td>
                    <td>4.1</td>
                    <td className="yc-mcell" />
                  </tr>
                ) : null}
                <tr>
                  <td colSpan={4}>That is all</td>
                </tr>
              </tbody>
            </DataTable>
          </section>
          <button type="button" onClick={() => setMore(true)}>
            More
          </button>
        </>
      );
    }
    render(<Rows />);

    const table = screen.getByRole('table', { name: 'Venues' });
    expect(table.className).toBe('yc-tbl yc-x yc-cards');
    expect(table.querySelector('caption')).toBeNull();

    const labels = () =>
      Array.from(table.querySelectorAll('tbody tr')).map((row) =>
        Array.from(row.children).map((cell) => cell.getAttribute('data-label')),
      );
    // The arrow is left out of "Name"; a header's own data-label names an icon;
    // a cell's own data-label wins; a cell across columns gets none.
    expect(labels()).toEqual([['Name', 'Tables', '', 'Actions'], ['']]);
    expect(screen.getByRole('button', { name: 'Actions for Lumen' })).toBeTruthy();

    // A row a child adds later is labelled too.
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await vi.waitFor(() =>
      expect(labels()).toEqual([
        ['Name', 'Tables', '', 'Actions'],
        ['Name', 'Tables', 'Rating', 'Actions'],
        [''],
      ]),
    );
  });
});

// --- Inputs -----------------------------------------------------------------------

describe('ChipGroup', () => {
  function Chips() {
    const [value, setValue] = useState<'all' | 'reported'>('all');
    return (
      <ChipGroup
        label="Show"
        className="yc-rv-chips"
        value={value}
        onChange={setValue}
        options={[
          { value: 'all', label: 'All', count: 4 },
          { value: 'reported', label: 'Reported', count: undefined },
        ]}
      />
    );
  }

  it('is a named group with the chosen chip pressed, and a count where one is known', async () => {
    const user = userEvent.setup();
    render(<Chips />);
    const group = screen.getByRole('group', { name: 'Show' });
    expect(group.className).toBe('yc-chips yc-rv-chips');
    const all = screen.getByRole('button', { name: /^All/u });
    expect(all.getAttribute('aria-pressed')).toBe('true');
    expect(all.className).toBe('yc-chip is-on');
    expect(all.querySelector('.yc-chip-n')?.textContent).toBe('4');

    await user.click(screen.getByRole('button', { name: 'Reported' }));
    expect(screen.getByRole('button', { name: 'Reported' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(all.getAttribute('aria-pressed')).toBe('false');
  });

  it('draws the small chip', () => {
    render(
      <ChipGroup
        small
        label="By person"
        value="a"
        onChange={() => {}}
        options={[{ value: 'a', label: 'Everyone' }]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Everyone' }).className).toBe(
      'yc-chip yc-chip-sm is-on',
    );
  });
});

describe('DateField', () => {
  it('is labelled, and says nothing is wrong until something is', () => {
    const onChange = vi.fn();
    render(
      <DateField label="From" value="2026-10-01" max="2026-10-25" required onChange={onChange} />,
    );
    const box = screen.getByLabelText('From') as HTMLInputElement;
    expect(box.type).toBe('date');
    expect(box.required).toBe(true);
    expect(box.max).toBe('2026-10-25');
    expect(box.hasAttribute('aria-invalid')).toBe(false);
    expect(box.hasAttribute('aria-describedby')).toBe(false);
  });

  it('marks its own error and points at it', () => {
    render(<DateField label="To" value="" error="Choose a date." onChange={() => {}} />);
    const box = screen.getByLabelText('To');
    expect(box.getAttribute('aria-invalid')).toBe('true');
    const said = document.getElementById(box.getAttribute('aria-describedby')!);
    expect(said?.textContent).toBe('Choose a date.');
    expect(said?.className).toBe('yc-err');
  });

  it('points at an error the page says once for the range', () => {
    render(
      <>
        <DateField label="From" value="" invalid describedBy="range-err" onChange={() => {}} />
        <span id="range-err">The range runs backwards.</span>
      </>,
    );
    const box = screen.getByLabelText('From');
    expect(box.getAttribute('aria-invalid')).toBe('true');
    expect(box.getAttribute('aria-describedby')).toBe('range-err');
  });

  it('hands up the date typed', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DateField label="Day" value="" onChange={onChange} />);
    await user.type(screen.getByLabelText('Day'), '2026-10-24');
    expect(onChange).toHaveBeenLastCalledWith('2026-10-24');
  });
});

// --- States -----------------------------------------------------------------------

describe('the states', () => {
  it('says loading as a status, on its own or in a card', () => {
    const { rerender } = render(withI18n(<LoadingLine />));
    expect(screen.getByRole('status').className).toBe('yc-empty-line');
    expect(screen.getByRole('status').textContent).toBe('Loading…');
    rerender(withI18n(<LoadingLine card />));
    expect(screen.getByRole('status').className).toBe('yc-card yc-empty-line');
  });

  it('says a quiet line', () => {
    render(<EmptyLine card>Pick a branch.</EmptyLine>);
    expect(screen.getByText('Pick a branch.').className).toBe('yc-card yc-empty-line');
  });

  it('says a failure with a way to try again', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn(() => Promise.resolve());
    render(
      withI18n(
        <QueryFailure
          query={{ error: new ServerError({ status: 500, url: '/x' }), refetch }}
          frame="card"
        />,
      ),
    );
    expect(screen.getByRole('alert').parentElement?.className).toBe('yc-card yc-ov-pad');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('says nothing is here under a heading at the level asked, with the way out', () => {
    render(
      <EmptyState
        title="No conversations"
        level={2}
        card
        action={<button type="button">Clear</button>}
      >
        Nothing matches.
      </EmptyState>,
    );
    const heading = screen.getByRole('heading', { level: 2, name: 'No conversations' });
    expect(heading.className).toBe('yc-h2');
    expect(heading.parentElement?.className).toBe('yc-card yc-empty');
    expect(screen.getByText('Nothing matches.').tagName).toBe('P');
    expect(screen.getByRole('button', { name: 'Clear' })).toBeTruthy();
  });
});

// --- A file to download -------------------------------------------------------------

describe('useFileExport', () => {
  let saved: string[];

  beforeEach(() => {
    saved = [];
    URL.createObjectURL = vi.fn(() => 'blob:csv');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push(this.download);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function Export({ make }: { readonly make: () => Promise<{ fileName: string; bytes: Blob }> }) {
    const csv = useFileExport();
    return (
      <button type="button" onClick={() => void csv.run(make, 'The file is ready')}>
        {csv.busy ? 'Preparing' : 'CSV'}
      </button>
    );
  }

  function renderExport(make: () => Promise<{ fileName: string; bytes: Blob }>) {
    render(
      withI18n(
        <ToastProvider>
          <Export make={make} />
        </ToastProvider>,
      ),
    );
  }

  it('saves the file under its name, and says so', async () => {
    const user = userEvent.setup();
    renderExport(() =>
      Promise.resolve({ fileName: 'history-2026-10-24.csv', bytes: new Blob(['a']) }),
    );
    await user.click(screen.getByRole('button', { name: 'CSV' }));
    expect(await screen.findByText('The file is ready')).toBeTruthy();
    expect(saved).toEqual(['history-2026-10-24.csv']);
    expect(screen.getByRole('button', { name: 'CSV' })).toBeTruthy();
  });

  it('is busy while the file comes, and a second press asks nothing more', async () => {
    const user = userEvent.setup();
    let finish: (file: { fileName: string; bytes: Blob }) => void = () => {};
    const make = vi.fn(
      () =>
        new Promise<{ fileName: string; bytes: Blob }>((resolve) => {
          finish = resolve;
        }),
    );
    renderExport(make);
    await user.click(screen.getByRole('button', { name: 'CSV' }));
    await user.click(screen.getByRole('button', { name: 'Preparing' }));
    expect(make).toHaveBeenCalledOnce();
    await act(async () => finish({ fileName: 'x.csv', bytes: new Blob(['a']) }));
    expect(saved).toEqual(['x.csv']);
  });

  it('says a file too large with the server’s limit, and anything else as try again', async () => {
    const user = userEvent.setup();
    const tooLarge = new ApiError('Export too large', {
      status: 422,
      url: '/x',
      problem: parseProblem({
        status: 422,
        code: 'activity-export-too-large',
        context: { maxRows: 20_000 },
      }),
    });
    renderExport(() => Promise.reject(tooLarge));
    await user.click(screen.getByRole('button', { name: 'CSV' }));
    expect(await screen.findByText(/20,000/u)).toBeTruthy();
    expect(saved).toEqual([]);
    cleanup();

    renderExport(() => Promise.reject(new Error('offline')));
    await user.click(screen.getByRole('button', { name: 'CSV' }));
    expect(await screen.findByText('The file could not be made. Try again.')).toBeTruthy();
  });
});
