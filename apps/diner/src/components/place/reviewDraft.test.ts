import { describe, expect, it } from 'vitest';
import { reviewForm } from './reviewDraft';

describe('the review form', () => {
  const saved = { rating: 3, text: 'Great coffee, rude staff' };

  it('shows the saved review until the diner touches it', () => {
    expect(reviewForm({}, saved)).toEqual({ rating: 3, text: saved.text, touched: false });
  });

  it('keeps the saved text under a star tapped before the review arrived', () => {
    // Tapped while the saved review was still on its way.
    const draft = { rating: 4 };
    expect(reviewForm(draft, null)).toEqual({ rating: 4, text: '', touched: true });
    expect(reviewForm(draft, saved)).toEqual({ rating: 4, text: saved.text, touched: true });
  });

  it('clears the text only when the diner clears it', () => {
    expect(reviewForm({ text: '' }, saved)).toEqual({ rating: 3, text: '', touched: true });
  });
});
