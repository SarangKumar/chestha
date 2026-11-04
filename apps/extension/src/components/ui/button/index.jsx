import React from "react";

import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Every button in the app, in one definition.
 *
 * It used to be two. `components/ui.jsx` carried a second Button with a `tone`
 * prop and its own three sizes, and the workspace used that one while the
 * marketing chrome used this one. They disagreed on the thing it is worst to
 * disagree about: `size="sm"` meant h-7 in one file and h-8 in the other, so
 * two buttons side by side from different imports did not line up. That Button
 * is now a thin alias over these variants — see the note there for the tone
 * names it still accepts.
 *
 * **Two families of names live here on purpose.** `default`/`outline`/`ghost`/
 * `secondary`/`destructive`/`link` are the shadcn vocabulary the installed
 * components were generated against. `neutral`/`quiet`/`danger` are Chestha's
 * own tones, kept with their exact original class strings so the forty-odd
 * workspace call sites did not change appearance when they moved over. Where
 * the two genuinely mean the same thing they share one entry rather than two
 * that can drift.
 *
 * The trap to know about: `default` is the *solid accent* CTA, while the
 * workspace's old `tone="default"` was the quiet bordered button, which is
 * `neutral` here. The alias in ui.jsx translates it; do not "simplify" that
 * mapping away.
 *
 * Heights: default h-9 (matches Input), xs h-7, sm h-8, lg h-10. Icon sizes
 * are square. Every non-link variant shares the height for a given size —
 * borders stay inside the box (box-border) so outline and solid align.
 */
export const buttonVariants = cva(
  "inline-flex box-border shrink-0 cursor-pointer items-center justify-center rounded-control border border-transparent text-sm leading-none font-medium whitespace-nowrap transition-[color,background-color,border-color,transform] duration-200 ease-[cubic-bezier(0.22,1.25,0.36,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-px active:duration-75 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0",
  {
    variants: {
      variant: {
        // Primary keeps inverted label on hover (opacity only) so ink never matches fill.
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        // Soft hover: --color-accent is Chestha's solid CTA ink, so bg-accent +
        // text-accent-foreground would paint the same colour twice and hide the label.
        outline:
          "border-border bg-background text-foreground hover:bg-muted hover:text-foreground",
        ghost: "hover:bg-muted hover:text-foreground",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        // ── Chestha tones, exact class strings from the old ui.jsx Button ──
        // The standard workspace button: a bordered surface that sits on the
        // page rather than claiming to be the action.
        neutral: "border-line bg-raised text-ink hover:bg-hover",
        // Lowest emphasis — toolbars and repeated row actions, where a border
        // per control would turn a list into a grid.
        quiet:
          "border-transparent bg-transparent text-ink-muted hover:bg-hover hover:text-ink",
        // Destructive, but not loud: the label carries the warning, not a fill.
        danger:
          "border-line bg-transparent text-danger hover:bg-danger-soft",
        link: "h-auto min-h-0 border-transparent bg-transparent px-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 min-h-9 max-h-9 px-4",
        xs: "h-7 min-h-7 max-h-7 px-2 text-xs",
        sm: "h-8 min-h-8 max-h-8 px-3",
        lg: "h-10 min-h-10 max-h-10 px-6",
        icon: "size-9 min-h-9 min-w-9 max-h-9 max-w-9 p-0",
        "icon-xs": "size-7 min-h-7 min-w-7 max-h-7 max-w-7 p-0",
        "icon-sm": "size-8 min-h-8 min-w-8 max-h-8 max-w-8 p-0",
        "icon-lg": "size-10 min-h-10 min-w-10 max-h-10 max-w-10 p-0",
      },
    },
    compoundVariants: [
      {
        variant: "link",
        size: "default",
        class: "h-auto min-h-0 max-h-none px-0",
      },
      {
        variant: "link",
        size: "xs",
        class: "h-auto min-h-0 max-h-none px-0",
      },
      {
        variant: "link",
        size: "sm",
        class: "h-auto min-h-0 max-h-none px-0",
      },
      {
        variant: "link",
        size: "lg",
        class: "h-auto min-h-0 max-h-none px-0",
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export const Button = React.forwardRef(function Button(
  { className, children, variant, size, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {children}
    </button>
  );
});
Button.displayName = "Button";
