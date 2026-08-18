'use client';

import {
  addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs,
  limit as qLimit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc,
  where, writeBatch, type Unsubscribe,
} from 'firebase/firestore';

import { db } from './firebase';
import type {
  HistoryEntry, Playlist, Preferences, Room, RoomMessage, RoomQueueItem,
  SavedVideo, UserProfile, Video,
} from './types';

/* ==========================================================================
   Firestore access layer.

   Schema (see firestore.rules for the matching authorisation model):

     users/{uid}                          profile + preferences
     users/{uid}/history/{videoId}        watch progress, one doc per video
     users/{uid}/saved/{videoId}          watch later
     users/{uid}/likes/{videoId}          liked
     users/{uid}/subscriptions/{chanId}   followed channels
     playlists/{playlistId}               owner-scoped, optionally public
     rooms/{roomId}                       watch-party state
     rooms/{roomId}/messages/{msgId}      watch-party chat

   History is keyed by videoId rather than appended so re-watching updates one
   document instead of growing the collection without bound.
   ========================================================================== */

class NotConfiguredError extends Error {
  constructor() { super('Firebase is not configured'); }
}

function store() {
  const d = db();
  if (!d) throw new NotConfiguredError();
  return d;
}

/* ------------------------------- profile -------------------------------- */

export const DEFAULT_PREFERENCES: Preferences = {
  autoplay: true,
  ambientGlow: true,
  reduceMotion: false,
  defaultQuality: 'auto',
  // On by default: without it the embed is effectively capped at 720p, which
  // is the most common complaint about a YouTube player inside a page.
  highRes: true,
  defaultSpeed: 1,
  skipInterval: 10,
  theatreByDefault: false,
  region: 'US',
  language: 'en',
  safeSearch: 'moderate',
  hoverPreviews: true,
  cursorCompanion: true,
  filmGrain: true,
  pauseHistory: false,
};

export async function ensureProfile(
  uid: string,
  seed: { email: string | null; displayName: string; photoURL: string | null },
): Promise<UserProfile> {
  const ref = doc(store(), 'users', uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const data = snap.data() as Partial<UserProfile>;
    // Merge forward so profiles written by older builds gain new fields.
    return {
      uid,
      email: data.email ?? seed.email,
      displayName: data.displayName || seed.displayName,
      photoURL: data.photoURL ?? seed.photoURL,
      handle: data.handle || handleFrom(seed.displayName, uid),
      bio: data.bio ?? '',
      createdAt: data.createdAt ?? Date.now(),
      interests: data.interests ?? [],
      preferences: { ...DEFAULT_PREFERENCES, ...(data.preferences ?? {}) },
    };
  }

  const profile: UserProfile = {
    uid,
    email: seed.email,
    displayName: seed.displayName || 'Viewer',
    photoURL: seed.photoURL,
    handle: handleFrom(seed.displayName, uid),
    bio: '',
    createdAt: Date.now(),
    interests: [],
    preferences: { ...DEFAULT_PREFERENCES },
  };
  await setDoc(ref, profile);
  return profile;
}

function handleFrom(name: string, uid: string): string {
  const base = (name || 'viewer').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'viewer';
  return `${base}${uid.slice(0, 4).toLowerCase()}`;
}

export async function updateProfile(uid: string, patch: Partial<UserProfile>): Promise<void> {
  await updateDoc(doc(store(), 'users', uid), patch as Record<string, unknown>);
}

export async function updatePreferences(
  uid: string,
  patch: Partial<Preferences>,
): Promise<void> {
  const entries = Object.entries(patch).map(([k, v]) => [`preferences.${k}`, v]);
  await updateDoc(doc(store(), 'users', uid), Object.fromEntries(entries));
}

/* ------------------------------- history -------------------------------- */

export function historyEntryFrom(video: Video, progress: number): HistoryEntry {
  const duration = video.durationSeconds ?? 0;
  return {
    videoId: video.id,
    title: video.title,
    thumbnail: video.thumbnail || video.thumbnailHq,
    channelTitle: video.channelTitle,
    channelId: video.channelId,
    durationSeconds: duration,
    progress: Math.max(0, Math.round(progress)),
    watchedAt: Date.now(),
    // 92% counts as finished — nobody watches the end card.
    completed: duration > 0 && progress / duration > 0.92,
  };
}

