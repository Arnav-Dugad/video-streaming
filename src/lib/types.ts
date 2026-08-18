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
  preferences: {
    autoplay: boolean;
    ambientGlow: boolean;
    reduceMotion: boolean;
    defaultQuality: 'auto' | 'hd1080' | 'hd720' | 'large';
  };
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
  members: Record<string, { name: string; photo: string | null; joinedAt: number }>;
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
