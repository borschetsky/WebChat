import React from 'react';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SettingsDrawer from '@/features/settings/SettingsDrawer';
import { restoreCropFor } from '@/features/settings/AvatarCropDialog';
import { ThemeModeProvider } from '@/theme/ThemeModeProvider';

/**
 * Re-cropping the photo the user already has, without picking the file again - issue #88, and
 * the avatar menu the 2026-08-16 handoff specifies in front of it.
 *
 * The three claims worth testing here are all about *reachability*, which is where this repo
 * keeps losing features: the admin console answered every request while being unreachable from
 * a browser (#82), and #84's whole crop dialog shipped unwired. So these drive the drawer, not
 * the dialog - what is asserted is that a menu appears, that the item is in it, that clicking
 * it fetches the stored photo, and that confirming posts a crop *without* a new original.
 *
 * Mocks, all of them things jsdom cannot do and none of them the behaviour under test:
 * `react-easy-crop` (measures a container jsdom gives zero size), and `cropToFile` /
 * `downscaleToFile` (need `createImageBitmap` and a real 2D context).
 */
const cropperProps: Record<string, unknown>[] = [];

/**
 * The natural size the stub reports through `onMediaLoaded`.
 *
 * **3:4, and it must stay non-square.** The restore drift this file guards against is
 * arithmetically invisible on a square photo - `contain` and `cover` produce the same size -
 * so a square fixture here would pass against the bug. Same trap as #84's square colour grid,
 * which hid the `objectFit` bug it was chosen to exercise.
 */
const NATURAL = { naturalWidth: 768, naturalHeight: 1024 };

function StubCropper(props: {
  onCropComplete?: (a: unknown, b: unknown) => void;
  onMediaLoaded?: (size: unknown) => void;
}) {
  cropperProps.push(props as Record<string, unknown>);
  const { onCropComplete, onMediaLoaded } = props;
  React.useEffect(() => {
    onCropComplete?.(
      { x: 5, y: 10, width: 40, height: 40 },
      { x: 40, y: 60, width: 400, height: 400 },
    );
    // The real component emits this once the photo has decoded; jsdom loads no images, so the
    // stub stands in for the decode. It carries a *rendered* width and height too, which the
    // dialog must ignore - they are measured before the library resolves `objectFit`.
    onMediaLoaded?.({ width: 240, height: 320, ...NATURAL });
  }, [onCropComplete, onMediaLoaded]);
  return <div data-testid="stub-cropper" />;
}

// The default export is stubbed; the named helpers are the real ones, because
// `AvatarCropDialog` calls `getInitialCropFromCroppedAreaPercentages` for its own restore and
// mocking that away would test this file's arithmetic instead of the library's.
vi.mock('react-easy-crop', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-easy-crop')>();
  return { ...actual, default: StubCropper };
});

const CROPPED = new File([new Uint8Array([9])], 'photo.jpg', { type: 'image/jpeg' });
const DOWNSCALED = new File([new Uint8Array([8])], 'photo.jpg', { type: 'image/jpeg' });

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

beforeEach(() => {
  cropperProps.length = 0;
});

const STORED_CROP = { x: 12.5, y: 25, width: 50, height: 50 };

/** The photo the server hands back when Adjust crop is chosen. */
const stored = () => new File([new Uint8Array([7])], 'photo.jpg', { type: 'image/jpeg' });

type ProfileShape = {
  avatarFileName?: string | null;
  hasOriginalPhoto?: boolean;
  avatarCrop?: { x: number; y: number; width: number; height: number } | null;
};

