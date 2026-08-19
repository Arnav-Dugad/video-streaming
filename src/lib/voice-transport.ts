'use client';

import {
  addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, query, setDoc, where,
} from 'firebase/firestore';

import { db } from './firebase';

/* ==========================================================================
   How voice talks to the room, kept separate from what it says.

   The mesh below this line is pure WebRTC state machine: offers, answers,
   candidates, who calls whom. None of that has anything to do with Firestore,
   and tangling the two together made the whole thing untestable — the only
   way to exercise a connection race was to deploy and hope.

   With signalling behind an interface, the mesh can be driven by an in-memory
   transport that delivers messages in a deliberately hostile order, which is
   how the deadlock that shipped last time was found.
   ========================================================================== */

export interface PresenceRecord {
  uid: string;
  /** Changes on every join, so a reload is distinguishable from a no-op. */
  session: string;
  muted: boolean;
  /** Last heartbeat, in the writer's own clock. Only ever compared against
   *  other heartbeats from the same writer, so skew between machines does not
   *  matter — what matters is that it keeps moving. */
  at: number;
}

export interface Envelope {
  from: string;
  to: string;
  kind: 'offer' | 'answer' | 'candidate';
  /** JSON. Stringified so a nested candidate never trips Firestore's
   *  objection to undefined fields. */
  payload: string;
}

export interface VoiceTransport {
  publishPresence(state: { session: string; muted: boolean }): Promise<void>;
  clearPresence(): Promise<void>;
  /** Everyone currently present, including this participant. */
  watchPresence(
    onRecords: (records: PresenceRecord[]) => void,
    onError: (error: Error) => void,
  ): () => void;
  send(envelope: Envelope): Promise<void>;
  /** Delivers each envelope addressed here exactly once. */
  watchMail(
    onEnvelope: (envelope: Envelope) => void,
    onError: (error: Error) => void,
  ): () => void;
  /** Discards anything addressed here that was never collected. */
  drainMail(): Promise<void>;
}

function store() {
  const d = db();
  if (!d) throw new Error('Firebase is not configured');
  return d;
}

export function firestoreTransport(roomId: string, uid: string): VoiceTransport {
  const presenceDoc = () => doc(store(), 'rooms', roomId, 'voice', uid);
  const presenceCol = () => collection(store(), 'rooms', roomId, 'voice');
  const mailCol = () => collection(store(), 'rooms', roomId, 'signals');
  /* Deliberately no orderBy. `where('to','==')` alone is served by the
     automatic single-field index; adding a sort would require a composite one,
     and a missing composite index fails the listener outright — which looks
     exactly like "voice is stuck connecting" and is invisible without the
     console open. Ordering is not needed anyway: candidates are buffered until
     the description that gives them meaning arrives. */
  const mine = () => query(mailCol(), where('to', '==', uid));

  return {
    async publishPresence(state) {
      await setDoc(presenceDoc(), { uid, ...state, at: Date.now() });
    },

    async clearPresence() {
      await deleteDoc(presenceDoc());
    },

    watchPresence(onRecords, onError) {
      return onSnapshot(
        presenceCol(),
        (snap) => onRecords(snap.docs.map((d) => {
          const data = d.data() as Partial<PresenceRecord>;
          return {
            uid: d.id,
            session: String(data.session ?? ''),
            muted: Boolean(data.muted),
            at: Number(data.at) || 0,
          };
        })),
        onError,
      );
    },

    async send(envelope) {
      await addDoc(mailCol(), { ...envelope, at: Date.now() });
    },

    watchMail(onEnvelope, onError) {
      return onSnapshot(
        mine(),
        (snap) => {
          for (const change of snap.docChanges()) {
            if (change.type !== 'added') continue;
            // Read once, then destroyed: this is a mailbox, not a log.
            deleteDoc(change.doc.ref).catch(() => {});
            onEnvelope(change.doc.data() as Envelope);
          }
        },
        onError,
      );
    },

    async drainMail() {
      const snap = await getDocs(mine());
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref).catch(() => {})));
    },
  };
}
