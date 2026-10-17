// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/**
 * The `<img>` react-native-web loads a photo through, caught so a test can say
 * how the load went: jsdom fetches nothing, so it neither loads nor fails.
 */
function catchLoads(): HTMLImageElement[] {
  const loads: HTMLImageElement[] = [];
  vi.spyOn(window, 'Image').mockImplementation(function image() {
    const element = document.createElement('img');
    loads.push(element);
    return element;
  });
  return loads;
}

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

  it('says a failed load is a failure, and draws the fallback', () => {
    const loads = catchLoads();
    const onError = vi.fn();
    const onLoad = vi.fn();
    const { queryByTestId } = render(
      <PhotoImage source="https://example.test/gone.jpg" onError={onError} onLoad={onLoad} />,
    );

    act(() => {
      loads[0]?.onerror?.(new Event('error'));
    });

    expect(onError).toHaveBeenCalledTimes(1);
    // The older callers still hear it as a load of nothing.
    expect(onLoad).toHaveBeenCalledWith(null);
    expect(queryByTestId('glyph')).not.toBeNull();
  });

  it('does not call a load that cannot say its size a failure', async () => {
    const loads = catchLoads();
    const onError = vi.fn();
    const onLoad = vi.fn();
    const { queryByTestId } = render(
      <PhotoImage source="https://example.test/face.jpg" onError={onError} onLoad={onLoad} />,
    );

    await act(async () => {
      loads[0]?.onload?.(new Event('load'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(onLoad).toHaveBeenCalledWith(null);
    expect(onError).not.toHaveBeenCalled();
    expect(queryByTestId('glyph')).toBeNull();
  });
});
