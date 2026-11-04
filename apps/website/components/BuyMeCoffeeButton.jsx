import { BUY_ME_COFFEE } from '@chestha/core';
import { buttonClass } from './ui/Button';

/**
 * Labelled Buy me a coffee control — mug mark plus the exact label. An anchor
 * rather than a button, because it goes somewhere.
 */
export function BuyMeCoffeeButton({ className = '', size = 'sm', variant = 'default' }) {
  return (
    <a
      href={BUY_ME_COFFEE.href}
      target="_blank"
      rel="noopener noreferrer"
      className={buttonClass({ variant, size, className })}
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
