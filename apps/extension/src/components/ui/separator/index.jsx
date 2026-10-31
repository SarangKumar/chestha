import React from "react";

import { cn } from "@/lib/utils";

export function Separator({
  orientation = "horizontal",
  className,
  ref,
  ...props
}) {
  if (orientation === "vertical") {
    return (
      <div
        ref={ref}
        {...props}
        role="separator"
        aria-orientation="vertical"
        className={cn("bg-border inline-block h-4 w-px shrink-0", className)}
      />
    );
  }

  return (
    <hr
      {...props}
      ref={ref}
      className={cn("bg-border my-0 h-px w-full shrink-0 border-0", className)}
    />
  );
}
