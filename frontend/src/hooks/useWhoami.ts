import { useEffect, useState } from 'react';

import { type Whoami, loadWhoami } from '@/pages/accountsApi';

const apiOrigin = (
  import.meta.env.VITE_CATENCE_API_ORIGIN || window.location.origin
).replace(/\/$/, '');

/**
 * Nav-gating identity: `null` until the whoami request settles, and remains
 * `null` when the server has no Console accounts API. Admin-only navigation
 * renders solely from a loaded `role === 'admin'`.
 */
export function useWhoami(): Whoami | null {
  const [whoami, setWhoami] = useState<Whoami | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadWhoami(apiOrigin).then((outcome) => {
      if (!cancelled && outcome.ok) setWhoami(outcome.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return whoami;
}
