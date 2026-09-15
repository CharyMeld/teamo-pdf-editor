import { useEffect, useState } from "react";

/** Real matchMedia-backed breakpoint hook — used to switch between the
 * desktop ribbon, the tablet toggle behavior, and the mobile compact
 * command system with actual conditional rendering, not CSS scaling. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const listener = () => setMatches(mql.matches);
    listener();
    mql.addEventListener("change", listener);
    return () => mql.removeEventListener("change", listener);
  }, [query]);

  return matches;
}

export const BREAKPOINTS = {
  tablet: "(max-width: 1023px)",
  mobile: "(max-width: 767px)",
} as const;
