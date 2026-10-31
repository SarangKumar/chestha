/**
 * Product mark from /public. Uses a plain img so the website and extension
 * share the same asset without a Next/Image dependency.
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
