import { ViewTransition, type ReactNode } from "react";

const DIR = { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" } as const;

export function PageSlide({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter={DIR} exit={DIR} default="none">
      {children}
    </ViewTransition>
  );
}
