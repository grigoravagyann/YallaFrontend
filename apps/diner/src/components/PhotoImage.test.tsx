// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PhotoImage } from './PhotoImage';

/**
 * Rendered through react-native-web. Needs the `ui` vitest project (jsdom,
 * `react-native` aliased to `react-native-web`); the node project's
 * `*.test.ts` glob does not pick this file up.
 */

vi.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { readonly name: string }) => <span data-testid="glyph" data-name={name} />,
}));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));

afterEach(cleanup);

describe('PhotoImage', () => {
  it.each([
    ['an empty string', ''],
    ['undefined', undefined],
  ])('shows the fallback glyph and no image for %s, from the first render', (_label, source) => {
    const { container, queryByTestId } = render(<PhotoImage source={source} />);

    expect(queryByTestId('glyph')?.getAttribute('data-name')).toBe('image-outline');
    expect(container.querySelector('img')).toBeNull();
    expect(container.innerHTML).not.toContain('background-image');
  });

  it('renders the image, not the fallback, for a real URL', () => {
    const { container, queryByTestId } = render(
      <PhotoImage source="https://example.test/cover.jpg" />,
    );

    expect(queryByTestId('glyph')).toBeNull();
    expect(container.innerHTML).toContain('https://example.test/cover.jpg');
  });
});
