import { configure } from '@testing-library/dom';

/*
 * `findBy…` and `waitFor` give up after 1s by default. That is a hang
 * detector, not a speed budget: under `./verify.sh`, which runs every
 * package's suite at once, a console screen rendering through the mock's
 * managed-venue read has taken longer than 1s with nothing wrong, and a
 * different file timed out on every run while each passed alone. 10s still
 * catches a screen that never renders.
 */
configure({ asyncUtilTimeout: 10_000 });
