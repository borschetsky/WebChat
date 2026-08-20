import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  Slider,
  Stack,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import CheckIcon from '@mui/icons-material/Check';
// `DeleteOutline` does not exist in this package - the exports are `Delete`,
// `DeleteOutlined` and `DeleteOutlineOutlined`. Exactly the class of import that typechecks,
// passes the dev server and breaks `vite build`; see CLAUDE.md on `MailOutline`.
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import Cropper, { getInitialCropFromCroppedAreaPercentages } from 'react-easy-crop';
import type { Area, MediaSize, Point } from 'react-easy-crop';
import { cropToFile, downscaleToFile } from '@/features/settings/cropImage';

/** From the handoff: min 1, max 3, step 0.05. */
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.05;

/** 280 px circle inside a 320 px stage, both from the handoff. */
const STAGE_PX = 320;
const CIRCLE_PX = 280;

/** The surround the handoff's two numbers imply: 320 - 280. Kept until it cannot be afforded. */
const STAGE_SURROUND_PX = STAGE_PX - CIRCLE_PX;

/**
 * The circle's diameter for a stage that has actually been measured.
 *
 * Split out and pure for the same reason `sourceRectFor` is: it is the part where being
 * wrong is invisible rather than loud. `cropSize` was a **constant** 280 while the stage
 * carried `maxWidth: '100%'`, so on any viewport narrower than about 424px the stage shrank
 * and the circle did not - and `overflow: hidden` sliced the ring flat. Measured per side:
 * 0.8px at a 390px viewport, 8.4px at 375, 16px at 360, 36px at 320.
 *
 * The one invariant is **circle <= stage**. The 40px surround is kept while there is room for
 * it and given up before the circle is allowed to overflow, because a tight circle still
 * shows the whole crop and a clipped one lies about where its edge is.
 */
export function cropSizeFor(stageSide: number): number {
  // A ref measures zero on the first render, and in jsdom it measures zero forever. Falling
  // back to the handoff's circle keeps the desktop frame exact and keeps a zero-diameter crop
  // area - a blank dialog - off the screen.
  if (!(stageSide > 0)) return CIRCLE_PX;

  // Never grow past the design's circle, never overflow the stage, never go non-positive.
  return Math.max(1, Math.min(CIRCLE_PX, Math.round(stageSide) - STAGE_SURROUND_PX));
}

/**
 * The size react-easy-crop will actually render the photo at, given `objectFit="cover"`.
 *
 * **This is the whole of the re-crop drift bug.** Restoring a saved rectangle needs the
 * displayed media size, and `cover` and `contain` disagree about it for any photo that is not
 * square - by exactly the ratio of the longer edge to the shorter one.
 *
 * Transcribed from the library rather than guessed, and from two places that agree:
 * `getObjectFit()` resolves `cover` to `horizontal-cover` when the media is *narrower* than
 * the container and `vertical-cover` otherwise, and `computeSizes()` then sizes it as
 * `width: container.width` (horizontal) or `height: container.height` (vertical). Its CSS
 * says the same thing a third time - `.reactEasyCrop_Cover_Horizontal { width: 100%; height:
 * auto }` - which matters because `computeSizes` takes the element's own offset size instead
 * whenever the photo is *not* scaled down. Both branches land on these numbers, so a small
 * photo restores the same way a large one does.
 *
 * Returns null for anything that cannot be a rendered size, so the caller opens the cropper on
 * the whole photo rather than restoring to NaN.
 */
export function coverMediaSizeFor(
  natural: { naturalWidth: number; naturalHeight: number },
  container: { width: number; height: number },
): MediaSize | null {
  const { naturalWidth, naturalHeight } = natural;

  if (
    !(naturalWidth > 0) ||
    !(naturalHeight > 0) ||
    !(container.width > 0) ||
    !(container.height > 0)
  ) {
    return null;
  }

  const mediaAspect = naturalWidth / naturalHeight;
  const containerAspect = container.width / container.height;

  const rendered =
    mediaAspect < containerAspect
      ? // horizontal-cover: pinned to the container's width, overflowing vertically.
        { width: container.width, height: container.width / mediaAspect }
      : // vertical-cover: pinned to the container's height, overflowing horizontally.
        { width: container.height * mediaAspect, height: container.height };

  return { ...rendered, naturalWidth, naturalHeight };
}

