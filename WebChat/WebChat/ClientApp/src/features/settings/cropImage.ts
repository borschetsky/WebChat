import type { Area } from 'react-easy-crop';

/**
 * Turning react-easy-crop's output into an uploadable file.
 *
 * The library never produces an image. `onCropComplete` hands back `croppedAreaPixels` - a
 * rectangle in the *source image's own pixels* - and everything below is what turns that
 * into bytes. The geometry is deliberately split out of the drawing so it can be tested
 * without a canvas: `sourceRectFor` is pure, and it is the part most likely to be subtly
 * wrong.
 */

/**
 * Longest edge of the exported square.
 *
 * The server re-encodes every upload down to `AvatarOptions.MaxDimension` (256) anyway, so
 * anything larger is bytes on the wire for nothing. 512 is deliberately twice that: it
 * leaves the server free to raise its cap without the client silently becoming the limiter,
 * and it is still small enough that a PNG stays far inside the 5 MB upload limit.
 */
export const MAX_EXPORT_PX = 512;

/**
 * JPEG at 0.92, falling back to PNG - and the fallback is not defensive habit, it settles a
 * question the research note explicitly could not.
 *
 * `WriteHelper.GetImageFormat` accepts a JPEG **only** when its first four bytes are
 * FF D8 FF E0 (JFIF APP0) or FF D8 FF E1 (EXIF APP1). Every major engine is *believed* to
 * emit a JFIF APP0 segment from `canvas.toBlob('image/jpeg')`, but nothing specifies it, so
 * a browser emitting a bare FF D8 FF DB would have its upload refused as "Invalid image
 * file" - on one browser, and on no machine anybody develops on. Rather than trust it or
 * widen the server's gate, the bytes are *checked* and a PNG is encoded instead when they
 * do not match. The check is four bytes and the fallback almost certainly never runs.
 *
 * PNG is not the default because it is not free downstream: `AvatarImageProcessor` keeps a
 * PNG as a PNG (`keepAlpha`, to preserve transparency) and only re-encodes everything else
 * to JPEG q82. So exporting PNG unconditionally would silently make every stored avatar
 * several times larger - on an R2 free tier `AvatarOptions` reasons about in units of
 * "3,500 avatars vs 200,000". A crop of a photo has no transparency to preserve anyway.
 *
 * 0.92 rather than the server's 82: this is an intermediate, and the server re-encodes after
 * it, so the two quality losses compound.
 */
export const JPEG_QUALITY = 0.92;

/**
 * Longest edge of the **original** kept alongside the crop, so it can be re-cropped later
 * (#88).
 *
 * Downscaled here rather than posted untouched, and that is not tidiness. Before #84 the raw
 * photo went to the server and `Avatars:MaxUploadBytes` (5 MB) was a limit real phone photos
 * hit; #84 accidentally retired that problem by only ever posting a ~30 kB crop. Attaching the
 * raw file again would bring it straight back, and now with two files in one body. A canvas
 * export at 1024 is ~90 kB, so the whole request stays small and bounded.
 *
 * The server re-encodes to `Avatars:OriginalMaxDimension` regardless - client bytes are never
 * trusted - so this is a wire budget, not the authority. Matching the two numbers just means
 * the server has nothing to shrink.
 */
export const ORIGINAL_MAX_PX = 1024;

/** The square of source pixels to read, and the square of output pixels to write. */
export type SourceRect = {
  /** Left edge in source pixels. */
  sx: number;
  /** Top edge in source pixels. */
  sy: number;
  /** Edge length in source pixels. Square, because the crop is `aspect={1}`. */
  side: number;
  /** Edge length of the exported canvas. Equal to `side` unless it was capped. */
  size: number;
};

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);

/**
 * Where to read from, and how big to write.
 *
 * `restrictPosition` keeps the crop window inside the image, so in practice the rectangle
 * arrives in bounds - but rounding sits right on the edge, and a rectangle that runs one
 * pixel past the right edge draws a transparent stripe rather than throwing. So it is
 * clamped here, and the clamping **moves the square rather than shrinking it**: shortening
 * one edge would silently make the export non-square and the avatar would come out
 * stretched, which is exactly the kind of bug that is invisible until someone's face is
 * wrong.
 *
 * @param area  `croppedAreaPixels` from `onCropComplete`, in source-image pixels.
 * @param image The decoded image's own dimensions.
 */
