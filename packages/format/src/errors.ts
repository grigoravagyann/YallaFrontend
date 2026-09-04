/**
 * Thrown when an amount that should be whole dram is not.
 *
 * Armenian dram has no subunit. A fractional amount reaching a formatter means
 * someone did arithmetic on the client, which is exactly the bug this package
 * exists to make loud rather than silent.
 */
export class FractionalDramError extends Error {
  readonly amount: number;

  constructor(amount: number) {
    super(
      `formatDram received ${amount}, which is not a whole number of dram. ` +
        'Dram has no subunit and the client must never compute money: ' +
        'display the integer the backend sent.',
    );
    this.name = 'FractionalDramError';
    this.amount = amount;
  }
}
