import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BUY_ME_COFFEE } from '../siteLinks.js';

/**
 * Labeled Buy me a coffee control — mug icon + exact label, styled as a
 * Vinyaas button (anchor with buttonVariants so it opens the BMC page).
 *
 * `variant` must be one of buttonVariants' own values — `default` is the
 * primary style. There is no `primary` variant: CVA silently matches nothing
 * for an unknown value, which renders the button with no fill at all.
 */
export function BuyMeCoffeeButton({ className, size = 'sm', variant = 'default' }) {
  return (
    <a
      href={BUY_ME_COFFEE.href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(buttonVariants({ variant, size }), 'gap-2', className)}
      aria-label={BUY_ME_COFFEE.label}
    >
      <img
        src={BUY_ME_COFFEE.iconSrc}
        alt=""
        width={14}
        height={20}
        className="h-3.5 w-auto"
        decoding="async"
      />
      <span>Buy me a coffee</span>
    </a>
  );
}