export function sourceRectFor(
  area: Area,
  image: { width: number; height: number },
  maxExport: number = MAX_EXPORT_PX,
): SourceRect {
  if (!(image.width > 0) || !(image.height > 0)) {
    throw new Error('Cannot crop an image with no dimensions.');
  }

  // One number, not two: the crop is square by construction (aspect={1}), and taking the
  // smaller edge means a rectangle that somehow arrived slightly off-square is trimmed to a
  // square rather than exported as one.
  const side = Math.max(
    1,
    Math.min(Math.round(area.width), Math.round(area.height), image.width, image.height),
  );

  return {
    sx: clamp(Math.round(area.x), 0, image.width - side),
    sy: clamp(Math.round(area.y), 0, image.height - side),
    side,
    // Never upscale. A 90 px crop exports at 90 px; only a crop larger than the cap is
    // reduced, and the server reduces it again.
    size: Math.min(side, maxExport),
  };
}

/**
 * `photo.heic` -> `photo.jpg`. Cosmetic only.
 *
 * The server derives the stored extension from the magic bytes, not from this name - that
 * was fixed when the extension being trusted from the upload turned out to be a stored-XSS
 * vector. It still gets set correctly so a log line or a dev-tools row is not misleading.
 */
export function croppedFileName(original: string, extension: string): string {
  const base = original.replace(/\.[^./\\]*$/, '');
  return `${base || 'avatar'}.${extension}`;
}

/**
 * Would `WriteHelper.GetImageFormat` call these bytes a JPEG?
 *
 * Deliberately the server's rule and not the general one: a JPEG legitimately starts
 * FF D8 FF DB, and this returns false for it, because the server does. Written as a
 * predicate over the first four bytes so it can be tested against every byte pattern that
 * matters without a canvas or a browser.
 */
export function isServerAcceptableJpeg(head: Uint8Array): boolean {
  return (
    head.length >= 4 &&
    head[0] === 0xff &&
    head[1] === 0xd8 &&
    head[2] === 0xff &&
    (head[3] === 0xe0 || head[3] === 0xe1)
  );
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('The browser could not encode the crop.')),
      type,
      quality,
    );
  });

/**
 * Decode, cut out the circle's bounding square, and hand back a `File`.
 *
 * Decoding goes through `createImageBitmap` rather than `new Image()` on purpose. Drawing an
 * `HTMLImageElement` with `drawImage` is **formally unspecified** with respect to EXIF
 * orientation (whatwg/html#10492 and w3c/csswg-drafts#4666 are both still open); every
 * engine honours it in practice, but "in practice" is how a rotated phone photo ends up
 * previewing upright and exporting on its side. `createImageBitmap` defaults
 * `imageOrientation` to `from-image`, which is also what the preview's `<img>` does, so the
 * two provably agree. The server's `AutoOrient()` then has nothing left to do.
 *
 * There is no `new Image()` fallback: a second decode path is a second chance for preview
 * and export to disagree, and `createImageBitmap` has been available in every engine this
 * app's browserslist covers for years.
 *
 * The result is a `File`, not a `Blob`, because `ChatApp.handleUploadAvatar` appends it to a
 * `FormData` - a bare `Blob` would be posted as `blob` with no filename.
 */
