// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createConsoleHarness, initConsoleTestI18n } from '../reports/testHarness';
import { PhotoPicker } from './PhotoPicker';

/**
 * QA 2026-10-16 (C-M3): a PDF, or a HEIC renamed .jpg, opened the framer on a
 * broken picture, and "Use this" did nothing at all. Cancel was the only way out.
 */

beforeAll(async () => {
  await initConsoleTestI18n();
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:picked'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});

afterEach(() => {
  cleanup();
});

function open() {
  const onChange = vi.fn();
  const harness = createConsoleHarness();
  const { container } = render(
    harness.wrap(<PhotoPicker branchId="b-lumen-cascade" photo={null} onChange={onChange} />),
  );
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  return { input, container, onChange };
}

function pick(input: HTMLInputElement, file: File) {
  fireEvent.change(input, { target: { files: [file] } });
}

describe('the photo framer', () => {
  it('turns away a file that is not a picture before framing it', () => {
    const { input } = open();

    pick(input, new File(['%PDF-1.7'], 'menu.pdf', { type: 'application/pdf' }));

    expect(screen.getByRole('alert').textContent).toBe('That file is not a JPEG, PNG or WebP.');
    expect(screen.queryByRole('button', { name: /use this/i })).toBeNull();
  });

  it('keeps "Use this" off until the picture has opened', () => {
    const { input, container } = open();

    pick(input, new File(['jpeg'], 'room.jpg', { type: 'image/jpeg' }));

    const use = screen.getByRole('button', { name: /use this/i }) as HTMLButtonElement;
    expect(use.disabled).toBe(true);
    const image = container.querySelector<HTMLImageElement>('.photo-crop img')!;
    Object.defineProperty(image, 'naturalWidth', { value: 1600 });
    Object.defineProperty(image, 'naturalHeight', { value: 1200 });
    fireEvent.load(image);
    expect(use.disabled).toBe(false);
  });

  it('says so, and closes the framer, when the picture cannot be opened', () => {
    const { input, container } = open();

    // A HEIC renamed .jpg: the browser calls it a JPEG and then cannot draw it.
    pick(input, new File(['ftypheic'], 'room.jpg', { type: 'image/jpeg' }));
    fireEvent.error(container.querySelector<HTMLImageElement>('.photo-crop img')!);

    expect(screen.getByRole('alert').textContent).toBe(
      'This file could not be opened as a picture. Choose a JPEG, PNG or WebP photo.',
    );
    expect(screen.queryByRole('button', { name: /use this/i })).toBeNull();
    expect(screen.getByRole('button', { name: /drop a photo here/i })).toBeTruthy();
  });
});
