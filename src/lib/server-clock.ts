'use client';

/* ==========================================================================
   A clock everyone in a room agrees on.

   Sync used to compare the host's `Date.now()` with the guest's: the host
   stamped `updatedAt` from its own clock, and the guest measured elapsed time
   from its own. Any skew between the two machines became sync error one for
   one — and consumer clocks routinely differ by seconds, so a "1.6s drift
   threshold" was meaningless against a 4s clock difference.

   Firestore's `serverTimestamp()` resolves on Google's clock, which gives
   every participant one shared reference. This tracks the offset between that
   clock and the local one.

   The estimator takes a running maximum of (serverTime - localReceiveTime)
   across samples. Every sample is biased low by however long the write took
   to propagate, so the *largest* observation is the one that travelled
   fastest — the closest to true skew. A mean would bake the average network
   latency permanently into the offset.
   ========================================================================== */

const SAMPLE_WINDOW = 12;

class ServerClock {
  private samples: number[] = [];

  /** Feed a server-stamped moment, with the local time it arrived. */
  observe(serverMillis: number, localMillis = Date.now()): void {
    if (!Number.isFinite(serverMillis) || serverMillis <= 0) return;
    this.samples.push(serverMillis - localMillis);
    if (this.samples.length > SAMPLE_WINDOW) this.samples.shift();
  }

  /** Local clock + this = server clock. Zero until the first sample lands,
   *  which degrades to the old same-clock behaviour rather than to nonsense. */
  get offset(): number {
    if (this.samples.length === 0) return 0;
    return Math.max(...this.samples);
  }

  /** Now, on the shared clock. */
  now(): number {
    return Date.now() + this.offset;
  }

  /** How confident the estimate is, in milliseconds of spread. Surfaced in
   *  the UI so a bad network is visible rather than mysterious. */
  get spread(): number {
    if (this.samples.length < 2) return 0;
    return Math.max(...this.samples) - Math.min(...this.samples);
  }

  get ready(): boolean {
    return this.samples.length > 0;
  }

  reset(): void {
    this.samples = [];
  }
}

/** One clock per room id. Rooms are independent, and a stale estimate from a
 *  room left an hour ago should not seed a new one. */
const clocks = new Map<string, ServerClock>();

export function serverClock(roomId: string): ServerClock {
  let clock = clocks.get(roomId);
  if (!clock) {
    clock = new ServerClock();
    clocks.set(roomId, clock);
  }
  return clock;
}

export function releaseClock(roomId: string): void {
  clocks.delete(roomId);
}
