import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * How far the iOS keyboard reaches up the screen, for a bottom sheet with a
 * field in it to stand on.
 *
 * A sheet drawn in a `Modal` is not resized by the keyboard on iOS, so a
 * password or a note typed at its foot would be typed blind. Android resizes
 * the modal's window itself, and the web has no on-screen keyboard to dodge:
 * both get zero, as the `KeyboardAvoidingView` these sheets used to sit in did.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const show = Keyboard.addListener('keyboardWillShow', (event) =>
      setInset(event.endCoordinates.height),
    );
    const hide = Keyboard.addListener('keyboardWillHide', () => setInset(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return inset;
}
