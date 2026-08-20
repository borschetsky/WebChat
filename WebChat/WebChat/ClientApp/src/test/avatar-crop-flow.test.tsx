import React from 'react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SettingsDrawer from '@/features/settings/SettingsDrawer';
import { ThemeModeProvider } from '@/theme/ThemeModeProvider';

/**
 * The wiring, which is the part that decides whether the feature exists at all: pick -> crop
 * -> confirm has to end with a `File` at the same `onUploadAvatar` that already existed, and
 * cancel has to end with nothing.
 *
 * Two things are mocked, both because jsdom cannot do them, and neither of them is the
 * behaviour under test:
 *
 * - **`react-easy-crop`**, by a stub that reports a crop area on mount. The real component
 *   measures its container, and jsdom gives every element zero size, so `onCropComplete`
 *   never fires and Save is permanently disabled - the confirm half of the flow would be
 *   unreachable. That the real component mounts clean under jsdom is checked separately in
 *   `avatar-crop.test.tsx`, against no mock at all.
 * - **`cropToFile`**, which needs `createImageBitmap` and a real 2D canvas context. Its pure
 *   half, the geometry, is tested for real in `features/settings/cropImage.test.ts`.
 */
/** Every prop the dialog handed the cropper, most recent last. */
const cropperProps: Record<string, unknown>[] = [];

function StubCropper(props: { onCropComplete?: (a: unknown, b: unknown) => void }) {
  cropperProps.push(props as Record<string, unknown>);
  const { onCropComplete } = props;
  // In an effect, not in render. Calling it during render sets state in the parent while the
  // child is rendering, which React answers by re-rendering the child, forever - the first
  // version of this stub hung the whole suite rather than failing.
  React.useEffect(() => {
    onCropComplete?.(
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 40, y: 60, width: 400, height: 400 },
    );
  }, [onCropComplete]);
  return <div data-testid="stub-cropper" />;
}

// Only the default export is stubbed. `AvatarCropDialog` imports the library's own
// `getInitialCropFromCroppedAreaPercentages` for its restore maths, and replacing that would
// mean testing this file's arithmetic rather than the library's.
vi.mock('react-easy-crop', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-easy-crop')>();
  return { ...actual, default: StubCropper };
});

const CROPPED = new File([new Uint8Array([9])], 'portrait.jpg', { type: 'image/jpeg' });
const DOWNSCALED = new File([new Uint8Array([8])], 'portrait.jpg', { type: 'image/jpeg' });

// `downscaleToFile` is mocked for the same reason `cropToFile` is - both need
// `createImageBitmap` and a real 2D context, neither of which jsdom has. Their pure halves are
// tested for real in `features/settings/cropImage.test.ts`.
vi.mock('@/features/settings/cropImage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/settings/cropImage')>();
  return {
    ...actual,
    cropToFile: vi.fn(async () => CROPPED),
    downscaleToFile: vi.fn(async () => DOWNSCALED),
  };
});

beforeAll(() => {
  if (!URL.createObjectURL) {
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
  }
});

const photo = (name = 'portrait.jpg') =>
  new File([new Uint8Array([1, 2, 3])], name, { type: 'image/jpeg' });

/**
 * A profile with no photo at all, which is the state these tests are about: the camera button
 * opens the picker directly, with no menu in the way. The menu, and the re-crop flow behind
 * it, are in `avatar-recrop.test.tsx`.
 */
const renderDrawer = () => {
  const onUploadAvatar = vi.fn();
  render(
    <ThemeModeProvider>
      <SettingsDrawer
        open
        onClose={() => {}}
        profile={{ id: 'me', name: 'Maya', email: 'm@e.com', color: '#1976d2' }}
        members={[]}
        onSaveProfile={() => {}}
        onUploadAvatar={onUploadAvatar}
        onLoadOriginal={async () => null}
        // Never called here - this fixture has no photo, so neither the menu nor the dialog's
        // Remove button is drawn. Present because the drawer requires it: a caller that can
        // show a photo must be able to remove it (#89).
        onRemoveAvatar={() => {}}
        onLogout={() => {}}
        onOpenAdmin={() => {}}
        threadName={null}
        fullWidth={false}
      />
    </ThemeModeProvider>,
  );
  return onUploadAvatar;
};