export async function recordProgress(uid: string, entry: HistoryEntry): Promise<void> {
  await setDoc(doc(store(), 'users', uid, 'history', entry.videoId), entry, { merge: true });
}

export async function getHistory(uid: string, max = 60): Promise<HistoryEntry[]> {
  const q = query(
    collection(store(), 'users', uid, 'history'),
    orderBy('watchedAt', 'desc'),
    qLimit(max),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as HistoryEntry);
}

/** Continue Watching: started, not finished, and far enough in to be worth
 *  resuming but not so far that it's effectively done. */
export async function getContinueWatching(uid: string, max = 12): Promise<HistoryEntry[]> {
  const all = await getHistory(uid, 80);
  return all
    .filter((h) => !h.completed && h.progress > 20 && h.durationSeconds > 0)
    .filter((h) => h.progress / h.durationSeconds < 0.95)
    .slice(0, max);
}

export async function getProgress(uid: string, videoId: string): Promise<HistoryEntry | null> {
  const snap = await getDoc(doc(store(), 'users', uid, 'history', videoId));
  return snap.exists() ? (snap.data() as HistoryEntry) : null;
}

export async function removeFromHistory(uid: string, videoId: string): Promise<void> {
  await deleteDoc(doc(store(), 'users', uid, 'history', videoId));
}

export async function clearHistory(uid: string): Promise<void> {
  const snap = await getDocs(collection(store(), 'users', uid, 'history'));
  // Firestore batches cap at 500 writes.
  const chunks: (typeof snap.docs)[] = [];
  for (let i = 0; i < snap.docs.length; i += 450) chunks.push(snap.docs.slice(i, i + 450));
  for (const chunk of chunks) {
    const batch = writeBatch(store());
    chunk.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

/* --------------------------- saved / liked ------------------------------ */

type Collection = 'saved' | 'likes';

export function savedVideoFrom(video: Video): SavedVideo {
  return {
    videoId: video.id,
    title: video.title,
    thumbnail: video.thumbnail || video.thumbnailHq,
    channelTitle: video.channelTitle,
    channelId: video.channelId,
    durationSeconds: video.durationSeconds ?? 0,
    savedAt: Date.now(),
  };
}

export async function toggleInCollection(
  uid: string,
  name: Collection,
  video: Video,
): Promise<boolean> {
  const ref = doc(store(), 'users', uid, name, video.id);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await deleteDoc(ref);
    return false;
  }
  await setDoc(ref, savedVideoFrom(video));
  return true;
}

export async function isInCollection(uid: string, name: Collection, videoId: string): Promise<boolean> {
  const snap = await getDoc(doc(store(), 'users', uid, name, videoId));
  return snap.exists();
}

export async function listCollection(uid: string, name: Collection, max = 100): Promise<SavedVideo[]> {
  const q = query(collection(store(), 'users', uid, name), orderBy('savedAt', 'desc'), qLimit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as SavedVideo);
}

/* ----------------------------- subscriptions ---------------------------- */

export interface Subscription {
  channelId: string;
  channelTitle: string;
  avatar: string;
  subscribedAt: number;
}

export async function toggleSubscription(
  uid: string,
  channel: { id: string; title: string; avatar: string },
): Promise<boolean> {
  const ref = doc(store(), 'users', uid, 'subscriptions', channel.id);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await deleteDoc(ref);
    return false;
  }
  await setDoc(ref, {
    channelId: channel.id,
    channelTitle: channel.title,
    avatar: channel.avatar,
    subscribedAt: Date.now(),
  } satisfies Subscription);
  return true;
}

export async function isSubscribed(uid: string, channelId: string): Promise<boolean> {
  const snap = await getDoc(doc(store(), 'users', uid, 'subscriptions', channelId));
  return snap.exists();
}

