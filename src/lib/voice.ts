'use client';

/* Types only. This module deliberately has no runtime imports: with the
   transport injected, the whole negotiation can be driven outside the app by a
   stand-in that delivers messages in whatever order a test wants. */
import type { Envelope, PresenceRecord, VoiceTransport } from './voice-transport';

export type { VoiceTransport } from './voice-transport';

/* ==========================================================================
   Voice, in the room.

   Chat is the weak part of watching something together: it asks you to look
   away from the thing you are both looking at. Voice does not. This is a full
   mesh of peer connections carrying one audio track each — no media server,
   so nothing but the two endpoints ever holds the audio, and the latency is
   whatever the path between two people is.

   A mesh is the right shape at this size and the wrong shape at scale, so
   MAX_PEERS keeps it honest.

   ---------------------------------------------------------------------------
   Two rules carry the whole negotiation, and both exist to remove a race
   rather than to handle one.

   1. Of any two participants, the lower uid places the call. Deterministic on
      both sides, so exactly one offer is ever made and there is no glare to
      resolve — no rollback, no politeness dance. Nothing renegotiates,
      because the track set never changes after the offer.

   2. An offer arriving at a peer that is not a fresh, untouched connection
      replaces that connection outright. This is what makes a retry work: the
      caller can re-offer at any time and the callee will always accept it,
      whatever state its previous attempt got stuck in.

   The first version of this deadlocked. Presence and mail arrive over two
   independent subscriptions with no ordering between them, so an offer could
   land before the presence record that describes its sender. The peer was
   then built with an unknown session id, and the presence snapshot that
   followed saw a session mismatch, tore the working connection down, and
   waited for an offer that had already been sent. Roughly a coin flip, and
   the visible symptom was exactly "connecting" forever. A peer built from an
   offer now adopts whatever session presence later reports instead of being
   destroyed by it.
   ========================================================================== */

const MAX_PEERS = 7;
/** Speech, not music. Opus at this rate is transparent for voice and leaves
 *  the connection headroom for the video everyone is also streaming. */
const AUDIO_BITRATE = 32_000;
/** RMS above this counts as speech. Below it, room tone. */
const SPEAKING_THRESHOLD = 0.045;
/** Hold the indicator up briefly so it does not flicker between syllables. */
const SPEAKING_HOLD_MS = 320;
/** How long a connection may sit unconnected before the caller starts over. */
const CONNECT_TIMEOUT_MS = 9000;
/** Attempts before the pair is reported as unreachable. */
const MAX_ATTEMPTS = 3;
const WATCHDOG_MS = 1500;
/** Presence is refreshed on this interval, so a record that stops moving is
 *  a tab that went away without saying so. */
const HEARTBEAT_MS = 20_000;
/** Three missed heartbeats. A phone that backgrounds the tab pauses timers,
 *  so this has to be forgiving enough not to evict somebody who is merely
 *  looking at their notifications. */
const PRESENCE_STALE_MS = 70_000;
/** How often the inbound audio counters are read. */
const STATS_MS = 2000;

/* A TURN provider's dashboard shows a bare `host:port`, because that is what
   its own examples want. WebRTC needs a scheme, and rejects the whole ICE
   server list if any entry lacks one — so pasting the dashboard value verbatim
   produces zero relay candidates and no error anybody can see.

   Rather than make that somebody's problem, the value is normalised: quotes
   and whitespace stripped, `turn:` added when no scheme is present, and a TCP
   variant offered alongside UDP so a network that blocks UDP outright still
   has a way through. */
