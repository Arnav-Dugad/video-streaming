/** Normalised shapes the UI consumes. The YouTube API's raw envelopes never
 *  leave `src/lib/youtube.ts` — everything downstream speaks these. */

export interface Video {
  id: string;
  title: string;
  description: string;
  channelId: string;
  channelTitle: string;
  channelAvatar?: string;
  publishedAt: string;
  thumbnail: string;
  thumbnailHq: string;
  /** ISO-8601 duration, e.g. PT4M13S. Absent on pure search results. */
  duration?: string;
  durationSeconds?: number;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  tags?: string[];
  categoryId?: string;
  live?: boolean;
}

export interface Channel {
  id: string;
  title: string;
  description: string;
  avatar: string;
  banner?: string;
  subscriberCount?: number;
  videoCount?: number;
  viewCount?: number;
  customUrl?: string;
  publishedAt?: string;
}

/** A YouTube playlist, as returned by search or by a channel listing. */
export interface PlaylistSummary {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  /** Absent on search results; present when listed via playlists.list. */
  itemCount?: number;
}

export interface Comment {
  id: string;
  author: string;
  authorAvatar: string;
  authorChannelId?: string;
  text: string;
  likeCount: number;
  publishedAt: string;
  replyCount: number;
}

export interface Paged<T> {
  items: T[];
  nextPageToken?: string;
  totalResults?: number;
}

/** Firestore documents */

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string;
  photoURL: string | null;
  handle: string;
  bio?: string;
  createdAt: number;
  /** Taste vector seeded at onboarding, refined by watch behaviour. */
  interests: string[];
  preferences: Preferences;
}

/** Every field has a default in DEFAULT_PREFERENCES, and profiles written by
 *  older builds are merged forward, so adding one here is always safe. */
export interface Preferences {
  /* playback */
  autoplay: boolean;
  ambientGlow: boolean;
  reduceMotion: boolean;
  /** A YouTube quality id ('hd1080', 'large', …) or 'auto'. */
  defaultQuality: string;
  /** Render the embed oversized so YouTube offers renditions above 720p. */
  highRes: boolean;
  /** Applied to every video as it starts. */
  defaultSpeed: number;
  /** Seconds the skip-back / skip-forward controls and J/L jump. */
  skipInterval: number;
  /** Open the watch page in theatre mode by default. */
  theatreByDefault: boolean;

  /* content */
  /** ISO 3166-1 alpha-2, drives trending and biases search. */
  region: string;
  /** ISO 639-1, biases search relevance. */
  language: string;
  safeSearch: 'none' | 'moderate' | 'strict';

  /* interface */
  /** Muted preview playback when hovering a card. */
  hoverPreviews: boolean;
  /** The trailing ring that follows the pointer. */
  cursorCompanion: boolean;
  /** The 35mm grain overlay. */
  filmGrain: boolean;

  /* privacy */
  /** Stop recording watch positions. Continue Watching stops updating too. */
  pauseHistory: boolean;
}

export interface HistoryEntry {
  videoId: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  channelId: string;
  durationSeconds: number;
  /** Seconds watched — powers Continue Watching + the resume bar. */
  progress: number;
  watchedAt: number;
  completed: boolean;
}

export interface Playlist {
  id: string;
  ownerUid: string;
  title: string;
  description: string;
  visibility: 'private' | 'unlisted' | 'public';
  videoIds: string[];
  /** Denormalised so the grid renders without N reads. */
  covers: string[];
  createdAt: number;
  updatedAt: number;
}

export interface SavedVideo {
  videoId: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  channelId: string;
  durationSeconds: number;
  savedAt: number;
}

/* ==========================================================================
   Smart playlists.

   A saved *rule*, not a list of ids — the same shape the collection generator
   uses, pointed at a viewer's own channels instead of the trending chart. The
   contents are resolved on every visit, so a smart playlist is never stale and
   never needs syncing.
   ========================================================================== */

export interface SmartRule {
  /** Up to 10. Walking a channel's uploads costs 1 quota unit; a search costs
   *  100, so channel-scoped rules are dramatically cheaper. */
  channelIds: string[];
  /** Denormalised for display, so the editor need not re-fetch channel names. */
  channelNames: string[];
  query?: string;
  minSeconds?: number;
  maxSeconds?: number;
  publishedWithinDays?: number;
  /** Applied in the browser against the viewer's own history. */
  excludeWatched?: boolean;
  order: 'date' | 'viewCount' | 'relevance';
  limit: number;
}

export interface SmartPlaylist {
  id: string;
  ownerUid: string;
  title: string;
  rule: SmartRule;
  createdAt: number;
  updatedAt: number;
}

export interface Room {
  id: string;
  code: string;
  hostUid: string;
  hostName: string;
  title: string;
  videoId: string;
  videoTitle: string;
  videoThumbnail: string;
  /** Host clock, mirrored to every guest. */
  playing: boolean;
  positionSeconds: number;
  updatedAt: number;
  createdAt: number;
  members: Record<string, RoomMember>;
  /** Host-managed up-next list. Denormalised so the queue renders for guests
   *  without a second read per entry. */
  queue?: RoomQueueItem[];
}

export interface RoomMember {
  name: string;
  photo: string | null;
  joinedAt: number;
  /** A handful of channel names this member watches most, contributed when
   *  they join. Deliberately *not* their history: the room needs enough to
   *  find common ground and nothing more, and each member's history stays
   *  readable only by them. */
  taste?: string[];
}

export interface RoomQueueItem {
  videoId: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  durationSeconds: number;
  /** Who put it in the queue — guests can suggest, the host decides. */
  addedByUid: string;
  addedByName: string;
  addedAt: number;
}

export interface RoomMessage {
  id: string;
  uid: string;
  name: string;
  photo: string | null;
  text: string;
  at: number;
  /** Timestamped reaction pinned to a moment in the video. */
  atSecond?: number;
}
