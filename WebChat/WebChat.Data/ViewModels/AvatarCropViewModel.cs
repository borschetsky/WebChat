using System;

namespace WebChat.Models.ViewModels
{
    /// <summary>
    /// A crop rectangle in **percentages of the original image**, which is react-easy-crop's
    /// <c>croppedArea</c> - the argument the client restores from with
    /// <c>initialCroppedAreaPercentages</c>.
    ///
    /// Not pixels. A pixel rectangle only means anything against the exact dimensions it was
    /// measured in, and the stored original is re-encoded at the server's own size cap, so a
    /// pixel rectangle would drift the crop by a scale factor on restore. Percentages survive
    /// that, and survive the cap being changed later.
    /// </summary>
    public class AvatarCropViewModel
    {
        public double X { get; set; }

        public double Y { get; set; }

        public double Width { get; set; }

        public double Height { get; set; }

        /// <summary>
        /// A rectangle built from four stored columns, or null unless all four are present.
        ///
        /// All-or-nothing on purpose: three of four is not a rectangle, and defaulting the
        /// missing one would restore a crop that silently differs from the one the avatar was
        /// actually cut with.
        /// </summary>
        public static AvatarCropViewModel From(double? x, double? y, double? width, double? height)
        {
            if (x == null || y == null || width == null || height == null)
            {
                return null;
            }

            return new AvatarCropViewModel
            {
                X = x.Value,
                Y = y.Value,
                Width = width.Value,
                Height = height.Value,
            };
        }

        /// <summary>
        /// Clamps four incoming numbers into a usable percentage rectangle, or returns null if
        /// they cannot be one.
        ///
        /// **Clamped rather than rejected**, because a crop is polish and the avatar is not: a
        /// rectangle a fraction of a percent out of range must not fail an upload that has
        /// already produced the right picture. Only genuinely unusable input - NaN, infinity, a
        /// zero or negative edge - gives up and stores nothing, which the client reads as "open
        /// the whole photo".
        /// </summary>
        public static AvatarCropViewModel Sanitized(double x, double y, double width, double height)
        {
            if (double.IsNaN(x) || double.IsNaN(y) || double.IsNaN(width) || double.IsNaN(height)
                || double.IsInfinity(x) || double.IsInfinity(y)
                || double.IsInfinity(width) || double.IsInfinity(height))
            {
                return null;
            }

            if (width <= 0 || height <= 0)
            {
                return null;
            }

            return new AvatarCropViewModel
            {
                X = Math.Clamp(x, 0, 100),
                Y = Math.Clamp(y, 0, 100),
                Width = Math.Clamp(width, 0, 100),
                Height = Math.Clamp(height, 0, 100),
            };
        }
    }
}
