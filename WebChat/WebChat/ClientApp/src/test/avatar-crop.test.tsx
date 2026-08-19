import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import Cropper from 'react-easy-crop';
import { buildTheme } from '@/theme/tokens';
import AvatarCropDialog from '@/features/settings/AvatarCropDialog';

/**
 * The only stub these tests add, and it is here rather than in `src/test/setup.ts`
 * deliberately.
 *
 * The research note claimed react-easy-crop renders under jsdom with **nothing** added to the
 * shared setup, because it guards `ResizeObserver` itself (`typeof window.ResizeObserver ===
 * "undefined"` -> falls back to a resize listener). That claim is re-checked below and still
 * holds at 6.2.3: `setup.ts` is untouched by this change. `URL.createObjectURL` is jsdom
 * missing a platform API that *our own* dialog calls to build a preview src, not a gap in the
 * library, so it is stubbed here and nowhere else.
 */
beforeAll(() => {
  if (!URL.createObjectURL) {
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
  }
});

const withTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={buildTheme('light')}>{ui}</ThemeProvider>);

const photo = (name = 'portrait.jpg') =>
  new File([new Uint8Array([1, 2, 3])], name, { type: 'image/jpeg' });

/**
 * Re-verification of the package fact the research note is only as good as its date on.
 *
 * A guard, not a reproduction - nothing here was ever broken. Its value is that the day the
 * library stops tolerating jsdom, the failure says which library and why, instead of
 * surfacing as an unrelated dialog test throwing from inside a component nobody suspects.
 */
describe('react-easy-crop under jsdom', () => {
  it('mounts with cropShape="round" and showGrid, with no ResizeObserver stub', () => {
    expect(window.ResizeObserver).toBeUndefined();

    const { container } = withTheme(
      <Cropper
        image="blob:preview"
        crop={{ x: 0, y: 0 }}
        zoom={1}
        aspect={1}
        cropShape="round"
        showGrid
        onCropChange={() => {}}
      />,
    );

    expect(container.querySelector('.reactEasyCrop_Container')).not.toBeNull();
  });
});

describe('AvatarCropDialog', () => {
  it('renders the handoff chrome around a picked photo', () => {
    withTheme(<AvatarCropDialog file={photo()} onCancel={() => {}} onConfirm={() => {}} />);

    expect(screen.getByText('Crop your photo')).toBeInTheDocument();
    expect(screen.getByText('Drag to reposition, pinch or slide to zoom.')).toBeInTheDocument();
    expect(screen.getByLabelText('Zoom')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save photo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  /**
   * The handoff draws a Remove action; there is no endpoint that can clear an avatar
   * (`AvatarsController` has only `upload`; `UpdateProfile` writes Email and Username and
   * nothing else), so it is deliberately absent. This pins that as a decision rather than an
   * oversight - if the button appears before the endpoint does, this is what says so.
   */
  it('draws no Remove action, because no API can clear an avatar', () => {
    withTheme(<AvatarCropDialog file={photo()} onCancel={() => {}} onConfirm={() => {}} />);
    expect(screen.queryByRole('button', { name: /remove/i })).toBeNull();
  });

  /**
   * A reproduction, found in a browser and not by any test here.
   *
   * MUI generates an `aria-labelledby` for `Dialog` and expects `DialogTitle` to carry the
   * matching id. This dialog draws its own heading to hit the handoff's 19px/500, so the id
   * landed on nothing: the attribute was present, pointed at `_r_h_`, and no element in the
   * document had that id - an unnamed dialog with a perfectly visible title.
   *
   * Querying by role *and name* is what catches it. Asserting the heading text passes either
   * way, which is why this went unseen: the heading was always there.
   */
  it('is announced by its title, not as an unnamed dialog', () => {
    withTheme(<AvatarCropDialog file={photo()} onCancel={() => {}} onConfirm={() => {}} />);

    const dialog = screen.getByRole('dialog', { name: 'Crop your photo' });
    const labelledBy = dialog.getAttribute('aria-labelledby');

    // The attribute existing is not the property that matters - it has to resolve.
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)?.textContent).toBe('Crop your photo');
  });

  /**
   * The stage is the handoff's 320 px, and that is as far as jsdom can go.
   *
   * The 280 px circle, its ring, the dimmed surround and the thirds grid are all drawn by
   * react-easy-crop, and it only emits that element once it has *measured* a loaded image -
   * jsdom loads no images and lays nothing out, so `.reactEasyCrop_CropArea` is never in the
   * DOM here at all. What is asserted instead is the configuration handed to the library, in
   * `avatar-crop-flow.test.tsx`. **The circle itself has not been seen; only a browser can
   * confirm it.**
   */
  it('gives the cropper the handoff-sized 320px stage', () => {
    withTheme(<AvatarCropDialog file={photo()} onCancel={() => {}} onConfirm={() => {}} />);
    expect(getComputedStyle(screen.getByTestId('crop-stage')).width).toBe('320px');
  });

  it('cancel reports the cancellation and never produces a file', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    withTheme(<AvatarCropDialog file={photo()} onCancel={onCancel} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('cannot save before the cropper has reported an area', () => {
    // jsdom has no layout, so onCropComplete never fires here - which is also the state a
    // real browser is in on the first frame. Saving then would call drawImage with an
    // undefined rectangle.
    withTheme(<AvatarCropDialog file={photo()} onCancel={() => {}} onConfirm={() => {}} />);
    expect(screen.getByRole('button', { name: /save photo/i })).toBeDisabled();
  });
});
