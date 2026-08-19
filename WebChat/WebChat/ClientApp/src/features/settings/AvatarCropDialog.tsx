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
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';
import { cropToFile } from '@/features/settings/cropImage';

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

export type AvatarCropDialogProps = {
  /**
   * The picked photo. Required, and the component is mounted only while there is one: the
   * call site keys on the file, so a different photo is a different component instance
   * rather than an effect resetting five pieces of state - which is the fix this repo keeps
   * deferring elsewhere, taken here because nothing forces the deferral.
   */
  file: File;
  /** Cancel. Nothing has been uploaded, so the current avatar is untouched. */
  onCancel: () => void;
  /** Confirm. Receives the cropped square as a `File`, ready for the existing upload path. */
  onConfirm: (cropped: File) => void;
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
 * The handoff also draws a **Remove** action. It is deliberately absent: nothing in the API
 * can clear an avatar. `AvatarsController` has only `upload`, `IUserService` has only
 * `AddAvatar`, and `UpdateProfile` writes `Email` and `Username` and nothing else - so the
 * button would have been a control with no endpoint behind it, which is the failure this
 * repo has just had twice. Reported rather than invented.
 *
 * The crop is applied client-side and the result is uploaded, rather than the original being
 * stored with crop metadata applied later. That is not a preference: `CachingAvatarUrlProvider`
 * memoises a presigned URL for 30 minutes and the redirect is served `max-age=300`, both safe
 * *only* because every upload writes a fresh `{Guid}.{ext}`. Re-deriving into a stable
 * per-user key would keep serving the old picture - most visibly to the person who just
 * re-cropped it. See docs/ctx/2026-08-09-stable-avatar-urls.md.
 *
 * Loaded through `React.lazy` from the settings drawer, so `react-easy-crop` lands in its own
 * chunk rather than in ChatApp's. Nothing outside this dialog imports the library.
 */
export default function AvatarCropDialog({ file, onCancel, onConfirm }: AvatarCropDialogProps) {
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

  const handleCropComplete = useCallback((_percent: Area, pixels: Area) => setArea(pixels), []);

  const save = async () => {
    if (!area) return;
    setWorking(true);
    setError('');
    try {
      onConfirm(await cropToFile(file, area));
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
        <Typography id={titleId} component="h2" sx={{ fontSize: 19, fontWeight: 500 }}>
          Crop your photo
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

      {/* The handoff's Remove button would sit here, ahead of the spacer. See the docblock:
          there is no endpoint that can clear an avatar, so it is not drawn. */}
      <Stack direction="row" spacing={1} sx={{ p: '14px 20px 18px' }}>
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