export async function listSubscriptions(uid: string): Promise<Subscription[]> {
  const q = query(collection(store(), 'users', uid, 'subscriptions'), orderBy('subscribedAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as Subscription);
}

/* ------------------------------- playlists ------------------------------ */

export async function createPlaylist(
  uid: string,
  input: { title: string; description?: string; visibility?: Playlist['visibility'] },
): Promise<string> {
  const ref = await addDoc(collection(store(), 'playlists'), {
    ownerUid: uid,
    title: input.title,
    description: input.description ?? '',
    visibility: input.visibility ?? 'private',
    videoIds: [],
    covers: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  return ref.id;
}

export async function listPlaylists(uid: string): Promise<Playlist[]> {
  const q = query(
    collection(store(), 'playlists'),
    where('ownerUid', '==', uid),
    orderBy('updatedAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Playlist, 'id'>) }));
}

export async function getPlaylist(id: string): Promise<Playlist | null> {
  const snap = await getDoc(doc(store(), 'playlists', id));
  return snap.exists() ? { id: snap.id, ...(snap.data() as Omit<Playlist, 'id'>) } : null;
}

export async function addToPlaylist(playlistId: string, video: Video): Promise<void> {
  const ref = doc(store(), 'playlists', playlistId);
  const snap = await getDoc(ref);
  const covers = ((snap.data()?.covers as string[]) ?? []).filter((c) => c !== video.thumbnail);
  await updateDoc(ref, {
    videoIds: arrayUnion(video.id),
    // Keep four denormalised covers so the grid renders with no extra reads.
    covers: [video.thumbnail, ...covers].slice(0, 4),
    updatedAt: Date.now(),
  });
}

export async function removeFromPlaylist(playlistId: string, videoId: string): Promise<void> {
  await updateDoc(doc(store(), 'playlists', playlistId), {
    videoIds: arrayRemove(videoId),
    updatedAt: Date.now(),
  });
}

export async function updatePlaylist(id: string, patch: Partial<Playlist>): Promise<void> {
  await updateDoc(doc(store(), 'playlists', id), { ...patch, updatedAt: Date.now() } as Record<string, unknown>);
}

export async function deletePlaylist(id: string): Promise<void> {
  await deleteDoc(doc(store(), 'playlists', id));
}

/* ----------------------------- watch parties ---------------------------- */

/** Six characters, no vowels and no 0/1/I/O — unambiguous when read aloud. */
const CODE_ALPHABET = '23456789BCDFGHJKLMNPQRSTVWXYZ';

export function generateRoomCode(): string {
  let out = '';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

export async function createRoom(
  host: { uid: string; name: string; photo: string | null },
  video: Video,
  title?: string,
): Promise<string> {
  const code = generateRoomCode();
  const ref = await addDoc(collection(store(), 'rooms'), {
    code,
    hostUid: host.uid,
    hostName: host.name,
    title: title || `${host.name}'s room`,
    videoId: video.id,
    videoTitle: video.title,
    videoThumbnail: video.thumbnailHq || video.thumbnail,
    playing: false,
    positionSeconds: 0,
    updatedAt: Date.now(),
    createdAt: Date.now(),
    members: {
      [host.uid]: { name: host.name, photo: host.photo, joinedAt: Date.now() },
    },
  });
  return ref.id;
}

export async function findRoomByCode(code: string): Promise<Room | null> {
  const q = query(collection(store(), 'rooms'), where('code', '==', code.toUpperCase()), qLimit(1));
  const snap = await getDocs(q);
  const d = snap.docs[0];
  return d ? { id: d.id, ...(d.data() as Omit<Room, 'id'>) } : null;
}

export function watchRoom(roomId: string, onChange: (room: Room | null) => void): Unsubscribe {
  return onSnapshot(doc(store(), 'rooms', roomId), (snap) => {
    onChange(snap.exists() ? { id: snap.id, ...(snap.data() as Omit<Room, 'id'>) } : null);
  });
}

export async function joinRoom(
  roomId: string,
  member: { uid: string; name: string; photo: string | null },
): Promise<void> {
  await updateDoc(doc(store(), 'rooms', roomId), {
    [`members.${member.uid}`]: { name: member.name, photo: member.photo, joinedAt: Date.now() },
  });
}

export async function leaveRoom(roomId: string, uid: string): Promise<void> {
  const ref = doc(store(), 'rooms', roomId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const members = { ...(snap.data().members as Room['members']) };
  delete members[uid];
  await updateDoc(ref, { members });
}

/** Only the host writes playback state; guests mirror it. */
export async function syncRoomPlayback(
  roomId: string,
  state: { playing: boolean; positionSeconds: number; videoId?: string },
): Promise<void> {
  await updateDoc(doc(store(), 'rooms', roomId), { ...state, updatedAt: Date.now() });
}

export async function setRoomVideo(roomId: string, video: Video): Promise<void> {
  await updateDoc(doc(store(), 'rooms', roomId), {
    videoId: video.id,
    videoTitle: video.title,
    videoThumbnail: video.thumbnailHq || video.thumbnail,
    positionSeconds: 0,
    playing: true,
    updatedAt: Date.now(),
  });
}

/* ------------------------------ room queue ------------------------------ */

export function roomQueueItem(
  video: Video,
  addedBy: { uid: string; name: string },
): RoomQueueItem {
  return {
    videoId: video.id,
    title: video.title,
    thumbnail: video.thumbnail || video.thumbnailHq,
    channelTitle: video.channelTitle,
    durationSeconds: video.durationSeconds ?? 0,
    addedByUid: addedBy.uid,
    addedByName: addedBy.name,
    addedAt: Date.now(),
  };
}

/** Anyone in the room may queue something; only the host may play or remove.
 *  arrayUnion would silently drop a repeat, so duplicates are filtered here
 *  against the current document instead. */
export async function addToRoomQueue(roomId: string, item: RoomQueueItem): Promise<boolean> {
  const ref = doc(store(), 'rooms', roomId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return false;

  const current = (snap.data().queue as RoomQueueItem[] | undefined) ?? [];
  if (current.some((q) => q.videoId === item.videoId)) return false;
  if (snap.data().videoId === item.videoId) return false;

  await updateDoc(ref, { queue: [...current, item].slice(0, 50) });
  return true;
}

export async function removeFromRoomQueue(roomId: string, videoId: string): Promise<void> {
  const ref = doc(store(), 'rooms', roomId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const current = (snap.data().queue as RoomQueueItem[] | undefined) ?? [];
  await updateDoc(ref, { queue: current.filter((q) => q.videoId !== videoId) });
}

/** Pulls the next item off the queue and makes it the room's video. One write,
 *  so guests never observe a room with no video playing. */
export async function advanceRoomQueue(roomId: string): Promise<RoomQueueItem | null> {
  const ref = doc(store(), 'rooms', roomId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const current = (snap.data().queue as RoomQueueItem[] | undefined) ?? [];
  const [next, ...rest] = current;
  if (!next) return null;

  await updateDoc(ref, {
    videoId: next.videoId,
    videoTitle: next.title,
    videoThumbnail: next.thumbnail,
    positionSeconds: 0,
    playing: true,
    updatedAt: Date.now(),
    queue: rest,
  });
  return next;
}

export async function listPublicRooms(max = 24): Promise<Room[]> {
  const q = query(collection(store(), 'rooms'), orderBy('updatedAt', 'desc'), qLimit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Room, 'id'>) }));
}

export function watchRoomMessages(roomId: string, onChange: (msgs: RoomMessage[]) => void): Unsubscribe {
  const q = query(collection(store(), 'rooms', roomId, 'messages'), orderBy('at', 'asc'), qLimit(200));
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RoomMessage, 'id'>) })));
  });
}

export async function sendRoomMessage(
  roomId: string,
  msg: Omit<RoomMessage, 'id' | 'at'> & { atSecond?: number },
): Promise<void> {
  await addDoc(collection(store(), 'rooms', roomId, 'messages'), { ...msg, at: Date.now() });
}

export { serverTimestamp };
