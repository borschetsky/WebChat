import { describe, it, expect, vi } from 'vitest';
import {
  MAX_EXPORT_PX,
  ORIGINAL_MAX_PX,
  croppedFileName,
  downscaleSizeFor,
  isServerAcceptableJpeg,
  sourceRectFor,
} from '@/features/settings/cropImage';

/**
 * These are specification tests, not regression reproductions - the feature is new, so there
 * is no shipped bug for them to fail against. What they do buy is that each one fails against
 * a *plausible* wrong implementation, which is the reason the geometry was split out of the
 * drawing in the first place: `sourceRectFor` is the only part of the export that can be
 * checked without a canvas, and it is the part where being one rounding away from correct
 * produces a face that is off-centre or squashed rather than an error anyone would see.
 *
 * Each test names the wrong implementation it rules out.
 */
describe('sourceRectFor', () => {
  const area = (x: number, y: number, size: number) => ({ x, y, width: size, height: size });

  it('passes an in-bounds crop straight through', () => {
    expect(sourceRectFor(area(100, 50, 400), { width: 1000, height: 800 })).toEqual({
      sx: 100,
      sy: 50,
      side: 400,
      size: 400,
    });
  });

  it('rounds fractional coordinates rather than passing them to drawImage', () => {
    // croppedAreaPixels is derived from a CSS-pixel transform, so it arrives fractional far
    // more often than not. Rules out passing area.x/area.width through untouched, which
    // resamples on a half-pixel boundary and softens the result.
    expect(sourceRectFor(area(100.4, 50.6, 399.5), { width: 1000, height: 800 })).toEqual({
      sx: 100,
      sy: 51,
      side: 400,
      size: 400,
    });
  });

  it('clamps a negative origin to zero', () => {
    // Rules out trusting restrictPosition absolutely: a negative x draws a transparent
    // stripe down the side of the avatar instead of throwing.
    const rect = sourceRectFor(area(-12, -8, 300), { width: 1000, height: 800 });
    expect(rect.sx).toBe(0);
    expect(rect.sy).toBe(0);
    expect(rect.side).toBe(300);
  });

  it('shifts a crop that overruns the right edge back inside, keeping it square', () => {
    // This is the one that matters. The naive fix is to shorten the rectangle to the space
    // that is left - which is not square any more, so drawImage stretches it into the square
    // canvas and the face comes out wide. Moving it keeps the aspect.
    const rect = sourceRectFor(area(900, 0, 300), { width: 1000, height: 800 });
    expect(rect).toEqual({ sx: 700, sy: 0, side: 300, size: 300 });
  });

  it('shifts a crop that overruns the bottom edge back inside too', () => {
    const rect = sourceRectFor(area(0, 700, 300), { width: 1000, height: 800 });
    expect(rect).toEqual({ sx: 0, sy: 500, side: 300, size: 300 });
  });

  it('shrinks to the shorter edge when the crop is larger than the image', () => {
    // A 40x40 favicon dragged in: the crop cannot be 300 px because the image is not.
    const rect = sourceRectFor(area(0, 0, 300), { width: 120, height: 40 });
    expect(rect).toEqual({ sx: 0, sy: 0, side: 40, size: 40 });
  });

  it('trims an off-square rectangle to a square rather than exporting a rectangle', () => {
    // Rules out carrying width and height separately: one pixel of drift between them is
    // enough to make the export non-square, and the avatar is drawn in a circle where that
    // reads as a subtly squashed face.
    const rect = sourceRectFor(
      { x: 0, y: 0, width: 301, height: 300 },
      { width: 800, height: 800 },
    );
    expect(rect.side).toBe(300);
  });

  it('caps the exported canvas at MAX_EXPORT_PX while still reading the full crop', () => {
    // `side` stays large - all of those source pixels are read and downsampled. Rules out
    // capping the source rectangle instead of the destination, which would silently crop
    // tighter than the circle the user saw.
    const rect = sourceRectFor(area(0, 0, 2000), { width: 4000, height: 3000 });
    expect(rect.side).toBe(2000);
    expect(rect.size).toBe(MAX_EXPORT_PX);
  });

  it('never upscales a crop smaller than the cap', () => {
    const rect = sourceRectFor(area(0, 0, 90), { width: 400, height: 400 });
    expect(rect.size).toBe(90);
  });

  it('honours an explicit cap, so the 512 default is not baked into the maths', () => {
    expect(sourceRectFor(area(0, 0, 1000), { width: 2000, height: 2000 }, 256).size).toBe(256);
  });

  it('refuses an image with no dimensions instead of producing a zero-sized canvas', () => {
    // canvas.toBlob on a 0x0 canvas resolves with a blob the server then rejects, which
    // surfaces as "Avatar upload failed" with nothing pointing at the cause.
    expect(() => sourceRectFor(area(0, 0, 10), { width: 0, height: 100 })).toThrow(
      /no dimensions/i,
    );
  });
});