export function turnUrls(): string[] {
  const raw = process.env.NEXT_PUBLIC_TURN_URL;
  if (!raw) return [];

  const urls: string[] = [];

  for (const part of raw.split(',')) {
    const cleaned = part.trim().replace(/^["']|["']$/g, '');
    if (!cleaned) continue;

    const url = /^(turns?|stun):/i.test(cleaned) ? cleaned : `turn:${cleaned}`;
    if (!urls.includes(url)) urls.push(url);

    // Only for plain `turn:` without an explicit transport — `turns:` is
    // already TCP, and a hand-written ?transport= is a deliberate choice.
    if (/^turn:/i.test(url) && !/[?&]transport=/i.test(url)) {
      const tcp = `${url}?transport=tcp`;
      if (!urls.includes(tcp)) urls.push(tcp);
    }
  }

  return urls;
}

/** Exported so the self-test probes exactly the servers a real call uses,
 *  rather than a second list that could drift out of step with this one. */
export function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ];

  /* STUN alone gets most pairs connected, but not all: behind a symmetric NAT
     or a restrictive corporate firewall there is no direct path to find, and
     the only fix is a relay. Set these three and the mesh will fall back to
     one. Without them a small fraction of pairs simply will not connect, and
     the UI says so rather than spinning forever. */
  const urls = turnUrls();
  const username = process.env.NEXT_PUBLIC_TURN_USERNAME?.trim().replace(/^["\']|["\']$/g, '');
  const credential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL?.trim().replace(/^["\']|["\']$/g, '');

  if (urls.length > 0 && username && credential) {
    servers.push({ urls, username, credential });
  }

  return servers;
}

export const hasTurn = Boolean(
  process.env.NEXT_PUBLIC_TURN_URL
  && process.env.NEXT_PUBLIC_TURN_USERNAME
  && process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
);

export type PeerStatus = 'connecting' | 'connected' | 'failed';

export interface VoicePeer {
  uid: string;
  status: PeerStatus;
  speaking: boolean;
  /** 0..1, for the level meter. */
  level: number;
  muted: boolean;
  /** Attempt number, surfaced in diagnostics. */
  attempts: number;
  /** Raw WebRTC state, for the diagnostics panel. */
  detail: string;
  /** Bytes of audio actually received from this peer. The single number that
   *  separates "nothing is arriving" from "it arrives and this device will not
   *  play it" — two problems that look identical and share no fix. */
  inboundBytes: number;
  /** Bitrate of their incoming audio. Cumulative bytes cannot tell speech
   *  from silence — Opus keeps sending comfort noise when nobody is talking —
   *  but the rate can: silence sits near 1 kbps, speech near 30. */
  inboundKbps: number;
  /** Whether the element carrying their audio is actually running. */
  playing: boolean;
}

export interface VoiceEvents {
  onPeers(peers: VoicePeer[]): void;
  /** Anyone at all is talking — the player ducks on this. */
  onSpeaking(speaking: boolean): void;
  onSelfLevel(level: number): void;
  onError(message: string): void;
  /** The browser refused to play incoming audio. Only a real tap can fix it,
   *  so the UI has to ask for one rather than failing silently. */
  onPlaybackBlocked(blocked: boolean): void;
}

interface Peer {
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  analyser?: AnalyserNode;
  source?: MediaStreamAudioSourceNode;
  /** Candidates that arrived before the remote description was set. */
  queued: RTCIceCandidateInit[];
  status: PeerStatus;
  speaking: boolean;
  lastVoice: number;
  level: number;
  muted: boolean;
  /** Their presence nonce. Empty means "built from an offer, not yet
   *  described by presence" — which must not be read as a mismatch. */
  session: string;
  startedAt: number;
  attempts: number;
  inboundBytes: number;
  inboundKbps: number;
  lastBytes: number;
  lastSampleAt: number;
}

/** Turns a signalling error into something a person can act on. Exported
 *  because the same explanation is wanted when *joining* fails, not only when
 *  a live listener does. */
export function explainVoiceError(error: Error): string {
  const code = (error as { code?: string }).code ?? '';
  if (code.includes('permission-denied')) {
    return 'Firestore refused the voice channel. Deploy the security rules (firebase deploy --only firestore:rules).';
  }
  if (code.includes('failed-precondition')) {
    return 'Firestore is missing an index for voice. Deploy firestore.indexes.json.';
  }
  if (code.includes('unavailable')) return 'Lost the connection to Firestore — voice will retry.';
  return `Voice signalling failed: ${error.message}`;
}

const explain = explainVoiceError;

export class VoiceMesh {
  private peers = new Map<string, Peer>();
  private presence = new Map<string, PresenceRecord>();
  private local: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private selfAnalyser: AnalyserNode | null = null;
  private selfSource: MediaStreamAudioSourceNode | null = null;
  private unsubscribers: (() => void)[] = [];
  private meter: number | null = null;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private session = Math.random().toString(36).slice(2, 10);
  private deviceId: string | null = null;
  private stopped = false;
  private anySpeaking = false;
  private muted = false;
  private playbackBlocked = false;
  /** Peak level the encoder saw, from the connection's own statistics. */
  private outgoingLevel = 0;

  constructor(
    private uid: string,
    private transport: VoiceTransport,
    private events: VoiceEvents,
  ) {}

  /* ------------------------------- lifecycle ---------------------------- */

  async start(): Promise<void> {
    // Asking for the microphone first means a refusal costs nothing: no
    // presence is published, so nobody sees a participant who never arrives.
    this.local = await navigator.mediaDevices.getUserMedia({ audio: this.constraints(), video: false });

    if (this.stopped) { this.releaseLocal(); return; }

    /* Built here, while the click that started voice is still the reason this
       code is running. An AudioContext created later starts suspended on
       mobile and cannot be resumed without another tap — and a suspended
       context is a second, quieter way for incoming audio to go nowhere. */
    this.context();

    this.startMetering();

    // A previous session that crashed rather than closed leaves envelopes
    // behind. Clearing them before subscribing keeps a stale offer from
    // tearing down the connection this one is about to build.
    await this.transport.drainMail().catch(() => {});
    if (this.stopped) { this.releaseLocal(); return; }

    await this.transport.publishPresence({ session: this.session, muted: false });
    if (this.stopped) { this.releaseLocal(); return; }

    this.unsubscribers.push(
      this.transport.watchPresence(
        (records) => this.onPresence(records),
        (error) => this.events.onError(explain(error)),
      ),
      this.transport.watchMail(
        (envelope) => { this.receive(envelope).catch(() => {}); },
        (error) => this.events.onError(explain(error)),
      ),
    );

    this.watchdogTimer = setInterval(() => this.sweep(), WATCHDOG_MS);

    /* A tab that is closed, crashes or is killed by the OS never runs its
       cleanup, and the presence record it leaves behind would have everyone
       else calling a number that no longer rings. Refreshing on a timer turns
       presence into a liveness signal rather than a claim. */
    this.heartbeatTimer = setInterval(() => {
      this.transport
        .publishPresence({ session: this.session, muted: this.muted })
        .catch(() => { /* the next beat retries */ });
    }, HEARTBEAT_MS);

    /* Reading the transport's own counters rather than trusting the state
       machine. "Connected" only means ICE found a path; it says nothing about
       whether audio is flowing along it, and nothing at all about whether the
       device will play what arrives. */
    this.statsTimer = setInterval(() => this.sampleStats(), STATS_MS);
  }

  async stop(): Promise<void> {
    this.stopped = true;

    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];

    if (this.meter !== null) { cancelAnimationFrame(this.meter); this.meter = null; }
    if (this.watchdogTimer !== null) { clearInterval(this.watchdogTimer); this.watchdogTimer = null; }
    if (this.heartbeatTimer !== null) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this.statsTimer !== null) { clearInterval(this.statsTimer); this.statsTimer = null; }

    for (const uid of [...this.peers.keys()]) this.teardown(uid);

    this.releaseLocal();
    try { this.selfSource?.disconnect(); } catch { /* already gone */ }
    this.selfSource = null;
    this.selfAnalyser = null;
    await this.audioContext?.close().catch(() => {});
    this.audioContext = null;

    await this.transport.clearPresence().catch(() => {});
    await this.transport.drainMail().catch(() => {});
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    for (const track of this.local?.getAudioTracks() ?? []) track.enabled = !muted;
    this.transport
      .publishPresence({ session: this.session, muted })
      .catch(() => { /* the others hear the silence regardless */ });
  }

  /** Plays an element, and remembers if the browser said no. */
  private tryPlay(audio: HTMLAudioElement): void {
    audio.play().then(
      () => {
        if (!this.playbackBlocked) return;
        // One recovering is enough to know the block has lifted.
        if ([...this.peers.values()].every((p) => !p.audio.paused)) {
          this.playbackBlocked = false;
          this.events.onPlaybackBlocked(false);
        }
      },
      () => {
        if (this.playbackBlocked || this.stopped) return;
        this.playbackBlocked = true;
        this.events.onPlaybackBlocked(true);
      },
    );
  }

  private constraints(): MediaTrackConstraints {
    return {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      // `exact` rather than a preference: silently falling back to the default
      // device would make choosing one look like it had worked when it had not.
      ...(this.deviceId ? { deviceId: { exact: this.deviceId } } : {}),
    };
  }

  /* A laptop typically offers several inputs, and Windows in particular likes
     to default to an array that is muted in the OS or pointed at nothing. The
     browser's own picker is buried; this one is not. */
  static async listInputs(): Promise<{ id: string; label: string }[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    return devices
      .filter((d) => d.kind === 'audioinput')
      // Labels are empty until permission has been granted at least once.
      .map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
  }

  /** Switches microphone without dropping the call: the outgoing track is
   *  replaced on every existing connection rather than renegotiated. */
  async setInputDevice(deviceId: string | null): Promise<void> {
    this.deviceId = deviceId;

    const next = await navigator.mediaDevices.getUserMedia({ audio: this.constraints(), video: false });
    if (this.stopped) { for (const t of next.getTracks()) t.stop(); return; }

    const track = next.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !this.muted;

    await Promise.all([...this.peers.values()].map(async (peer) => {
      const sender = peer.pc.getSenders().find((snd) => snd.track?.kind === 'audio');
      // replaceTrack does not touch the session description, so nobody has to
      // renegotiate and nothing goes quiet while the swap happens.
      await sender?.replaceTrack(track).catch(() => {});
    }));

    this.releaseLocal();
    this.local = next;

    // The local meter has to follow the device it is supposed to be metering.
    try { this.selfSource?.disconnect(); } catch { /* already gone */ }
    this.selfSource = null;
    this.selfAnalyser = null;
    try {
      const { analyser, source } = this.analyserFor(next);
      this.selfAnalyser = analyser;
      this.selfSource = source;
    } catch { /* metering is decoration */ }
  }

  /** What the far end is actually being sent, according to the connection's
   *  own statistics rather than a local meter that might be watching a
   *  different device. */
  get micLevel(): number {
    return this.outgoingLevel;
  }

  /** Called from a real tap. Retries every element and resumes the audio
   *  graph, which is the only thing a phone will accept once it has refused. */
  resumePlayback(): void {
    this.audioContext?.resume().catch(() => {});
    for (const peer of this.peers.values()) this.tryPlay(peer.audio);
  }

  private releaseLocal(): void {
    for (const track of this.local?.getTracks() ?? []) track.stop();
    this.local = null;
  }

  /* ------------------------------- presence ----------------------------- */

  private onPresence(records: PresenceRecord[]): void {
    if (this.stopped) return;

    const now = Date.now();
    this.presence.clear();
    for (const record of records) {
      if (record.uid === this.uid) continue;
      // A record that has stopped being refreshed belongs to a tab that is
      // gone. Ringing it forever is what turns one person leaving badly into
      // everybody staring at a spinner.
      if (record.at > 0 && now - record.at > PRESENCE_STALE_MS) continue;
      this.presence.set(record.uid, record);
    }

    // Reconcile in two passes, collecting first: tearing a peer down while
    // iterating the same map is how you drop somebody at random.
    const drop: string[] = [];
    for (const [uid, peer] of this.peers) {
      const now = this.presence.get(uid);
      if (!now) { drop.push(uid); continue; }

      if (peer.session === '') {
        // Built from an offer that outran its presence record. Adopt the
        // session rather than treating the difference as a reload — this is
        // the bug that used to leave both sides waiting on each other.
        peer.session = now.session;
        peer.muted = now.muted;
        continue;
      }

      // A genuinely different session means they reloaded, and the connection
      // on the other end of this one no longer exists.
      if (now.session !== peer.session) { drop.push(uid); continue; }

      if (peer.muted !== now.muted) peer.muted = now.muted;
    }
    for (const uid of drop) this.teardown(uid);

    for (const [uid, record] of this.presence) {
      if (this.peers.has(uid)) continue;
      if (this.peers.size >= MAX_PEERS) {
        this.events.onError(`Voice is limited to ${MAX_PEERS + 1} people in a room`);
        break;
      }
      this.connect(uid, record.session, record.muted, 1);
    }

    this.publish();
  }

  /* -------------------------------- peers ------------------------------- */

  /** Of any two participants, the lower uid places the call. */
  private isCaller(other: string): boolean {
    return this.uid < other;
  }

  private send(to: string, kind: Envelope['kind'], payload: unknown): void {
    if (this.stopped) return;
    this.transport
      .send({ from: this.uid, to, kind, payload: JSON.stringify(payload) })
      .catch(() => { /* the watchdog retries the whole attempt */ });
  }

  private connect(uid: string, session: string, muted: boolean, attempts: number): void {
    const pc = new RTCPeerConnection({ iceServers: iceServers(), bundlePolicy: 'max-bundle' });

    const audio = document.createElement('audio');
    audio.autoplay = true;
    /* iOS refuses to play any media element that has not opted out of its
       fullscreen takeover, even audio-only ones with no visual at all. Both
       spellings are needed: the property for browsers that expose it, the
       attribute for the ones that only read markup. */
    // `playsInline` is typed only on HTMLVideoElement, but every engine that
    // enforces the policy reads it off audio elements too.
    (audio as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
    audio.setAttribute('playsinline', '');
    audio.setAttribute('autoplay', '');
    // Kept out of the layout entirely; the UI shows levels, not players.
    audio.style.display = 'none';
    document.body.appendChild(audio);

    const peer: Peer = {
      pc, audio, queued: [], status: 'connecting', speaking: false,
      lastVoice: 0, level: 0, muted, session,
      startedAt: Date.now(), attempts,
      inboundBytes: 0, inboundKbps: 0, lastBytes: 0, lastSampleAt: 0,
    };
    this.peers.set(uid, peer);

    for (const track of this.local?.getTracks() ?? []) pc.addTrack(track, this.local!);
    this.capBitrate(pc);

    pc.onicecandidate = (event) => {
      if (event.candidate) this.send(uid, 'candidate', event.candidate.toJSON());
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (!stream) return;
      peer.audio.srcObject = stream;
      /* The gesture that started voice is long over by the time a peer's
         audio arrives, and on a phone that is exactly when autoplay policy
         bites: the connection is perfect, packets are flowing, and nothing
         comes out of the speaker. Swallowing this is what produced "I can
         hear them on the laptop but not the phone". */
      this.tryPlay(peer.audio);
      // Chrome will not pump a peer-connection stream through Web Audio unless
      // something is also playing it, so the element above is load-bearing for
      // the level meters rather than decoration.
      this.attachAnalyser(peer, stream);
    };

    const settle = () => {
      if (this.stopped || this.peers.get(uid) !== peer) return;
      // `connectionState` is the authority where it exists; iceConnectionState
      // is the fallback for builds that never fire the former.
      const state = pc.connectionState ?? 'new';
      const ice = pc.iceConnectionState;

      if (state === 'connected' || ice === 'connected' || ice === 'completed') {
        peer.status = 'connected';
      } else if (state === 'failed' || ice === 'failed') {
        peer.status = 'failed';
        // A failed candidate pair is sometimes recoverable without rebuilding
        // the whole connection.
        if (this.isCaller(uid) && peer.attempts < MAX_ATTEMPTS) {
          try { pc.restartIce(); } catch { /* not everywhere */ }
        }
      } else if (state === 'closed') {
        peer.status = 'failed';
      } else {
        peer.status = 'connecting';
      }
      this.publish();
    };

    pc.onconnectionstatechange = settle;
    pc.oniceconnectionstatechange = settle;

    if (this.isCaller(uid)) this.offer(uid, peer);
  }

  private offer(uid: string, peer: Peer): void {
    peer.pc.createOffer()
      .then(async (offer) => {
        if (this.peers.get(uid) !== peer) return;
        await peer.pc.setLocalDescription(offer);
        this.send(uid, 'offer', offer);
      })
      .catch(() => { peer.status = 'failed'; this.publish(); });
  }

  private async receive(envelope: Envelope): Promise<void> {
    if (this.stopped) return;
    const { from, kind } = envelope;

    let payload: RTCSessionDescriptionInit & RTCIceCandidateInit;
    try { payload = JSON.parse(envelope.payload); } catch { return; }

    let peer = this.peers.get(from);

    if (kind === 'offer') {
      /* Any offer replaces whatever came before it. A fresh connection is in
         `stable` with no remote description, so a first offer applies in
         place; anything else is a retry from the other side and the old
         attempt is discarded rather than reasoned about. This is what makes
         the watchdog's re-offer reliable. */
      if (peer && (peer.pc.signalingState !== 'stable' || peer.pc.currentRemoteDescription)) {
        this.teardown(from);
        peer = undefined;
      }
      if (!peer) {
        const known = this.presence.get(from);
        // Session '' when presence has not arrived yet: adopted later rather
        // than being mistaken for a reload.
        this.connect(from, known?.session ?? '', known?.muted ?? false, 1);
        peer = this.peers.get(from);
      }
      if (!peer) return;

      await peer.pc.setRemoteDescription(new RTCSessionDescription(payload));
      await this.flushCandidates(peer);
      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);
      this.send(from, 'answer', answer);
      this.publish();
      return;
    }

    if (!peer) return;

    if (kind === 'answer') {
      // Setting a remote description in the wrong state throws and kills the
      // connection; a late answer from a superseded attempt is just dropped.
      if (peer.pc.signalingState !== 'have-local-offer') return;
      await peer.pc.setRemoteDescription(new RTCSessionDescription(payload));
      await this.flushCandidates(peer);
      return;
    }

    // Candidates routinely arrive before the description that gives them
    // meaning. Holding them is the difference between a connection that comes
    // up first time and one that needs a second attempt.
    if (!peer.pc.remoteDescription) { peer.queued.push(payload); return; }
    await peer.pc.addIceCandidate(new RTCIceCandidate(payload)).catch(() => {});
  }

  private async flushCandidates(peer: Peer): Promise<void> {
    const pending = peer.queued;
    peer.queued = [];
    for (const candidate of pending) {
      await peer.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
    }
  }

  /* ------------------------------- watchdog ----------------------------- */

  /* Signalling can drop a message, a tab can be backgrounded mid-handshake,
     and ICE can simply fail to find a path. Rather than reason about which,
     the caller starts the whole attempt over — and because an offer always
     replaces the callee's connection, that is enough on its own. */
  private sweep(): void {
    if (this.stopped) return;
    const now = Date.now();

    for (const [uid, peer] of [...this.peers]) {
      if (peer.status === 'connected') continue;
      if (now - peer.startedAt < CONNECT_TIMEOUT_MS) continue;

      if (!this.isCaller(uid)) {
        // The callee cannot restart anything: it has nobody to offer to. It
        // waits a little longer, then says so.
        if (now - peer.startedAt > CONNECT_TIMEOUT_MS * 2.5 && peer.status !== 'failed') {
          peer.status = 'failed';
          this.publish();
        }
        continue;
      }

      if (peer.attempts >= MAX_ATTEMPTS) {
        if (peer.status !== 'failed') { peer.status = 'failed'; this.publish(); }
        continue;
      }

      const { session, muted, attempts } = peer;
      this.teardown(uid);
      this.connect(uid, session, muted, attempts + 1);
      this.publish();
    }
  }

  private sampleStats(): void {
    if (this.stopped) return;

    for (const [uid, peer] of this.peers) {
      peer.pc.getStats().then((report) => {
        if (this.peers.get(uid) !== peer) return;

        let bytes = 0;
        let sending = -1;

        report.forEach((entry) => {
          const stat = entry as {
            type?: string; kind?: string;
            bytesReceived?: number; audioLevel?: number;
          };
          if (stat.type === 'inbound-rtp' && stat.kind === 'audio') {
            bytes = Math.max(bytes, stat.bytesReceived ?? 0);
          }
          /* What the encoder is actually being handed. This is the honest
             answer to "is my microphone picking anything up" — the local
             analyser can be reading a device that is not the one being sent,
             but `media-source` is by definition the track on the wire. */
          if (stat.type === 'media-source' && stat.kind === 'audio') {
            sending = Math.max(sending, stat.audioLevel ?? 0);
          }
        });

        const now = Date.now();
        if (peer.lastSampleAt > 0 && now > peer.lastSampleAt) {
          const seconds = (now - peer.lastSampleAt) / 1000;
          peer.inboundKbps = Math.max(0, ((bytes - peer.lastBytes) * 8) / 1000 / seconds);
        }
        peer.lastBytes = bytes;
        peer.lastSampleAt = now;
        peer.inboundBytes = bytes;

        if (sending >= 0) this.outgoingLevel = sending;

        this.publish();
      }).catch(() => { /* the connection went away mid-read */ });
    }
  }

  /** Opus negotiates high by default; speech does not need it, and the room is
   *  streaming video over the same link. */
  private capBitrate(pc: RTCPeerConnection): void {
    for (const sender of pc.getSenders()) {
      if (sender.track?.kind !== 'audio') continue;
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
      params.encodings[0].maxBitrate = AUDIO_BITRATE;
      sender.setParameters(params).catch(() => { /* not supported everywhere */ });
    }
  }

  private teardown(uid: string): void {
    const peer = this.peers.get(uid);
    if (!peer) return;
    this.peers.delete(uid);

    try { peer.source?.disconnect(); } catch { /* already gone */ }
    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
    peer.pc.onconnectionstatechange = null;
    peer.pc.oniceconnectionstatechange = null;
    try { peer.pc.close(); } catch { /* already closed */ }
    peer.audio.srcObject = null;
    peer.audio.remove();
  }

  /* ------------------------------- metering ----------------------------- */

  private context(): AudioContext {
    if (!this.audioContext) {
      const Ctor = window.AudioContext
        ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new Ctor();
    }
    // Autoplay policy can leave a fresh context suspended even after a click.
    if (this.audioContext.state === 'suspended') this.audioContext.resume().catch(() => {});
    return this.audioContext;
  }

  private analyserFor(stream: MediaStream): { analyser: AnalyserNode; source: MediaStreamAudioSourceNode } {
    const ctx = this.context();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    // Small window: this is an envelope follower, not a spectrogram, and a
    // large FFT would only add latency to the indicator.
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(analyser);
    return { analyser, source };
  }

  private attachAnalyser(peer: Peer, stream: MediaStream): void {
    try {
      const { analyser, source } = this.analyserFor(stream);
      peer.analyser = analyser;
      peer.source = source;
    } catch { /* metering is decoration; the audio still plays */ }
  }

  private startMetering(): void {
    if (!this.local) return;
    try {
      const { analyser, source } = this.analyserFor(this.local);
      this.selfAnalyser = analyser;
      // Held so the graph is not garbage-collected out from under us.
      this.selfSource = source;
    } catch { /* no metering, but voice still works */ }

    const buffer = new Uint8Array(512);

    const tick = () => {
      if (this.stopped) return;
      this.meter = requestAnimationFrame(tick);

      const now = Date.now();
      let anyone = false;

      if (this.selfAnalyser) {
        // Your own voice does not duck your own video — you already know you
        // are talking, and hearing the film dip every time you breathe is
        // maddening. This drives the local meter only.
        this.events.onSelfLevel(this.muted ? 0 : rms(this.selfAnalyser, buffer));
      }

      let changed = false;
      for (const peer of this.peers.values()) {
        if (!peer.analyser) continue;
        const level = rms(peer.analyser, buffer);
        if (Math.abs(level - peer.level) > 0.01) { peer.level = level; changed = true; }
        if (level > SPEAKING_THRESHOLD) peer.lastVoice = now;
        const speaking = now - peer.lastVoice < SPEAKING_HOLD_MS;
        if (speaking !== peer.speaking) { peer.speaking = speaking; changed = true; }
        if (speaking) anyone = true;
      }

      if (anyone !== this.anySpeaking) {
        this.anySpeaking = anyone;
        this.events.onSpeaking(anyone);
      }
      if (changed) this.publish();
    };

    this.meter = requestAnimationFrame(tick);
  }

  private publish(): void {
    if (this.stopped) return;
    this.events.onPeers([...this.peers.entries()].map(([uid, p]) => ({
      uid,
      status: p.status,
      speaking: p.speaking,
      level: p.level,
      muted: p.muted,
      attempts: p.attempts,
      inboundBytes: p.inboundBytes,
      inboundKbps: p.inboundKbps,
      playing: !p.audio.paused && p.audio.readyState > 0,
      detail: `${p.pc.connectionState}/${p.pc.iceConnectionState}${this.isCaller(uid) ? ' · calling' : ' · answering'}`,
    })));
  }
}

function rms(analyser: AnalyserNode, buffer: Uint8Array): number {
  analyser.getByteTimeDomainData(buffer as Uint8Array<ArrayBuffer>);
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    const sample = (buffer[i] - 128) / 128;
    sum += sample * sample;
  }
  return Math.sqrt(sum / buffer.length);
}
