import type { ReactNode } from "react";
import { PageTransition } from "@/components/PageTransition";

// A template (unlike a layout) re-mounts on every navigation, which is what replays the transition.
export default function Template({ children }: { children: ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