/**
 * The `crop` and `zoom` that put a saved rectangle back where it was.
 *
 * Done here rather than by handing the library `initialCroppedAreaPercentages`, and that is
 * the fix rather than a preference. The library applies that prop from `onMediaLoad`, which
 * runs `computeSizes()` **before** anything has resolved `cover` into `horizontal-cover` or
 * `vertical-cover`: `state.mediaObjectFit` is still `undefined` at that moment, so the switch
 * falls through to its `contain` branch and the media is measured as if it were letterboxed.
 * `componentDidUpdate` fixes the fit a beat later and re-measures - but never re-applies the
 * initial crop. So the zoom is computed against a `contain` width and then used against a
 * `cover` one, and every restore-and-save shrinks the crop by the photo's aspect ratio. A
 * square photo cannot show it, because `contain` and `cover` agree there.
 *
 * The arithmetic itself is the library's own public `getInitialCropFromCroppedAreaPercentages`
 * - only the media size handed to it is ours. `cropSize` comes from `cropSizeFor`, not from
 * the handoff's 280: the circle shrinks with the stage on a narrow viewport (#92), and a zoom
 * computed against 280 on a 375px phone would be wrong by 280/223.
 */
export function restoreCropFor(
  percentages: Area,
  natural: { naturalWidth: number; naturalHeight: number },
  stageSide: number,
): { crop: Point; zoom: number } | null {
  if (!(stageSide > 0)) return null;

  // Square by `aspect-ratio: 1/1` - see the stage's `sx` below, and #92.
  const container = { width: stageSide, height: stageSide };
  const mediaSize = coverMediaSizeFor(natural, container);
  if (!mediaSize) return null;

  const side = cropSizeFor(stageSide);

  return getInitialCropFromCroppedAreaPercentages(
    percentages,
    mediaSize,
    0,
    { width: side, height: side },
    MIN_ZOOM,
    MAX_ZOOM,
  );
}

/**
 * Where the photo in the dialog came from, which decides what has to be uploaded with the
 * crop.
 *
 * `'picked'` - just chosen from the device, so the original has never reached the server and
 * has to go up alongside the square. `'stored'` - fetched back from the server's own copy, so
 * it is already there and re-posting it would store a second, identical object and orphan the
 * first.
 *
 * An explicit prop rather than "is there an initial crop": the two are independent. A stored
 * photo can have no saved rectangle (the upload that stored it sent none), and inferring one
 * from the other would silently re-upload an original every time someone adjusted a crop that
 * had never been recorded.
 */
export type CropSource = 'picked' | 'stored';

/** What a confirmed crop hands back: the square, the rectangle, and the original if it is new. */
export type CropResult = {
  /** The cropped square, ready for the existing upload path. */
  file: File;
  /**
   * The crop rectangle in **percentages** of the source, which is what gets persisted.
   *
   * Percentages, not `croppedAreaPixels`: pixels are measured against the exact image
   * dimensions they were taken in, and the server re-encodes the stored original at its own
   * size cap, so a pixel rectangle would come back scaled wrong. react-easy-crop hands back
   * both from one callback, and restores from percentages.
   */
  crop: Area;
  /** The whole photo, downscaled, when it is not already on the server. Null for a re-crop. */
  original: File | null;
};