/**
 * The geometry of the stored original (#88).
 *
 * Same reasoning as `sourceRectFor`: this is the part of the downscale that can be checked
 * without a canvas, and it is the part where being wrong is quiet. An upscale would inflate a
 * small photo into a blurry one and spend bytes on pixels that were never there; a wrong
 * aspect ratio would store an original that re-crops to a stretched face, which nobody sees
 * until they adjust a crop weeks later.
 */
describe('downscaleSizeFor', () => {
  it('leaves a photo already inside the cap alone', () => {
    // Rules out scaling unconditionally, which would resample every small photo for nothing.
    expect(downscaleSizeFor(800, 600, 1024)).toEqual({ width: 800, height: 600 });
  });

  it('never upscales, even a very small photo', () => {
    expect(downscaleSizeFor(64, 48, 1024)).toEqual({ width: 64, height: 48 });
  });

  it('fits the longest edge to the cap and keeps the ratio', () => {
    expect(downscaleSizeFor(4000, 3000, 1024)).toEqual({ width: 1024, height: 768 });
    // Portrait: the *height* is the constrained edge. Rules out always scaling by width, which
    // would leave a tall photo well over the cap.
    expect(downscaleSizeFor(3000, 4000, 1024)).toEqual({ width: 768, height: 1024 });
  });

  it('rounds to whole pixels rather than handing a fraction to a canvas', () => {
    expect(downscaleSizeFor(1000, 333, 500)).toEqual({ width: 500, height: 167 });
  });

  it('never returns a zero edge for an extreme panorama', () => {
    // 8000x3 scales the short edge below half a pixel. A zero-height canvas encodes nothing.
    expect(downscaleSizeFor(8000, 3, 1024).height).toBeGreaterThanOrEqual(1);
  });

  it('refuses an image with no dimensions instead of producing a zero-sized canvas', () => {
    expect(() => downscaleSizeFor(0, 100)).toThrow('Cannot resize an image with no dimensions.');
    expect(() => downscaleSizeFor(100, 0)).toThrow('Cannot resize an image with no dimensions.');
  });

  it('defaults to the original cap, so 1024 is not baked into the maths', () => {
    expect(downscaleSizeFor(4000, 2000)).toEqual({
      width: ORIGINAL_MAX_PX,
      height: ORIGINAL_MAX_PX / 2,
    });
    // Twice the crop export, deliberately: the point of the original is that someone can zoom
    // into it and still get a usable square out.
    expect(ORIGINAL_MAX_PX).toBeGreaterThan(MAX_EXPORT_PX);
  });
});

describe('croppedFileName', () => {
  it('replaces the original extension', () => {
    expect(croppedFileName('IMG_0421.HEIC', 'jpg')).toBe('IMG_0421.jpg');
  });

  it('appends one when there is none', () => {
    expect(croppedFileName('portrait', 'png')).toBe('portrait.png');
  });

  it('leaves dots inside the name alone', () => {
    expect(croppedFileName('holiday.2026.summer.png', 'jpg')).toBe('holiday.2026.summer.jpg');
  });

  it('falls back to a name when the original is only an extension', () => {
    // A blank filename would be sent as the FormData part's filename and read back as an
    // empty string on the server.
    expect(croppedFileName('.jpg', 'jpg')).toBe('avatar.jpg');
  });
});

