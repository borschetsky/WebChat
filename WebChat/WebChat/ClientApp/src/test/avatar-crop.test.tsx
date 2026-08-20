import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import Cropper, { getInitialCropFromCroppedAreaPercentages } from 'react-easy-crop';
import { buildTheme } from '@/theme/tokens';
import AvatarCropDialog, {
  coverMediaSizeFor,
  cropSizeFor,
  restoreCropFor,
} from '@/features/settings/AvatarCropDialog';
import type { Area, MediaSize, Point } from 'react-easy-crop';

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
   * The handoff's Remove action, which #84 and #88 both left out because no endpoint could
   * clear an avatar. #89 added one, so this test - which used to pin the button's *absence* -
   * now pins its presence and its behaviour. It sits ahead of the spacer, per the handoff, and
   * it is `error` coloured because it is the one destructive control in the dialog.
   */
  it('draws a Remove action when there is a photo to remove', () => {
    const onRemove = vi.fn();
    withTheme(
      <AvatarCropDialog
        file={photo()}
        source="stored"
        onRemove={onRemove}
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );

    const button = screen.getByRole('button', { name: /remove photo/i });
    fireEvent.click(button);

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  /**
   * The other half, and the reason the button is driven by a callback rather than by `source`:
   * someone cropping their *first* photo has nothing to remove, and a Remove button there would
   * either do nothing or remove a photo they never had. The call site decides; the dialog only
   * draws what it was handed.
   */
  it('draws no Remove action when there is nothing to remove', () => {
    withTheme(<AvatarCropDialog file={photo()} onCancel={() => {}} onConfirm={() => {}} />);

    expect(screen.queryByRole('button', { name: /remove/i })).toBeNull();
  });

  /**
   * Re-opening a stored photo says so. The two cases are genuinely different actions - one is
   * finishing an upload, the other is changing an avatar that is already live - and this
   * string is the dialog's accessible name, so it is what a screen reader announces.
   */
  it('announces itself as an adjustment when the photo came from the server', () => {
    withTheme(
      <AvatarCropDialog file={photo()} source="stored" onCancel={() => {}} onConfirm={() => {}} />,
    );

    expect(screen.getByRole('dialog', { name: 'Adjust your crop' })).toBeInTheDocument();
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

/**
 * Re-opening a saved crop and saving it again, untouched, must store the same rectangle.
 *
 * **Reported after a browser round-trip, and reproduced here.** Every Adjust-and-save zoomed
 * the avatar in by the photo's own aspect ratio - a face crept tighter each time the dialog
 * was opened:
 *
 *     900x1200 source, original stored 768x1024
 *       after upload:       x  8.333  y 18.750  w 83.333  h 62.500
 *       after untouched #1: x 18.750  y 26.563  w 62.500  h 46.875
 *       after untouched #2: x 26.563  y 32.422  w 46.875  h 35.156
 *
 * Each width is the previous one divided by 1.3333 = 1200/900.
 *
 * **The mechanism, read out of `react-easy-crop@6.2.3` rather than inferred.**
 * `onMediaLoad` (index.module.mjs:308) calls `computeSizes()` and then `setInitialCrop()`.
 * `computeSizes` picks the rendered media size from `this.state.mediaObjectFit`, which is
 * initialised to `undefined` (:276) and only ever assigned in `componentDidUpdate` (:670) -
 * so on the load that applies `initialCroppedAreaPercentages` the switch falls through to its
 * `contain` branch. A beat later the fit resolves to `horizontal-cover`, the media is
 * re-measured wider, and the initial crop is **not** re-applied. The zoom was computed
 * against a `contain` width and is then used against a `cover` one.
 *
 * **The fixture is non-square on purpose. Do not "simplify" it to a square.** `contain` and
 * `cover` agree for a square photo, so a square source cannot exhibit this at any zoom - both
 * 1000x1000 (not downscaled) and 1400x1400 (downscaled) round-trip perfectly against the
 * broken code. This is #84's fixture trap in mirror image: there a square fixture hid an
 * `objectFit` bug, here it would hide that bug's sibling.
 *
 * `objectFit="cover"` is not the fault and must stay. It is what makes a non-square photo
 * cover the circle so the export matches what was framed; without it a 1200x400 banner
 * exports its left third (#84).
 */
describe('re-opening a saved crop', () => {
  /**
   * What react-easy-crop reports back to `onCropComplete`, transcribed from
   * `computeCroppedArea` (index.module.mjs:117-122) with `restrictPosition` true.
   *
   * The forward half of the round trip has to be the library's, or the test only proves this
   * file's algebra is self-consistent. The backward half needs no transcription: production
   * calls the library's own exported `getInitialCropFromCroppedAreaPercentages`.
   */
  const percentagesReportedFor = (
    crop: Point,
    zoom: number,
    mediaSize: MediaSize,
    cropSide: number,
  ): Area => {
    const limit = (v: number) => Math.min(100, Math.max(0, v));
    return {
      x: limit((((mediaSize.width - cropSide / zoom) / 2 - crop.x / zoom) / mediaSize.width) * 100),
      y: limit(
        (((mediaSize.height - cropSide / zoom) / 2 - crop.y / zoom) / mediaSize.height) * 100,
      ),
      width: limit(((cropSide / mediaSize.width) * 100) / zoom),
      height: limit(((cropSide / mediaSize.height) * 100) / zoom),
    };
  };

  /**
   * The `contain` branch of `computeSizes` - the size the library measures while
   * `mediaObjectFit` is still undefined. Here only to state the bug; production never wants
   * this number.
   */
  const containMediaSizeFor = (
    natural: { naturalWidth: number; naturalHeight: number },
    side: number,
  ): MediaSize => {
    const mediaAspect = natural.naturalWidth / natural.naturalHeight;
    const rendered =
      1 > mediaAspect
        ? { width: side * mediaAspect, height: side }
        : { width: side, height: side / mediaAspect };
    return { ...rendered, ...natural };
  };

  /**
   * The library's own restore, against a media size the test chooses. Used only to show what
   * the *wrong* media size does; production calls the same function through `restoreCropFor`.
   */
  const restoreAgainst = (percentages: Area, mediaSize: MediaSize, cropSide: number) =>
    getInitialCropFromCroppedAreaPercentages(
      percentages,
      mediaSize,
      0,
      { width: cropSide, height: cropSide },
      1,
      3,
    );

  /** The reported fixture: a 3:4 photo, stored at 768x1024, on the 320px desktop stage. */
  const PORTRAIT = { naturalWidth: 768, naturalHeight: 1024 };
  const LANDSCAPE = { naturalWidth: 1024, naturalHeight: 768 };
  const SQUARE = { naturalWidth: 1024, naturalHeight: 1024 };
  const SAVED: Area = { x: 8.333333333333332, y: 18.75, width: 83.33333333333333, height: 62.5 };

  /** Restore a rectangle, then read back what the cropper would report with no interaction. */
  const roundTrip = (
    saved: Area,
    natural: { naturalWidth: number; naturalHeight: number },
    stageSide: number,
  ): Area => {
    const restored = restoreCropFor(saved, natural, stageSide)!;
    expect(restored).not.toBeNull();

    // The media size the library ends up rendering at, which is the cover one - that is what
    // the user is looking at and what the next onCropComplete is measured against.
    const shown = coverMediaSizeFor(natural, { width: stageSide, height: stageSide })!;

    return percentagesReportedFor(restored.crop, restored.zoom, shown, cropSizeFor(stageSide));
  };

  /**
   * Four floats to four decimals, so a whole rectangle is one assertion and a failure prints
   * all of it. The drift being guarded against is 33%, not a rounding.
   */
  const rounded = (a: Area) => ({
    x: Number(a.x.toFixed(4)),
    y: Number(a.y.toFixed(4)),
    width: Number(a.width.toFixed(4)),
    height: Number(a.height.toFixed(4)),
  });

  describe('coverMediaSizeFor', () => {
    it('pins a tall photo to the container width and lets it overflow downwards', () => {
      // 3:4 in a square box: `cover` has to fill the width, so the height runs past the box.
      const size = coverMediaSizeFor(PORTRAIT, { width: 320, height: 320 })!;

      expect(size.width).toBe(320);
      expect(size.height).toBeCloseTo(426.6667, 4);
      expect(size.naturalWidth).toBe(768);
      expect(size.naturalHeight).toBe(1024);
    });

    it('pins a wide photo to the container height and lets it overflow sideways', () => {
      const size = coverMediaSizeFor(LANDSCAPE, { width: 320, height: 320 })!;

      expect(size.width).toBeCloseTo(426.6667, 4);
      expect(size.height).toBe(320);
    });

    /**
     * The control that explains why the fixture above must not be square: for a square photo
     * `cover` and `contain` are the same number, so the bug is arithmetically invisible.
     */
    it('agrees with contain for a square photo, which is why a square fixture proves nothing', () => {
      expect(coverMediaSizeFor(SQUARE, { width: 320, height: 320 })).toEqual(
        containMediaSizeFor(SQUARE, 320),
      );
      expect(coverMediaSizeFor(PORTRAIT, { width: 320, height: 320 })).not.toEqual(
        containMediaSizeFor(PORTRAIT, 320),
      );
    });

    it('refuses a size it cannot compute rather than restoring to NaN', () => {
      expect(
        coverMediaSizeFor({ naturalWidth: 0, naturalHeight: 100 }, { width: 320, height: 320 }),
      ).toBeNull();
      expect(coverMediaSizeFor(PORTRAIT, { width: 0, height: 0 })).toBeNull();
    });
  });

  /** The invariant, stated once per fixture. This is the test that was red. */
  it('gives back the rectangle it was given, for a tall photo', () => {
    expect(rounded(roundTrip(SAVED, PORTRAIT, 320))).toEqual(rounded(SAVED));
  });

  it('gives back the rectangle it was given, for a wide photo', () => {
    const saved: Area = { x: 18.75, y: 8.333333333333332, width: 62.5, height: 83.33333333333333 };
    expect(rounded(roundTrip(saved, LANDSCAPE, 320))).toEqual(rounded(saved));
  });

  it('gives back the rectangle it was given, for a square photo', () => {
    // Passed before the fix as well. Kept as the control that makes the two above meaningful.
    const saved: Area = { x: 6.25, y: 6.25, width: 87.5, height: 87.5 };
    expect(rounded(roundTrip(saved, SQUARE, 320))).toEqual(rounded(saved));
  });

  it('is stable across repeated adjustments, not merely close', () => {
    // The report was cumulative: each open-and-save shrank the crop again. One round trip
    // being right is not the claim - the fixed point is.
    let area = SAVED;
    for (let i = 0; i < 5; i += 1) area = roundTrip(area, PORTRAIT, 320);
    expect(rounded(area)).toEqual(rounded(SAVED));
  });

  /**
   * The bug itself, pinned with the exact numbers from the browser report so that a future
   * "just let the library restore it" cannot come back unnoticed.
   */
  it('drifts by exactly the photo aspect ratio when restored against the contain size', () => {
    const contain = containMediaSizeFor(PORTRAIT, 320);
    const restored = restoreAgainst(SAVED, contain, 280);
    const shown = coverMediaSizeFor(PORTRAIT, { width: 320, height: 320 })!;

    const reported = percentagesReportedFor(restored.crop, restored.zoom, shown, 280);

    // 1024/768 = 1.3333, the factor in the report.
    expect(rounded(reported)).toEqual({ x: 18.75, y: 26.5625, width: 62.5, height: 46.875 });
    expect(SAVED.width / reported.width).toBeCloseTo(1024 / 768, 6);
  });

  /**
   * #92 made `cropSize` dynamic - the circle shrinks with the stage below about a 424px
   * viewport - so a restore that assumed the handoff's constant 280 would be wrong on a phone
   * and right on a desktop, which is the worst way for it to be wrong.
   */
  it('uses the measured circle, not the handoff 280, on a narrow stage', () => {
    const stage = 263.2; // an iPhone SE, measured in a browser during #92
    expect(cropSizeFor(stage)).toBe(223);

    expect(rounded(roundTrip(SAVED, PORTRAIT, stage))).toEqual(rounded(SAVED));

    // And the version that hardcodes 280: the library would still lay out a 223px circle, so
    // the zoom is wrong by 280/223 and the crop comes back visibly tighter.
    const shown = coverMediaSizeFor(PORTRAIT, { width: stage, height: stage })!;
    const wrong = restoreAgainst(SAVED, shown, 280);
    const reported = percentagesReportedFor(wrong.crop, wrong.zoom, shown, 223);
    expect(reported.width).not.toBeCloseTo(SAVED.width, 2);
  });

  it('refuses to restore before the stage has been measured', () => {
    // jsdom measures zero forever, and a real browser measures zero on the first frame.
    // Restoring against a zero stage would divide by nothing.
    expect(restoreCropFor(SAVED, PORTRAIT, 0)).toBeNull();
  });

  it('clamps rather than inventing a zoom the slider cannot reach', () => {
    // A very tight saved rectangle needs more than 3x. The library clamps to maxZoom and so
    // does this; the crop then cannot be reproduced exactly, which is a limit of the zoom
    // range rather than a drift, and it must not come back as NaN or a negative.
    const tiny: Area = { x: 40, y: 40, width: 5, height: 5 };
    const restored = restoreCropFor(tiny, PORTRAIT, 320)!;

    expect(restored.zoom).toBe(3);
    expect(Number.isFinite(restored.crop.x)).toBe(true);
    expect(Number.isFinite(restored.crop.y)).toBe(true);
  });
});