export type AvatarCropDialogProps = {
  /**
   * The photo. Required, and the component is mounted only while there is one: the
   * call site keys on the file, so a different photo is a different component instance
   * rather than an effect resetting five pieces of state - which is the fix this repo keeps
   * deferring elsewhere, taken here because nothing forces the deferral.
   */
  file: File;
  /** See {@link CropSource}. Defaults to a freshly picked photo. */
  source?: CropSource;
  /**
   * The rectangle to open on, in percentages, or null for the whole photo.
   *
   * Applied by this component through {@link restoreCropFor} once the photo's natural size and
   * the stage's measured width are both known - **not** by handing the library
   * `initialCroppedAreaPercentages`, which measures the photo before it has decided what
   * `objectFit="cover"` means and shrinks the crop on every save. See `restoreCropFor`.
   */
  initialCrop?: Area | null;
  /**
   * Remove the photo the user currently has (#89), or undefined when there is none.
   *
   * **Undefined is what hides the button**, rather than the dialog deciding from `source`.
   * Only the call site knows whether an avatar exists: someone cropping their first photo has
   * `source === 'picked'` and nothing to remove, and so does someone replacing a photo they
   * already have. A button whose only possible outcome is "nothing happened" is worse than an
   * absent one.
   *
   * The dialog does not close itself afterwards - the call site owns that, because it is also
   * what unmounts this component and revokes the object URL.
   */
  onRemove?: () => void;
  /** Cancel. Nothing has been uploaded, so the current avatar is untouched. */
  onCancel: () => void;
  /** Confirm. See {@link CropResult}. */
  onConfirm: (result: CropResult) => void;
};

/**
 * Pan and zoom a picked photo inside a circle, then upload the square it selects.
 *
 * Built to the owner's design handoff: 384 px dialog, 320 px stage, 280 px circle, zoom
 * 1-3 in steps of 0.05, and the rule-of-thirds grid, which the handoff specifies rather
 * than offers.
 *
 * **The ring, the dimmed surround and the grid all come from `react-easy-crop`**, restyled
 * rather than redrawn. The library already paints all three (`cropShape="round"` gives the
 * circle and a `box-shadow: 0 0 0 9999em` dim; `showGrid` gives the thirds), so hand-drawing
 * the handoff's radial-gradient scrim and its own ring on top would have produced two of
 * each, one of them a half-pixel off the other. What is overridden is only the numbers: the
 * ring goes from 1px/.5 alpha to 2px/.85, the dim from .5 to .55 (the handoff's gradient is
 * transparent to 139 px and .55 black from 140 px, which is this box-shadow at a 280 px
 * circle), and the grid lines from .5 to .35.
 *
 * The handoff also draws a **Remove** action, absent through #84 and #88 because nothing in the
 * API could clear an avatar. #89 added `POST /api/avatars/remove`, so it is drawn - but only
 * when the call site hands over an `onRemove`, since a first upload has nothing to remove yet.
 * Removal is a retention marker rather than a delete, which is what makes the snackbar's Undo
 * able to restore the photo *and* this dialog's crop exactly.
 *
 * **The crop is still applied client-side and the square uploaded** - what #88 added is that
 * the whole photo and the rectangle go up alongside it, so the crop can be adjusted later
 * without re-picking the file. What has *not* changed, and must not, is that every save writes
 * a fresh `{Guid}.{ext}` server-side: `CachingAvatarUrlProvider` memoises a presigned URL for
 * 30 minutes and the redirect is served `max-age=300`, both safe only because a filename's
 * bytes never change. Re-deriving into a stable per-user key would keep serving the old
 * picture - most visibly to the person who just re-cropped it, because their own browser holds
 * the stale copy. See docs/ctx/2026-08-09-stable-avatar-urls.md.
 *
 * Loaded through `React.lazy` from the settings drawer, so `react-easy-crop` lands in its own
 * chunk rather than in ChatApp's. Nothing outside this dialog imports the library.
 */