const renderDrawer = (profile: ProfileShape = {}, original: File | null = stored()) => {
  const onUploadAvatar = vi.fn();
  const onLoadOriginal = vi.fn(async () => original);
  const onRemoveAvatar = vi.fn();

  render(
    <ThemeModeProvider>
      <SettingsDrawer
        open
        onClose={() => {}}
        profile={{
          id: 'me',
          name: 'Maya',
          email: 'm@e.com',
          color: '#1976d2',
          avatarFileName: 'current.jpg',
          hasOriginalPhoto: true,
          avatarCrop: STORED_CROP,
          ...profile,
        }}
        members={[]}
        onSaveProfile={() => {}}
        onUploadAvatar={onUploadAvatar}
        onLoadOriginal={onLoadOriginal}
        onRemoveAvatar={onRemoveAvatar}
        onLogout={() => {}}
        onOpenAdmin={() => {}}
        threadName={null}
        fullWidth={false}
      />
    </ThemeModeProvider>,
  );

  return { onUploadAvatar, onLoadOriginal, onRemoveAvatar };
};

const openMenu = () =>
  fireEvent.click(screen.getByRole('button', { name: /profile photo options/i }));

describe('the avatar menu', () => {
  it('offers Upload a new photo and Adjust crop when both can work', async () => {
    renderDrawer();
    openMenu();

    expect(
      await screen.findByRole('menuitem', { name: /upload a new photo/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /adjust crop/i })).toBeInTheDocument();
  });

  /**
   * The handoff's third item, which #88 could not ship because no endpoint could clear an
   * avatar. #89 added one, so this test - which used to pin the row's *absence* - now pins its
   * presence, its position (last) and that it is separated from the two constructive actions
   * by a divider, per the handoff.
   */
  it('offers Remove photo last, separated from the rest', async () => {
    renderDrawer();
    openMenu();

    const items = await screen.findAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual([
      'Upload a new photo',
      'Adjust crop',
      'Remove photo',
    ]);

    // The divider is the handoff's separation, and it belongs to the menu rather than to the
    // item - asserting on the item's own border would pass against a menu with no separator.
    expect(screen.getByRole('menu').querySelector('hr')).not.toBeNull();
  });

  /**
   * **This is the case #88 deliberately hid the menu for, and #89 changes.** Nothing backfills
   * an original, so every account that uploaded before #88 has none and Adjust crop cannot
   * work for them. With Remove in the world there are now two things they *can* do, so the
   * menu is drawn and only Adjust is missing from it - where hiding the menu entirely would
   * make Remove unreachable for exactly the accounts that have had a photo the longest.
   */
  it('is drawn for a photo with no stored original, minus Adjust crop', async () => {
    renderDrawer({ hasOriginalPhoto: false });
    openMenu();

    expect(
      await screen.findByRole('menuitem', { name: /upload a new photo/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /remove photo/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /adjust crop/i })).toBeNull();
  });

  /**
   * With no photo there is still nothing to choose between - Upload is the only thing that can
   * happen - so the button goes straight to the file picker rather than showing a one-item
   * menu in front of it.
   */
  it('is not drawn for someone with no photo at all', () => {
    renderDrawer({ avatarFileName: null, hasOriginalPhoto: false, avatarCrop: null });

    expect(screen.queryByRole('button', { name: /profile photo options/i })).toBeNull();
    expect(screen.getByRole('button', { name: /add a profile photo/i })).toBeInTheDocument();
  });

  /**
   * A server predating #88 sends no `hasOriginalPhoto` at all. The adapter turns that into
   * false, and this is the other end of that: absent must behave exactly like "there is none",
   * never like "probably yes".
   */
  it('treats a profile that says nothing about an original as having none', async () => {
    renderDrawer({ hasOriginalPhoto: undefined, avatarCrop: null });
    openMenu();

    await screen.findByRole('menuitem', { name: /upload a new photo/i });
    expect(screen.queryByRole('menuitem', { name: /adjust crop/i })).toBeNull();
  });
});