export async function cropToFile(file: File, area: Area): Promise<File> {
  if (typeof createImageBitmap !== 'function') {
    throw new Error('This browser cannot decode the image for cropping.');
  }

  const bitmap = await createImageBitmap(file);
  try {
    const rect = sourceRectFor(area, bitmap);

    const canvas = document.createElement('canvas');
    canvas.width = rect.size;
    canvas.height = rect.size;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('The browser could not open a canvas to crop with.');

    // Matte the canvas white before drawing, because the default export is JPEG and JPEG has
    // no alpha. An unfilled canvas starts fully transparent, and every transparent source
    // pixel then encodes as pure **black** - a logo on a transparent PNG arrives as a black
    // square. The server makes it permanent: it only preserves alpha when the *decoded* format
    // is PNG, so a JPEG upload is re-encoded and the original is gone.
    //
    // White rather than the theme background: the avatar is drawn on both light and dark
    // surfaces, so there is no single correct colour to bake in, and white is what every other
    // image editor mattes to.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.size, rect.size);

    // One draw with a source rect. No rotation: an avatar crop does not need it, and
    // dropping it is what collapses the library's 67-line docs helper to this.
    ctx.drawImage(bitmap, rect.sx, rect.sy, rect.side, rect.side, 0, 0, rect.size, rect.size);

    return encodeCanvas(canvas, file.name);
  } finally {
    bitmap.close();
  }
}

/**
 * Encode a canvas as JPEG, falling back to PNG when this browser's JPEG header is one the
 * server refuses.
 *
 * Extracted when `downscaleToFile` arrived rather than duplicated, because the rule it
 * encodes is the *server's* magic-byte gate: two copies would be two chances for one of them
 * to widen to a general "is this a JPEG" check and start posting files the server rejects as
 * "Invalid image file", on one browser, on nobody's development machine.
 */
async function encodeCanvas(canvas: HTMLCanvasElement, sourceName: string): Promise<File> {
  const jpeg = await toBlob(canvas, 'image/jpeg', JPEG_QUALITY);
  const head = new Uint8Array(await jpeg.slice(0, 4).arrayBuffer());
  if (isServerAcceptableJpeg(head)) {
    return new File([jpeg], croppedFileName(sourceName, 'jpg'), { type: 'image/jpeg' });
  }

  // This browser's JPEG encoder emits a header the server refuses. Rather than upload
  // something that will come back "Invalid image file", encode a PNG, whose signature is
  // fixed. See the JPEG_QUALITY docblock for why this is not simply the default.
  const png = await toBlob(canvas, 'image/png');
  return new File([png], croppedFileName(sourceName, 'png'), { type: 'image/png' });
}

/**
 * The size to draw a photo at so its longest edge is at most `max`, preserving aspect ratio
 * and **never upscaling**.
 *
 * Pure, and split out for the same reason `sourceRectFor` is: it is the part where being
 * wrong is quiet. Upscaling would inflate a small photo into a blurry one and cost bytes for
 * pixels that were never there, and getting the aspect ratio wrong would store an original
 * that re-crops to a stretched face.
 */
export function downscaleSizeFor(
  width: number,
  height: number,
  max: number = ORIGINAL_MAX_PX,
): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) {
    throw new Error('Cannot resize an image with no dimensions.');
  }

  const longest = Math.max(width, height);
  if (longest <= max) {
    return { width: Math.round(width), height: Math.round(height) };
  }

  const scale = max / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * The whole photo, re-encoded small enough to post alongside the crop - the "original" of
 * #88.
 *
 * Deliberately produced from the same decode path as `cropToFile`: `createImageBitmap`
 * defaults `imageOrientation` to `from-image`, so an EXIF-rotated phone photo is stored
 * upright and the crop percentages saved against the preview still mean the same thing when
 * the original is re-opened. A `new Image()` here would be a second decode path and a second
 * chance for the two to disagree about which way up the photo is - and the disagreement would
 * only show on re-crop, long after the upload that caused it.
 */
export async function downscaleToFile(file: File, max: number = ORIGINAL_MAX_PX): Promise<File> {
  if (typeof createImageBitmap !== 'function') {
    throw new Error('This browser cannot decode the image for cropping.');
  }

  const bitmap = await createImageBitmap(file);
  try {
    const size = downscaleSizeFor(bitmap.width, bitmap.height, max);

    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('The browser could not open a canvas to crop with.');

    // Same white matte as the crop, and for the same reason: the export is JPEG, JPEG has no
    // alpha, and an unfilled canvas encodes every transparent pixel as pure black.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);

    return encodeCanvas(canvas, file.name);
  } finally {
    bitmap.close();
  }
}