/**
 * The server's magic-byte gate, restated on the client so a crop is never uploaded in a form
 * `WriteHelper.GetImageFormat` will refuse.
 *
 * A guard rather than a reproduction, and the honest framing is that it does not settle the
 * research note's open question - it makes the answer not matter. Which four bytes a given
 * browser's JPEG encoder actually emits is still unverified here, because verifying it needs
 * a browser; what is verified is that both answers are handled.
 */
describe('isServerAcceptableJpeg', () => {
  const head = (...bytes: number[]) => new Uint8Array(bytes);

  it('accepts JFIF APP0, which is what browsers are believed to emit', () => {
    expect(isServerAcceptableJpeg(head(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
  });

  it('accepts EXIF APP1', () => {
    expect(isServerAcceptableJpeg(head(0xff, 0xd8, 0xff, 0xe1))).toBe(true);
  });

  it('rejects a bare FF D8 FF DB, which is a valid JPEG the server refuses', () => {
    // The whole reason the fallback exists. This is a real JPEG by every other definition;
    // it is only this server that will not take it.
    expect(isServerAcceptableJpeg(head(0xff, 0xd8, 0xff, 0xdb))).toBe(false);
  });

  it('rejects a PNG signature', () => {
    expect(isServerAcceptableJpeg(head(0x89, 0x50, 0x4e, 0x47))).toBe(false);
  });

  it('rejects a truncated header rather than reading past the end', () => {
    // blob.slice(0, 4) on a blob shorter than four bytes yields fewer; indexing past the end
    // gives undefined, and `undefined === 0xff` is false, so a naive version would happen to
    // work - until the day someone reorders the comparisons.
    expect(isServerAcceptableJpeg(head(0xff, 0xd8, 0xff))).toBe(false);
    expect(isServerAcceptableJpeg(head())).toBe(false);
  });
});

/**
 * The matte, which is the difference between a logo and a black square.
 *
 * The default export is JPEG and JPEG has no alpha. A freshly created canvas is fully
 * transparent, so without a fill every transparent source pixel encodes as pure black - and
 * the server makes that permanent, because it only preserves alpha when the *decoded* format
 * is PNG. A transparent-background PNG used to survive this path untouched; after #84 it goes
 * through a canvas, so the fill is a regression guard, not a nicety.
 *
 * jsdom has no 2D context, so what is asserted is the *order of operations* against a
 * recording stub: the fill must cover the whole canvas and must happen before the draw.
 * Asserting only that fillRect was called would pass if it ran afterwards and erased the photo.
 */
describe('cropToFile mattes the canvas before drawing', () => {
  it('fills the full canvas white first, then draws', async () => {
    const calls: string[] = [];
    const ctx = {
      set fillStyle(v: string) {
        calls.push(`fillStyle=${v}`);
      },
      fillRect: (x: number, y: number, w: number, h: number) =>
        calls.push(`fillRect(${x},${y},${w},${h})`),
      drawImage: () => calls.push('drawImage'),
    };

    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ctx,
      toBlob: (cb: (b: Blob) => void) => cb(new Blob([jpegBytes], { type: 'image/jpeg' })),
    };

    const createElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) =>
      tag === 'canvas' ? (canvas as unknown as HTMLCanvasElement) : createElement(tag),
    );
    vi.stubGlobal('createImageBitmap', async () => ({ width: 600, height: 600, close() {} }));

    const { cropToFile } = await import('@/features/settings/cropImage');
    const file = new File([new Uint8Array([1])], 'logo.png', { type: 'image/png' });
    await cropToFile(file, { x: 0, y: 0, width: 300, height: 300 });

    const fill = calls.findIndex((c) => c.startsWith('fillRect'));
    const draw = calls.indexOf('drawImage');

    expect(fill).toBeGreaterThanOrEqual(0);
    expect(draw).toBeGreaterThanOrEqual(0);
    // Order is the whole point: a fill after the draw would paint over the photo.
    expect(fill).toBeLessThan(draw);
    expect(calls).toContain('fillStyle=#ffffff');
    // The fill has to cover the whole canvas, not an arbitrary rectangle.
    expect(calls[fill]).toBe(`fillRect(0,0,${canvas.width},${canvas.height})`);

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});
