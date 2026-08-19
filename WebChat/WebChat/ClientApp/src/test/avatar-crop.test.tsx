import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import Cropper from 'react-easy-crop';
import { buildTheme } from '@/theme/tokens';
import AvatarCropDialog, { cropSizeFor } from '@/features/settings/AvatarCropDialog';

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

/**
 * Reported from a real iPhone, and measured in a browser at a 390px viewport before any of
 * this was written: the crop circle's left and right edges are sliced flat, and the dialog
 * floats as a small card instead of using the screen.
 *
 * The chain, every link of it measured rather than reasoned:
 *
 *   the dialog never consults the mobile breakpoint -> the paper stays a centred
 *   `width: 384, m: 3` card (342.4px at a 390px viewport) -> the stage is `width: 320px,
 *   maxWidth: 100%` against an unconditional `height: 320px`, so its width collapses to
 *   278.4 while its height stays 320 -> `cropSize` is the *constant* 280, so the circle
 *   never learns the stage shrank -> `overflow: hidden` slices it.
 *
 * Measured clipping per side, at zoom 1: 0.8px at 390 (iPhone 14), 8.4px at 375 (iPhone SE),
 * 16px at 360, 36px at 320. The stage is non-square at every width at or below 430.
 *
 * **What these tests can and cannot prove.** jsdom lays nothing out, so none of them can see
 * a clipped circle - that was proved in a browser and re-proved there after the fix. What
 * they pin is each link that is expressible without layout: the arithmetic that sizes the
 * circle, the breakpoint wiring, and the fact that the stage's squareness no longer depends
 * on its width being free to reach 320px.
 */
describe('the crop dialog on a phone', () => {
  /**
   * The invariant the bug violated, as a pure function so it can be checked without layout.
   * `sourceRectFor` earned its keep the same way.
   */
  describe('cropSizeFor', () => {
    it('keeps the handoff numbers when the stage is the handoff size', () => {
      // 320px stage, 280px circle - a 40px surround. The design case must be untouched.
      expect(cropSizeFor(320)).toBe(280);
    });

    it('never returns a circle wider than the stage that has to contain it', () => {
      // The bug, stated as arithmetic. Every one of these is a real measured stage width
      // from the browser sweep.
      for (const stage of [318.4, 302.4, 278.4, 263.2, 248, 208]) {
        expect(cropSizeFor(stage)).toBeLessThanOrEqual(Math.round(stage));
      }
    });

    it('shrinks the circle with the stage, keeping the 40px surround', () => {
      expect(cropSizeFor(263.2)).toBe(223);
      expect(cropSizeFor(208)).toBe(168);
    });

    it('caps at the handoff circle rather than growing on a wide stage', () => {
      // Rules out `stage - 40` alone: a desktop stage is 320, but nothing stops a future
      // layout handing this a larger one, and the design says the circle is 280.
      expect(cropSizeFor(600)).toBe(280);
    });

    it('falls back to the handoff circle before the first measurement', () => {
      // A ref measures zero on the first render, and in jsdom it measures zero forever. A
      // zero-diameter crop area would be a blank dialog rather than a visible mistake.
      expect(cropSizeFor(0)).toBe(280);
    });

    it('never returns a diameter below one, however small the stage', () => {
      // `stage - 40` goes negative under 40px. react-easy-crop would be handed a negative
      // cropSize and lay out garbage instead of throwing.
      expect(cropSizeFor(30)).toBeGreaterThanOrEqual(1);
      expect(cropSizeFor(1)).toBeGreaterThanOrEqual(1);
    });
  });

  /** Drives MUI's `useMediaQuery` from the theme's own query, not a hardcoded pixel value. */
  const atMobileViewport = () => {
    const query = buildTheme('light').breakpoints.down('md').replace('@media ', '');
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({
      matches: q === query,
      media: q,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    return () => {
      window.matchMedia = original;
    };
  };

  /**
   * The handoff's rule, in as many words: "Mobile: single-pane switch at
   * `theme.breakpoints.down('md')`, back arrow in the chat header, **full-width
   * Drawer/Dialog**." Every other dialog in the app already obeys it - `ComposeDialog` takes
   * `fullScreen={isMobile}` from `ChatApp`. This one was the only exception.
   */
  it('goes full screen below the md breakpoint', () => {
    const restore = atMobileViewport();
    try {
      withTheme(<AvatarCropDialog file={photo()} onCancel={() => {}} onConfirm={() => {}} />);
      // MUI marks the paper itself; the dialog is in a portal, so this is a document query.
      expect(document.querySelector('.MuiDialog-paperFullScreen')).not.toBeNull();
    } finally {
      restore();
    }
  });

  it('stays a centred card above it', () => {
    // The other half of the same decision. Rules out an unconditional `fullScreen`, which
    // would have passed the test above while throwing away the handoff's desktop frame.
    withTheme(<AvatarCropDialog file={photo()} onCancel={() => {}} onConfirm={() => {}} />);
    expect(document.querySelector('.MuiDialog-paperFullScreen')).toBeNull();
  });

  /**
   * The link that actually produced the flat edges.
   *
   * `height: 320px` is only equal to the width while the width is free to reach 320px. Under
   * `maxWidth: 100%` in a narrower parent it is not, and the stage silently becomes a
   * rectangle holding a circle sized for a square. Asserting the height *number* would pass
   * against the bug - 320 is what the broken version reports too. What has to be true is that
   * the squareness is expressed as a ratio, so it survives the width being clamped.
   */
  it('keeps the stage square by ratio rather than by a fixed height', () => {
    withTheme(<AvatarCropDialog file={photo()} onCancel={() => {}} onConfirm={() => {}} />);
    const stage = getComputedStyle(screen.getByTestId('crop-stage'));

    // Height first, so this is the assertion that speaks when the fixed height comes back:
    // 'auto' is jsdom for "no height declared", and the broken version reported '320px'.
    expect(stage.height).toBe('auto');
    expect(stage.aspectRatio.replace(/\s/g, '')).toBe('1/1');
  });
});