export default function AvatarCropDialog({
  file,
  source = 'picked',
  initialCrop = null,
  onRemove,
  onCancel,
  onConfirm,
}: AvatarCropDialogProps) {
  // An object URL rather than a data URL: a phone photo is megabytes, and base64 would copy
  // all of it through a string. Built in a lazy initialiser rather than an effect, so there
  // is never a first frame with no image and nothing has to set state from an effect.
  const [src] = useState(() => URL.createObjectURL(file));
  const titleId = useId();

  /**
   * The handoff's rule for every dialog in this app: "Mobile: single-pane switch at
   * `theme.breakpoints.down('md')` ... full-width Drawer/Dialog." `ComposeDialog` already
   * takes `fullScreen={isMobile}` from `ChatApp`, and `AppShell`'s `useIsMobile` is this same
   * query - this component is read through `React.lazy`, so it asks the theme directly rather
   * than importing the shell into its chunk.
   */
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('md'));

  // The stage's real width, which is only 320 when there is room for 320.
  const stageEl = useRef<HTMLDivElement | null>(null);
  const [stageSide, setStageSide] = useState(0);
  const circleSide = cropSizeFor(stageSide);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [area, setArea] = useState<Area | null>(null);
  // The same rectangle in percentages. Both are needed and neither substitutes for the other:
  // the export reads source pixels, and only percentages survive the original being re-encoded
  // at a different size, which is what makes a saved crop restorable.
  const [percent, setPercent] = useState<Area | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  // The only thing keeping the blob from being held for the life of the tab.
  useEffect(() => () => URL.revokeObjectURL(src), [src]);

  const measure = useCallback(() => {
    const el = stageEl.current;
    if (el) setStageSide(el.getBoundingClientRect().width);
  }, []);

  /**
   * A **callback ref**, and this is the load-bearing part rather than a style preference.
   *
   * The stage lives inside the `Dialog`, which renders through MUI's `Modal` - a *portal*.
   * The portal's children are not in the DOM on the commit that mounts this component, so a
   * `useRef` object read from a layout effect here is still `null`: measured, not assumed.
   * The measurement would then never happen, `stageSide` would stay 0, and `cropSizeFor`
   * would return the 280 fallback forever - the fix would have looked applied and changed
   * nothing. A callback ref fires when the node actually attaches, whenever that is.
   */
  const attachStage = useCallback(
    (el: HTMLDivElement | null) => {
      stageEl.current = el;
      if (el) measure();
    },
    [measure],
  );

  /**
   * Re-measure whenever the stage's width can have changed.
   *
   * `fullScreen` is a dependency, not just a resize listener's concern - crossing the
   * breakpoint drops the paper's 48px of margin and so changes the stage width, but React
   * re-renders *after* the resize event has been handled, so a listener alone reads the
   * pre-flip width and keeps it. The node does not remount across that flip, so the callback
   * ref above does not fire again either.
   *
   * A `resize` listener rather than a `ResizeObserver` because jsdom implements the former and
   * not the latter, and the stage's width is a function of the viewport's - there is no way
   * for it to change without one. react-easy-crop falls back the same way for the same reason.
   */
  useLayoutEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, [measure, fullScreen]);

  const handleCropComplete = useCallback((percentages: Area, pixels: Area) => {
    setArea(pixels);
    setPercent(percentages);
  }, []);

  /**
   * The photo's own dimensions, learned when it decodes. Only the natural size is kept: the
   * `width`/`height` the library reports alongside it are measured before it has resolved
   * `cover`, which is exactly the number that must not be trusted here.
   */
  const [natural, setNatural] = useState<{ naturalWidth: number; naturalHeight: number } | null>(
    null,
  );

  const handleMediaLoaded = useCallback((size: MediaSize) => {
    setNatural({ naturalWidth: size.naturalWidth, naturalHeight: size.naturalHeight });
  }, []);

  /**
   * Put a saved crop back, once, as soon as both facts it needs are in.
   *
   * Two facts, arriving in either order: the photo's natural size (an async decode) and the
   * stage's measured width (a callback ref, which is `0` until the portal attaches). Waiting
   * for both in an effect is why this is not done in the load handler - on a slow layout the
   * handler would run against a stage width of zero and `restoreCropFor` would decline, and
   * the crop would silently never be restored.
   *
   * Once only, guarded by a ref rather than by comparing state: after this fires the user owns
   * the crop, and a later re-measure (a rotate, or the mobile breakpoint flipping) must not
   * throw their adjustment away. react-easy-crop keeps the crop sensible across a resize by
   * itself.
   */
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current || !initialCrop || !natural || !(stageSide > 0)) return;

    const next = restoreCropFor(initialCrop, natural, stageSide);
    if (!next) return;

    restored.current = true;
    // oxlint-disable-next-line rh/set-state-in-effect
    setCrop(next.crop);
    // oxlint-disable-next-line rh/set-state-in-effect
    setZoom(next.zoom);
  }, [initialCrop, natural, stageSide]);

  const save = async () => {
    if (!area || !percent) return;
    setWorking(true);
    setError('');
    try {
      // Sequential rather than Promise.all, deliberately: both decode the same photo, and on a
      // phone a 12-megapixel decode twice at once is where the tab runs out of memory. This
      // runs behind a disabled button either way.
      const cropped = await cropToFile(file, area);
      const original = source === 'picked' ? await downscaleToFile(file) : null;

      onConfirm({ file: cropped, crop: percent, original });
    } catch {
      setError('That image could not be cropped. Try a different photo.');
      setWorking(false);
    }
  };

  return (
    <Dialog
      // Always open: the call site mounts this only while a photo is waiting, so closing is
      // an unmount. That is also what revokes the object URL.
      open
      // Named explicitly. MUI generates an `aria-labelledby` and expects `DialogTitle` to
      // carry the matching id; this dialog draws its own heading to hit the handoff's sizes,
      // so without this the attribute pointed at an id nothing had and the dialog was
      // announced with no name at all. Caught in a browser - the DOM says `aria-labelledby`
      // either way, and only resolving it reveals that it resolves to nothing.
      aria-labelledby={titleId}
      fullScreen={fullScreen}
      // Click-scrim-to-close, per the handoff - but not while the export is running, or the
      // dialog disappears and a File still arrives at the upload path a moment later.
      onClose={working ? undefined : onCancel}
      transitionDuration={180}
      slotProps={{
        backdrop: { sx: { backgroundColor: 'rgba(0,0,0,.4)' } },
        paper: {
          sx: {
            // Every one of these has to be conditional, not just the width: `sx` beats the
            // class MUI's `fullScreen` applies, so leaving the card's own margin and radius
            // in place would have produced a "full screen" dialog still inset by 24px with
            // rounded corners over the status bar.
            width: fullScreen ? '100%' : 384,
            maxWidth: '100%',
            m: fullScreen ? 0 : 3,
            borderRadius: fullScreen ? 0 : '16px',
            bgcolor: 'background.paper',
            boxShadow: (t) => (fullScreen ? 'none' : t.custom.depth2),
            overflow: 'hidden',
            // A phone screen is far taller than this dialog; centre the block rather than
            // stranding it against the top edge.
            display: 'flex',
            flexDirection: 'column',
            justifyContent: fullScreen ? 'center' : 'flex-start',
            '@keyframes avatarCropRise': {
              from: { opacity: 0, transform: 'translateY(12px)' },
              to: { opacity: 1, transform: 'none' },
            },
            animation: 'avatarCropRise .18s ease',
          },
        },
      }}
    >
      <Box sx={{ p: '20px 24px 12px' }}>
        {/* The heading names what is about to happen, and the two cases are genuinely
            different: one is finishing an upload, the other is changing a photo that is
            already the user's avatar. It is also the dialog's accessible name - see the
            `aria-labelledby` below, which pointed at nothing until #84's browser pass. */}
        <Typography id={titleId} component="h2" sx={{ fontSize: 19, fontWeight: 500 }}>
          {source === 'stored' ? 'Adjust your crop' : 'Crop your photo'}
        </Typography>
        <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: '3px' }}>
          Drag to reposition, pinch or slide to zoom.
        </Typography>
      </Box>

      <Box sx={{ px: '32px' }}>
        <Box
          data-testid="crop-stage"
          ref={attachStage}
          sx={{
            position: 'relative',
            width: STAGE_PX,
            maxWidth: '100%',
            // Square by ratio, never by a fixed height. `height: STAGE_PX` is only equal to
            // the width while `maxWidth: '100%'` lets the width reach 320 - below that the
            // stage silently became a rectangle holding a circle sized for a square, which is
            // half of why the ring came out flat-sided.
            aspectRatio: '1 / 1',
            // The stage caps at 320 while a full-screen paper can be wider, so without this
            // it sits off to one side.
            mx: 'auto',
            borderRadius: '12px',
            overflow: 'hidden',
            bgcolor: '#111',
            userSelect: 'none',
            // The three overrides described in the docblock. Emotion scopes them to this
            // stage, so nothing else on the page is affected.
            '& .reactEasyCrop_CropAreaGrid::before, & .reactEasyCrop_CropAreaGrid::after': {
              borderColor: 'rgba(255,255,255,.35)',
            },
          }}
        >
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            // Specified by the handoff, not a default: the rule-of-thirds overlay is part
            // of the design.
            showGrid
            // Derived from the measured stage, not the constant it used to be. See
            // `cropSizeFor`: on a 375px viewport this is 223, and pinning it at 280 is what
            // pushed the ring 8.4px past each edge of the box clipping it.
            cropSize={{ width: circleSide, height: circleSide }}
            // Load-bearing, and not the default. `cropSize` pins the circle at 280px, but the
            // library's default `objectFit="contain"` fits the *image* inside the 320px stage
            // - so a non-square photo at zoom 1 is narrower than the circle in one axis, and
            // the exported square gets anchored at the clamped edge instead of at what the
            // circle actually showed. A 1200x400 banner exported its left third while the
            // circle displayed a centred subject. `cover` guarantees the image always covers
            // the crop area, which is the only state in which what you see is what you get.
            objectFit="cover"
            // **Neither `initialCroppedAreaPercentages` nor `initialCroppedAreaPixels` is
            // passed, and that is deliberate.** The library applies them from `onMediaLoad`,
            // which measures the photo before anything has resolved `cover` into
            // `horizontal-cover` or `vertical-cover` - so a non-square photo is measured
            // letterboxed and every restore-and-save shrinks the crop by its aspect ratio. The
            // restore is done above instead, from `onMediaLoaded`, against the size the media
            // is actually rendered at. See `restoreCropFor`.
            onMediaLoaded={handleMediaLoaded}
            restrictPosition
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={handleCropComplete}
            style={{
              cropAreaStyle: {
                border: '2px solid rgba(255,255,255,.85)',
                // `color` is what the 9999em box-shadow paints with; this is the dim.
                color: 'rgba(0,0,0,.55)',
              },
            }}
          />
        </Box>
      </Box>

      <Stack
        direction="row"
        spacing="12px"
        sx={{ alignItems: 'center', justifyContent: 'center', p: '16px 32px 4px' }}
      >
        <ZoomOutIcon sx={{ fontSize: 19, color: 'text.secondary' }} />
        {/* Pinch, wheel and keyboard zoom all come from the library; the slider is the
            pointer affordance for a desktop mouse, which has none of them. Slider is not in
            the SwitchBase family, so `aria-label` belongs on the component itself - the v9
            slotProps rule does not apply here. */}
        <Slider
          value={zoom}
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={ZOOM_STEP}
          onChange={(_e, value) => setZoom(value as number)}
          color="primary"
          aria-label="Zoom"
          disabled={working}
        />
        <ZoomInIcon sx={{ fontSize: 21, color: 'text.secondary' }} />
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mx: '20px', fontSize: 13 }}>
          {error}
        </Alert>
      )}

      <Stack direction="row" spacing={1} sx={{ p: '14px 20px 18px' }}>
        {/* The handoff's Remove, ahead of the spacer so it sits apart from Cancel and Save
            rather than next to the button people press without reading. Drawn only when the
            call site supplied a handler - see `onRemove`. Not disabled while an export is
            running: removing is precisely the thing that makes that export pointless, and it
            is reversible, so there is nothing to protect the user from. */}
        {onRemove && (
          <Button
            color="error"
            onClick={onRemove}
            startIcon={<DeleteOutlinedIcon sx={{ fontSize: 18 }} />}
            sx={{ height: 38, minHeight: 38, borderRadius: '8px', px: '16px' }}
          >
            Remove photo
          </Button>
        )}
        <Box sx={{ flex: 1 }} />
        <Button
          onClick={onCancel}
          disabled={working}
          sx={{ height: 38, minHeight: 38, borderRadius: '8px', px: '16px' }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={save}
          disabled={!area || working}
          startIcon={<CheckIcon sx={{ fontSize: 18 }} />}
          sx={{ height: 38, minHeight: 38, borderRadius: '8px', px: '18px' }}
        >
          {working ? 'Saving…' : 'Save photo'}
        </Button>
      </Stack>
    </Dialog>
  );
}
