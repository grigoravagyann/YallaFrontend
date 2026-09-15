import { render, screen } from '@testing-library/react';
import { Platform, Pressable, Text, View } from 'react-native';
import { describe, expect, it, vi } from 'vitest';

/**
 * Proves the `ui` project is wired: this file runs under jsdom, `react-native`
 * resolves to `react-native-web`, and a React Native tree renders to DOM that
 * @testing-library/react can query and interact with. If this fails, every
 * other `*.test.tsx` failure is about the setup, not the component.
 */
describe('ui test project', () => {
  it('resolves react-native to react-native-web in a DOM environment', () => {
    expect(Platform.OS).toBe('web');
    expect(typeof document).toBe('object');
  });

  it('renders a React Native tree and fires presses', () => {
    const onPress = vi.fn();
    render(
      <View>
        <Text>Hello, table 4</Text>
        <Pressable accessibilityRole="button" onPress={onPress}>
          <Text>Book</Text>
        </Pressable>
      </View>,
    );

    expect(screen.getByText('Hello, table 4')).toBeTruthy();
    screen.getByRole('button', { name: 'Book' }).click();
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
