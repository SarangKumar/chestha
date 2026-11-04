import Link from 'next/link';

/**
 * The website's one button.
 *
 * The extension builds its buttons with `class-variance-authority`; this app
 * does not carry that dependency and does not need it for three variants. The
 * shapes and tokens match the extension's deliberately — the two apps share a
 * palette, so a control that looked different here would read as a different
 * product.
 */
/**
 * The names and the look match the extension's `buttonVariants`, so a control
 * does not change character between the two apps. `danger` carries the warning
 * in the label rather than in a fill — a destructive action should be legible,
 * not loud.
 */
const VARIANTS = {
  default: 'bg-accent text-on-accent hover:opacity-90',
  outline: 'border border-line bg-raised text-ink hover:bg-hover',
  ghost: 'text-ink-muted hover:bg-hover hover:text-ink',
  danger: 'border border-line text-danger hover:bg-danger-soft',
};

/**
 * Size carries the type role too, rather than each caller picking one.
 * `sm` is chrome — headers, toolbars, inline actions — and sits at the meta
 * role so a bar of controls reads as chrome rather than as content. `lg` is a
 * page's own call to action and stays at the card role.
 */
const SIZES = {
  sm: 'h-8 px-3 text-meta',
  lg: 'h-10 px-6 text-card',
  'icon-sm': 'size-8',
};

export function buttonClass({ variant = 'default', size = 'sm', className = '' } = {}) {
  return [
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-control font-medium',
    'whitespace-nowrap transition-colors duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
    VARIANTS[variant] ?? VARIANTS.default,
    SIZES[size] ?? SIZES.sm,
    className,
  ].filter(Boolean).join(' ');
}

export function Button({ variant, size, className, href, external, children, ...rest }) {
  const classes = buttonClass({ variant, size, className });

  if (href) {
    // An external link must not go through next/link: it would prefetch an
    // origin we do not control, and client-side routing cannot leave the app.
    if (external) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className={classes} {...rest}>
          {children}
        </a>
      );
    }
    return <Link href={href} className={classes} {...rest}>{children}</Link>;
  }

  return <button type="button" className={classes} {...rest}>{children}</button>;
}
