import { createConsoleMockGateway } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import {
  allCsv,
  csvBlob,
  csvCell,
  csvFileName,
  menuCsv,
  occupancyCsv,
  reservationsCsv,
  revenueCsv,
  summaryCsv,
} from './csv';

/**
 * The per-section CSV, made in the browser from the JSON on screen (VC5 wire
 * §3). What an owner forwards to an accountant: it has to open in Excel with
 * the Armenian intact, never run a formula a waiter typed, and carry numbers a
 * spreadsheet reads in any locale.
 */

const CRLF = String.fromCharCode(13, 10);
const query = { branchId: 'b-lumen-north', from: '2026-08-31', to: '2026-09-06' };

describe('a CSV cell', () => {
  it('quotes a comma, a quote and a line break, doubling inner quotes', () => {
    expect(csvCell('Steak, rare')).toBe('"Steak, rare"');
    expect(csvCell('the "special"')).toBe('"the ""special"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell('Խորոված')).toBe('Խորոված');
  });

  it('never lets typed text start a formula', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+374 91')).toBe("'+374 91");
    expect(csvCell('-wrong table')).toBe("'-wrong table");
    expect(csvCell('@kitchen')).toBe("'@kitchen");
    // A number is a number, negative or not.
    expect(csvCell(-1200)).toBe('-1200');
  });

  it('writes numbers plainly: no grouping, a dot, a fraction as a decimal, empty for none', () => {
    expect(csvCell(8_960_000)).toBe('8960000');
    expect(csvCell(0.61)).toBe('0.61');
    expect(csvCell(3.14159)).toBe('3.1416');
    expect(csvCell(null)).toBe('');
  });
});

describe('the section files', () => {
  const gateway = createConsoleMockGateway({ latencyMs: 0 });

  it('pairs each day with the one before it, in whole dram', async () => {
    const report = await gateway.getRevenueReport(query);
    const lines = revenueCsv(report).split('\r\n');
    expect(lines[0]).toBe(
      'localDate,revenueAmd,tabs,previousLocalDate,previousRevenueAmd,previousTabs,hallAmd,takeawayAmd,takeawayOrders',
    );
    const first = report.byDay[0]!;
    const before = report.previousByDay![0]!;
    expect(lines[1]).toBe(
      `${first.localDate},${first.revenueAmd},${first.tabs},${before.localDate},${before.revenueAmd},${before.tabs},` +
        `${first.revenueAmd - first.takeawayAmd},${first.takeawayAmd},${first.takeawayOrders}`,
    );
    expect(revenueCsv(report).endsWith('\r\n')).toBe(true);
  });

  it('says the hall and takeaway apart: a source column, and their measures', async () => {
    const report = await gateway.getRevenueReport(query);
    const text = revenueCsv(report);
    expect(report.takeawayAmd.value).toBeGreaterThan(0);
    expect(report.totalAmd.value).toBe(report.hallAmd.value + report.takeawayAmd.value);
    expect(text).toContain(
      `${CRLF}source,revenueAmd,orders,previousRevenueAmd,previousOrders${CRLF}` +
        `hall,${report.hallAmd.value},${report.tabs.value},${report.hallAmd.previous},${report.tabs.previous}${CRLF}` +
        `takeaway,${report.takeawayAmd.value},${report.takeawayOrders.value},` +
        `${report.takeawayAmd.previous},${report.takeawayOrders.previous}${CRLF}`,
    );
    for (const name of [
      'cardAmd',
      'hallAmd',
      'takeawayAmd',
      'takeawayOrders',
      'takeawayNotCollected',
    ]) {
      expect(text).toMatch(new RegExp(`\\r\\n${name},\\d+,`, 'u'));
    }
  });

  it('leaves every previous value empty when the previous total is 0, never writing 0', async () => {
    // The mock venue's first week: the server sums the week before it to 0.
    const first = { branchId: 'b-lumen-north', from: '2026-08-20', to: '2026-08-26' };
    const occupancy = await gateway.getOccupancyReport(first);
    const revenue = await gateway.getRevenueReport(first);
    expect(revenue.totalAmd.previous).toBe(0);

    const summary = summaryCsv(occupancy, revenue).split(CRLF);
    expect(summary[0]).toBe('measure,value,previous,changeFraction');
    expect(summary[1]).toBe(`guests,${occupancy.seatsFilled.value},,`);

    const days = revenueCsv(revenue).split(CRLF);
    const day = revenue.byDay[0]!;
    expect(days[1]).toBe(
      `${day.localDate},${day.revenueAmd},${day.tabs},,,,` +
        `${day.revenueAmd - day.takeawayAmd},${day.takeawayAmd},${day.takeawayOrders}`,
    );
    expect(revenueCsv(revenue)).toContain(`${CRLF}totalAmd,${revenue.totalAmd.value},,${CRLF}`);
  });

  it('writes the bookings a guest block cancelled as their own measure, when counted', async () => {
    const report = await gateway.getReservationReport(query);
    const counted = { ...report, systemCancelled: { value: 2, previous: 1, changeFraction: 1 } };
    expect(reservationsCsv(counted)).toMatch(/\r\nsystemCancelled,2,[^\r]*\r\n/u);
    expect(reservationsCsv({ ...report, systemCancelled: null })).not.toContain('systemCancelled');
  });

  it('writes the open-ended bucket with no top', async () => {
    const reservations = reservationsCsv(await gateway.getReservationReport(query));
    expect(reservations).toContain('fromHours,toHours,bookings');
    expect(reservations).toMatch(/\r\n168,,\d+\r\n$/u);
    const occupancy = occupancyCsv(await gateway.getOccupancyReport(query));
    expect(occupancy).toContain('fromMinutes,toMinutes,sittings');
    expect(occupancy).toMatch(/\r\n240,,\d+\r\n$/u);
  });

  it('lists the menu rankings and the voids under their own headers', async () => {
    const report = await gateway.getMenuReport(query);
    const text = menuCsv(report);
    expect(text).toContain('list,rank,menuItemId,name,category,quantity,revenueAmd');
    expect(text).toContain('\r\n\r\nmenuItemId,name,reason,count\r\n');
    expect(text).toContain(`topByCount,1,${report.topByCount[0]!.menuItemId},`);
  });
});

describe('everything in one file', () => {
  it('puts each section under its title, a blank line between, with one BOM', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const revenue = revenueCsv(await gateway.getRevenueReport(query));
    const menu = menuCsv(await gateway.getMenuReport(query));
    const text = allCsv([
      ['revenue', revenue],
      ['menu', menu],
    ]);
    expect(text.startsWith(`revenue${CRLF}localDate,`)).toBe(true);
    expect(text).toContain(`${CRLF}${CRLF}menu${CRLF}list,rank,`);
    expect(text.endsWith(`${CRLF}`)).toBe(true);
    expect(text.endsWith(`${CRLF}${CRLF}`)).toBe(false);
    expect(csvFileName('report', query)).toBe('report-2026-08-31-to-2026-09-06.csv');
  });
});

describe('the file', () => {
  it('starts with the BOM Excel needs for Armenian', async () => {
    const bytes = new Uint8Array(await csvBlob('a,b\r\n').arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it('is named by section and range, and says when it covers every branch', () => {
    expect(csvFileName('revenue', query)).toBe('revenue-2026-08-31-to-2026-09-06.csv');
    expect(csvFileName('menu', { ...query, rollUpVenue: true })).toBe(
      'menu-2026-08-31-to-2026-09-06-all-branches.csv',
    );
  });
});