const pick = (file: File) =>
  fireEvent.change(screen.getByLabelText('Change profile photo'), { target: { files: [file] } });

describe('picking a profile photo', () => {
  /**
   * A reproduction, in the strict sense: it fails against the code as it was before this
   * change, where picking a file called `onUploadAvatar` on the spot and there was no moment
   * at which anyone could decline. This is the behaviour the issue asks for, stated as a
   * test rather than as a description.
   */
  it('opens the cropper instead of uploading the original', async () => {
    const onUploadAvatar = renderDrawer();

    pick(photo());

    expect(await screen.findByText('Crop your photo')).toBeInTheDocument();
    expect(onUploadAvatar).not.toHaveBeenCalled();
  });

  /** The requirement in as many words: cancel must leave the existing avatar untouched. */
  it('cancelling closes the cropper and uploads nothing', async () => {
    const onUploadAvatar = renderDrawer();

    pick(photo());
    fireEvent.click(await screen.findByRole('button', { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByText('Crop your photo')).toBeNull());
    expect(onUploadAvatar).not.toHaveBeenCalled();
  });

  /**
   * The other end of the seam. What reaches `ChatApp.handleUploadAvatar` must be a `File`,
   * because that function does `FormData.append('file', it)` - a bare `Blob` would be posted
   * with no filename, and the server reads `form.Files[0]`. That is the whole reason this
   * lands with zero server change.
   */
  it('confirming hands a cropped File to the existing upload path', async () => {
    const onUploadAvatar = renderDrawer();

    pick(photo());
    fireEvent.click(await screen.findByRole('button', { name: /save photo/i }));

    await waitFor(() => expect(onUploadAvatar).toHaveBeenCalledTimes(1));

    const uploaded = onUploadAvatar.mock.calls[0][0].file;
    expect(uploaded).toBeInstanceOf(File);
    expect(uploaded.name).toBe('portrait.jpg');
    expect(uploaded.type).toBe('image/jpeg');
  });

  /**
   * #88's half of the same handoff: a freshly picked photo has never reached the server, so
   * the whole image goes up beside the square along with the rectangle that produced it.
   *
   * Without the original, "Adjust crop" can only ever mean "pick the file again" - which is
   * the state the feature exists to end. Without the rectangle it would open on the whole
   * photo every time, quietly losing the framing the user chose.
   */
  it('sends the whole photo and the crop rectangle alongside the square', async () => {
    const onUploadAvatar = renderDrawer();

    pick(photo());
    fireEvent.click(await screen.findByRole('button', { name: /save photo/i }));

    await waitFor(() => expect(onUploadAvatar).toHaveBeenCalledTimes(1));

    const { original, crop } = onUploadAvatar.mock.calls[0][0];
    expect(original).toBeInstanceOf(File);
    // The *percentage* rectangle, which is what the stub reported as the first argument to
    // onCropComplete. Sending croppedAreaPixels here - they arrive as two arguments of the
    // same shape - would store a rectangle that means nothing once the server re-encodes the
    // original at its own size cap.
    expect(crop).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });

  it('passes the cropper output through to the export, not the whole image', async () => {
    renderDrawer();
    const { cropToFile } = await import('@/features/settings/cropImage');

    pick(photo('holiday.jpg'));
    fireEvent.click(await screen.findByRole('button', { name: /save photo/i }));

    await waitFor(() => expect(cropToFile).toHaveBeenCalled());

    // The second argument is croppedAreaPixels as the cropper reported it. Passing the
    // *percentage* rectangle instead - they arrive as two arguments of the same shape - would
    // crop a 400x400 photo down to a 100x100 corner and look like a zoom bug.
    const [file, area] = vi.mocked(cropToFile).mock.calls.at(-1)!;
    expect(file.name).toBe('holiday.jpg');
    expect(area).toEqual({ x: 40, y: 60, width: 400, height: 400 });
  });

  it('closes the cropper once the upload has been handed off', async () => {
    renderDrawer();

    pick(photo());
    fireEvent.click(await screen.findByRole('button', { name: /save photo/i }));

    await waitFor(() => expect(screen.queryByText('Crop your photo')).toBeNull());
  });

  /**
   * What the dialog asks the library for. A guard, not a reproduction - but the only check
   * available anywhere in this suite for the round mask, the ring, the thirds grid and the
   * 280 px circle, because react-easy-crop draws none of those until it has measured a
   * loaded image and jsdom never loads one. Getting `cropShape` or `showGrid` wrong would be
   * invisible to every other test here and visible immediately in a browser.
   */
  it('configures the cropper the way the handoff specifies', async () => {
    renderDrawer();
    cropperProps.length = 0;

    pick(photo());
    await screen.findByText('Crop your photo');

    const props = cropperProps.at(-1)!;
    expect(props.cropShape).toBe('round');
    expect(props.showGrid).toBe(true);
    expect(props.aspect).toBe(1);
    expect(props.restrictPosition).toBe(true);

    // Not cosmetic, and not the library's default. `cropSize` pins the circle at 280px while
    // the default `objectFit="contain"` fits the image to the 320px stage, so a non-square
    // photo at zoom 1 does not cover the circle and the exported square is anchored at the
    // clamped edge rather than at what was framed - a 1200x400 banner exports its left third.
    // Invisible in every other test here, because jsdom lays nothing out, and easy to miss in
    // a browser too unless the test image is deliberately non-square.
    expect(props.objectFit).toBe('cover');
    // The *unmeasured* fallback, which is what jsdom always produces: it lays nothing out, so
    // the stage reports a width of 0 and `cropSizeFor` returns the handoff's 280. That this
    // still reads 280 after the mobile fix is the point - the desktop frame is unchanged.
    expect(props.cropSize).toEqual({ width: 280, height: 280 });
    expect(props.minZoom).toBe(1);
    expect(props.maxZoom).toBe(3);
  });

  /**
   * The reproduction, driven through the real call path rather than the dialog alone.
   *
   * A 263px stage is what a 375px iPhone SE actually produces, measured in a browser. Against
   * the code as it was, the cropper is handed a flat 280 regardless - 8.4px wider than the box
   * clipping it on each side - which is the flat-sided ring in the report.
   *
   * jsdom cannot show the clipping; what it can show is the cropper being *told* a size its
   * container cannot hold, which is the link that causes it.
   */
  it('asks for a circle the stage can actually contain when the viewport is narrow', async () => {
    const stageWidth = 263.2;
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        const w = this.dataset?.testid === 'crop-stage' ? stageWidth : 0;
        return { width: w, height: w, top: 0, left: 0, right: w, bottom: w, x: 0, y: 0 } as DOMRect;
      });

    try {
      renderDrawer();
      cropperProps.length = 0;

      pick(photo());
      await screen.findByText('Crop your photo');

      const { width, height } = cropperProps.at(-1)!.cropSize as { width: number; height: number };

      expect(width).toBeLessThanOrEqual(Math.round(stageWidth));
      expect(width).toBe(223);
      // Still square. Shrinking one axis would export a stretched avatar, which is the same
      // failure `sourceRectFor` clamps by moving rather than shortening.
      expect(height).toBe(width);
    } finally {
      rect.mockRestore();
    }
  });

  it('starts every photo at 1x in the middle', async () => {
    renderDrawer();
    cropperProps.length = 0;

    pick(photo());
    await screen.findByText('Crop your photo');

    const props = cropperProps.at(-1)!;
    expect(props.zoom).toBe(1);
    expect(props.crop).toEqual({ x: 0, y: 0 });
  });
});
