import { useEffect, useState } from 'react';

/**
 * True only AFTER the component has mounted on the client.
 *
 * SSR and the first hydration frame cannot read client-only state (localStorage-backed auth),
 * so any UI that branches on such state must wait for this to flip true before rendering a
 * terminal state — otherwise the SSR default (e.g. "logged out") paints for one frame and then
 * swaps, flashing the wrong UI. Returns false on the server and the first client render, true
 * thereafter (the effect runs only on the client, post-hydration).
 */
export function useHasMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}
