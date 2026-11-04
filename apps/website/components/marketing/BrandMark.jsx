/**
 * Product mark from /public. A plain `img` rather than `next/image` so the
 * website and the extension render the identical markup from the identical
 * asset — the mark appears at four sizes across both apps and is not worth a
 * layout-shifting optimisation pass.
 */
export function BrandMark({ className = 'size-7', alt = 'Chestha', width = 28, height = 28 }) {
  return (
    <img
      src="/icon-mark-128.png"
      alt={alt}
      width={width}
      height={height}
      className={className}
      decoding="async"
    />
  );
}
