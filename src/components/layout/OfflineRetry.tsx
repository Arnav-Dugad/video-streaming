'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';

/** Retries the last navigation, and does it automatically the moment the
 *  browser reports the connection is back — nobody should have to notice
 *  they are online again and then press a button about it. */
export function OfflineRetry() {
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const onOnline = () => { setRetrying(true); window.location.reload(); };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  return (
    <Button
      onClick={() => { setRetrying(true); window.location.reload(); }}
      loading={retrying}
      size="md"
    >
      Try again
    </Button>
  );
}
