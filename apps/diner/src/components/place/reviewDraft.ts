import type { MyBranchReview } from '@yalla/api';

/** The fields the diner has touched. One left out shows the saved review's. */
export interface ReviewDraft {
  readonly rating?: number;
  readonly text?: string;
}

export interface ReviewForm {
  readonly rating: number;
  readonly text: string;
  /** Something was changed, so there is something to post. */
  readonly touched: boolean;
}

/**
 * What the composer shows, and would post.
 *
 * Field by field. Tapping a star must not freeze whatever the text box held at
 * that moment: before the saved review had arrived that was nothing, and the
 * save — an upsert, where blank text clears it — then wiped what the diner had
 * written.
 */
export function reviewForm(
  draft: ReviewDraft,
  saved: Pick<MyBranchReview, 'rating' | 'text'> | null,
): ReviewForm {
  return {
    rating: draft.rating ?? saved?.rating ?? 0,
    text: draft.text ?? saved?.text ?? '',
    touched: draft.rating !== undefined || draft.text !== undefined,
  };
}