describe('adjusting an existing crop', () => {
  it('fetches the stored photo and opens the cropper on it', async () => {
    const { onLoadOriginal } = renderDrawer();

    openMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: /adjust crop/i }));

    expect(await screen.findByText('Adjust your crop')).toBeInTheDocument();
    expect(onLoadOriginal).toHaveBeenCalledTimes(1);
  });

  /**
   * The whole point of persisting a rectangle: the cropper reopens where the user left it
   * rather than on the whole photo - and it does so **through the dialog's own maths**, not
   * the library's.
   *
   * This is the wiring half of the drift fix; the arithmetic is proved in
   * `avatar-crop.test.tsx`. What is checked here is that the dialog listens for the decode,
   * measures the stage, and drives `crop` and `zoom` itself.
   */
  it('restores the saved rectangle itself, against the size the photo is rendered at', async () => {
    const stage = 320;
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        const w = this.dataset?.testid === 'crop-stage' ? stage : 0;
        return { width: w, height: w, top: 0, left: 0, right: w, bottom: w, x: 0, y: 0 } as DOMRect;
      });

    try {
      renderDrawer();
      openMenu();
      fireEvent.click(await screen.findByRole('menuitem', { name: /adjust crop/i }));
      await screen.findByText('Adjust your crop');

      const expected = restoreCropFor(STORED_CROP, NATURAL, stage)!;
      await waitFor(() => expect(cropperProps.at(-1)!.zoom).toBeCloseTo(expected.zoom, 6));

      const props = cropperProps.at(-1)!;
      // 280/320 * (100/50). Spelled out so this says something even if `restoreCropFor` is
      // the thing that broke.
      expect(props.zoom).toBeCloseTo(1.75, 6);
      expect(props.crop).toEqual(expected.crop);
    } finally {
      rect.mockRestore();
    }
  });

  /**
   * The regression guard for the drift itself.
   *
   * Handing the library `initialCroppedAreaPercentages` looks like the obvious way to do this
   * and is the thing that was wrong: it applies the rectangle from `onMediaLoad`, before
   * `objectFit="cover"` has resolved, so a non-square photo is measured letterboxed and every
   * untouched save shrinks the crop by its aspect ratio. If either prop comes back, this says
   * so.
   */
  it('never hands the library its own initial-crop props', async () => {
    renderDrawer();

    openMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: /adjust crop/i }));
    await screen.findByText('Adjust your crop');

    const props = cropperProps.at(-1)!;
    expect(props.initialCroppedAreaPercentages).toBeUndefined();
    expect(props.initialCroppedAreaPixels).toBeUndefined();
    // The replacement, which is how the dialog learns the photo's real dimensions.
    expect(typeof props.onMediaLoaded).toBe('function');
  });

  /**
   * The handoff puts Remove in two places, and this is the second one: the crop dialog's own
   * footer. Wired from the drawer, not from inside the dialog, because only the call site knows
   * whether there is an existing photo to remove - and it closes the dialog, since the thing it
   * was about to re-crop is going away.
   */
  it('offers Remove in the crop dialog too, and closes it', async () => {
    const { onRemoveAvatar } = renderDrawer();

    openMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: /adjust crop/i }));
    await screen.findByText('Adjust your crop');

    fireEvent.click(screen.getByRole('button', { name: /remove photo/i }));

    expect(onRemoveAvatar).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText('Adjust your crop')).toBeNull());
  });

  /**
   * Cropping a *first* photo has nothing to remove yet, so the dialog is handed no callback and
   * draws no button. Same rule as the menu one level up: a control is drawn where it can work.
   */
  it('draws no Remove in the dialog for a first photo', async () => {
    renderDrawer({ avatarFileName: null, hasOriginalPhoto: false, avatarCrop: null });

    fireEvent.change(screen.getByLabelText('Change profile photo'), {
      target: { files: [stored()] },
    });

    await screen.findByText('Crop your photo');
    expect(screen.queryByRole('button', { name: /remove/i })).toBeNull();
  });

  /**
   * A photo stored before any rectangle was recorded - or one whose crop failed validation
   * server-side - opens on the whole image at 1x rather than at a crop derived from nothing.
   */
  it('opens on the whole photo when there is no saved rectangle', async () => {
    renderDrawer({ avatarCrop: null });

    openMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: /adjust crop/i }));
    await screen.findByText('Adjust your crop');

    const props = cropperProps.at(-1)!;
    expect(props.zoom).toBe(1);
    expect(props.crop).toEqual({ x: 0, y: 0 });
  });

  /**
   * **The rule that is silent when broken.** The photo is already on the server, so a re-crop
   * must post the square and the rectangle and *no* original. Sending one would store a second
   * identical object and, worse, tell the server this is a replacement - which is the path
   * that deletes the original the user is still adjusting.
   */
  it('posts the new square and rectangle with no original attached', async () => {
    const { onUploadAvatar } = renderDrawer();

    openMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: /adjust crop/i }));
    fireEvent.click(await screen.findByRole('button', { name: /save photo/i }));

    await waitFor(() => expect(onUploadAvatar).toHaveBeenCalledTimes(1));

    const { file, crop, original } = onUploadAvatar.mock.calls[0][0];
    expect(file).toBeInstanceOf(File);
    expect(original).toBeNull();
    // The percentages the cropper reported, not the pixels.
    expect(crop).toEqual({ x: 5, y: 10, width: 40, height: 40 });
  });

  it('does not re-encode the stored photo it was handed', async () => {
    renderDrawer();
    const { downscaleToFile } = await import('@/features/settings/cropImage');

    openMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: /adjust crop/i }));
    fireEvent.click(await screen.findByRole('button', { name: /save photo/i }));

    await waitFor(() => expect(screen.queryByText('Adjust your crop')).toBeNull());
    expect(downscaleToFile).not.toHaveBeenCalled();
  });

  /**
   * A failed fetch must not open a cropper on nothing. The caller has already reported the
   * failure - the drawer's job is only to not make it worse.
   */
  it('opens nothing when the stored photo cannot be fetched', async () => {
    renderDrawer({}, null);

    openMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: /adjust crop/i }));

    await waitFor(() => expect(screen.queryByRole('menuitem')).toBeNull());
    expect(screen.queryByText('Adjust your crop')).toBeNull();
    expect(screen.queryByText('Crop your photo')).toBeNull();
  });

  /**
   * The other item on the menu still reaches the file input, which is no longer wrapped in a
   * `component="label"` - it is clicked programmatically now, and that is the sort of wiring
   * that silently stops working.
   */
  it('Upload a new photo still opens the file picker', async () => {
    renderDrawer();
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});

    try {
      openMenu();
      fireEvent.click(await screen.findByRole('menuitem', { name: /upload a new photo/i }));

      expect(click).toHaveBeenCalledTimes(1);
    } finally {
      click.mockRestore();
    }
  });

  /**
   * Picking a file from the menu is still a *new* photo: it has never reached the server, so
   * the original goes up with it and the saved rectangle must not be reused - percentages
   * measured against a different image are not stale, they are wrong.
   */
  it('a photo picked from the menu opens uncropped and brings its own original', async () => {
    const { onUploadAvatar } = renderDrawer();

    fireEvent.change(screen.getByLabelText('Change profile photo'), {
      target: { files: [new File([new Uint8Array([1])], 'new.jpg', { type: 'image/jpeg' })] },
    });

    await screen.findByText('Crop your photo');
    // 1x, dead centre - the saved rectangle belongs to the photo being replaced.
    expect(cropperProps.at(-1)!.zoom).toBe(1);
    expect(cropperProps.at(-1)!.crop).toEqual({ x: 0, y: 0 });

    fireEvent.click(screen.getByRole('button', { name: /save photo/i }));
    await waitFor(() => expect(onUploadAvatar).toHaveBeenCalledTimes(1));

    expect(onUploadAvatar.mock.calls[0][0].original).toBeInstanceOf(File);
  });
});
