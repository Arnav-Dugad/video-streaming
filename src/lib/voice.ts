'use client';

import {
  addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query,
  serverTimestamp, setDoc, where, type Unsubscribe,
} from 'firebase/firestore';

import { db } from './firebase';

/* ==========================================================================
   Voice, in the room.

   Chat is the weak part of watching something together: it asks you to look
   away from the thing you are both looking at. Voice does not. This is a full
   mesh of peer connections carrying one audio track each — no media server,
   so nothing but the two endpoints ever holds the audio, and the latency is
   whatever the path between two people is, typically well under 100ms.

   A mesh is the right shape at this size and the wrong shape at scale: every
   participant sends their audio to every other, so cost grows with the square
   of the room. Watch parties are three or four people, and a mesh at four is
   twelve streams of ~32kbps. MAX_PEERS keeps it honest.

   Signalling rides Firestore, which is already open on this page — one
   presence document per participant, and short-lived envelopes addressed to a
   single uid. Envelopes are deleted the moment they are read, so the
   collection is a mailbox and not a log.

   Glare — both sides offering at once and deadlocking — is avoided by making
   the choice deterministic rather than negotiated: of any two participants,
   the one with the lower uid places the call. No rollback, no politeness
   dance, because the track set never changes after the offer and there is
   nothing to renegotiate.
   ========================================================================== */

const MAX_PEERS = 7;
/** Speech, not music. Opus at this rate is transparent for voice and leaves
 *  the connection headroom for the video everyone is also streaming. */
const AUDIO_BITRATE = 32_000;
/** RMS above this counts as speech. Below it, room tone. */
const SPEAKING_THRESHOLD = 0.045;
/** Hold the indicator up briefly so it does not flicker between syllables. */
const SPEAKING_HOLD_MS = 320;

function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ];

  /* STUN alone gets most pairs connected, but not all: behind a symmetric NAT
     or a restrictive corporate firewall there is no direct path to find, and
     the only fix is a relay. Set these three and the mesh will fall back to
     one. Without them a small fraction of pairs simply will not connect, and
     the UI says so rather than spinning forever. */
  const url = process.env.NEXT_PUBLIC_TURN_URL;
  const username = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const credential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;
  if (url && username && credential) {
    servers.push({ urls: url.split(',').map((u) => u.trim()).filter(Boolean), username, credential });
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
}

export interface VoiceEvents {
  onPeers(peers: VoicePeer[]): void;
  /** Anyone at all is talking — the player ducks on this. */
  onSpeaking(speaking: boolean): void;
  onSelfLevel(level: number): void;
  onError(message: string): void;
}

interface Envelope {
  from: string;
  to: string;
  kind: 'offer' | 'answer' | 'candidate';
  payload: string;
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
  /** Their presence nonce; a change means they reloaded and must be rebuilt. */
  session: string;
}

function store() {
  const d = db();
  if (!d) throw new Error('Firebase is not configured');
  return d;
}

export class VoiceMesh {
  private peers = new Map<string, Peer>();
  private local: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private selfAnalyser: AnalyserNode | null = null;
  private unsubscribers: Unsubscribe[] = [];
  private meter: number | null = null;
  private session = Math.random().toString(36).slice(2, 10);
  private stopped = false;
  private anySpeaking = false;

  constructor(
    private roomId: string,
    private uid: string,
    private events: VoiceEvents,
  ) {}

  /* ------------------------------- lifecycle ---------------------------- */

  async start(): Promise<void> {
    // Asking for the microphone first means a refusal costs nothing: no
    // presence is published, so nobody sees a participant who never arrives.
    this.local = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    if (this.stopped) { this.releaseLocal(); return; }

    this.startMetering();

    await setDoc(doc(store(), 'rooms', this.roomId, 'voice', this.uid), {
      uid: this.uid,
      session: this.session,
      muted: false,
      at: serverTimestamp(),
    });

    this.watchPresence();
    this.watchMail();
  }

  async stop(): Promise<void> {
    this.stopped = true;

    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];

    if (this.meter !== null) { cancelAnimationFrame(this.meter); this.meter = null; }

    for (const uid of [...this.peers.keys()]) this.teardown(uid);

    this.releaseLocal();
    this.selfAnalyser = null;
    await this.audioContext?.close().catch(() => {});
    this.audioContext = null;

    // Best effort: a participant who closes the tab leaves their presence
    // behind, and the others drop them when the connection dies anyway.
    await deleteDoc(doc(store(), 'rooms', this.roomId, 'voice', this.uid)).catch(() => {});
    await this.drainMail().catch(() => {});
  }

  setMuted(muted: boolean): void {
    for (const track of this.local?.getAudioTracks() ?? []) track.enabled = !muted;
    setDoc(
      doc(store(), 'rooms', this.roomId, 'voice', this.uid),
      { uid: this.uid, session: this.session, muted, at: serverTimestamp() },
    ).catch(() => { /* the others hear the silence regardless */ });
  }

  private releaseLocal(): void {
    for (const track of this.local?.getTracks() ?? []) track.stop();
    this.local = null;
  }

  /* ------------------------------ signalling ---------------------------- */

  private mail() {
    return collection(store(), 'rooms', this.roomId, 'signals');
  }

  private async send(to: string, kind: Envelope['kind'], payload: unknown): Promise<void> {
    if (this.stopped) return;
    await addDoc(this.mail(), {
      from: this.uid,
      to,
      kind,
      // Stringified so a nested candidate object never trips Firestore's
      // restrictions on undefined fields.
      payload: JSON.stringify(payload),
      at: Date.now(),
    }).catch(() => { /* the peer will time out and be marked failed */ });
  }

  private watchPresence(): void {
    const q = collection(store(), 'rooms', this.roomId, 'voice');

    this.unsubscribers.push(onSnapshot(q, (snap) => {
      if (this.stopped) return;

      const present = new Map<string, { session: string; muted: boolean }>();
      for (const d of snap.docs) {
        const data = d.data() as { session?: string; muted?: boolean };
        if (d.id === this.uid) continue;
        present.set(d.id, { session: String(data.session ?? ''), muted: Boolean(data.muted) });
      }

      // Gone, or reloaded under a new session — either way the old connection
      // is dead and has to be rebuilt rather than reused.
      for (const [uid, peer] of this.peers) {
        const now = present.get(uid);
        if (!now || now.session !== peer.session) this.teardown(uid);
      }

      for (const [uid, info] of present) {
        const existing = this.peers.get(uid);
        if (existing) {
          if (existing.muted !== info.muted) { existing.muted = info.muted; this.publish(); }
          continue;
        }
        if (this.peers.size >= MAX_PEERS) {
          this.events.onError(`Voice is limited to ${MAX_PEERS + 1} people in a room`);
          break;
        }
        this.connect(uid, info.session, info.muted);
      }

      this.publish();
    }));
  }

  private watchMail(): void {
    const q = query(this.mail(), where('to', '==', this.uid), orderBy('at', 'asc'));

    this.unsubscribers.push(onSnapshot(q, (snap) => {
      if (this.stopped) return;
      for (const change of snap.docChanges()) {
        if (change.type !== 'added') continue;
        const envelope = change.doc.data() as Envelope;
        // Read once, then destroyed: this is a mailbox, not a log, and a
        // replayed offer would tear down a working connection.
        deleteDoc(change.doc.ref).catch(() => {});
        this.receive(envelope).catch(() => {});
      }
    }));
  }

  /** Clears anything addressed to us that was never collected. */
  private async drainMail(): Promise<void> {
    const snap = await getDocs(query(this.mail(), where('to', '==', this.uid)));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref).catch(() => {})));
  }

  /* -------------------------------- peers ------------------------------- */

  /** Of any two participants, the lower uid places the call. Deterministic on
   *  both sides, so exactly one offer is ever made. */
  private isCaller(other: string): boolean {
    return this.uid < other;
  }

  private connect(uid: string, session: string, muted: boolean): void {
    const pc = new RTCPeerConnection({ iceServers: iceServers(), bundlePolicy: 'max-bundle' });

    const audio = document.createElement('audio');
    audio.autoplay = true;
    // Kept out of the layout entirely; the UI shows levels, not players.
    audio.style.display = 'none';
    document.body.appendChild(audio);

    const peer: Peer = {
      pc, audio, queued: [], status: 'connecting',
      speaking: false, lastVoice: 0, level: 0, muted, session,
    };
    this.peers.set(uid, peer);

    for (const track of this.local?.getTracks() ?? []) {
      pc.addTrack(track, this.local!);
    }
    this.capBitrate(pc);

    pc.onicecandidate = (event) => {
      if (event.candidate) this.send(uid, 'candidate', event.candidate.toJSON());
    };

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (!stream) return;
      peer.audio.srcObject = stream;
      // Joining voice is itself a click, so autoplay policy is satisfied —
      // but a rejected play() must not take the connection down with it.
      peer.audio.play().catch(() => {});
      this.attachAnalyser(peer, stream);
    };

    pc.onconnectionstatechange = () => {
      if (this.stopped) return;
      const state = pc.connectionState;
      if (state === 'connected') peer.status = 'connected';
      else if (state === 'failed' || state === 'closed') peer.status = 'failed';
      else if (state === 'disconnected') peer.status = 'connecting';
      this.publish();
    };

    if (this.isCaller(uid)) {
      pc.createOffer()
        .then(async (offer) => {
          await pc.setLocalDescription(offer);
          await this.send(uid, 'offer', offer);
        })
        .catch(() => { peer.status = 'failed'; this.publish(); });
    }
  }

  private async receive(envelope: Envelope): Promise<void> {
    const { from, kind } = envelope;
    let payload: RTCSessionDescriptionInit & RTCIceCandidateInit;
    try { payload = JSON.parse(envelope.payload); } catch { return; }

    let peer = this.peers.get(from);

    // An offer can beat the presence snapshot that would have created the
    // peer. Building it here rather than dropping the offer is what keeps a
    // slow listener from costing a connection.
    if (!peer && kind === 'offer') {
      this.connect(from, '', false);
      peer = this.peers.get(from);
    }
    if (!peer) return;

    const { pc } = peer;

    if (kind === 'offer') {
      await pc.setRemoteDescription(new RTCSessionDescription(payload));
      await this.flushCandidates(peer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await this.send(from, 'answer', answer);
      return;
    }

    if (kind === 'answer') {
      // Ignore an answer that arrives when we are not expecting one; setting
      // a remote description in the wrong state throws and kills the peer.
      if (pc.signalingState !== 'have-local-offer') return;
      await pc.setRemoteDescription(new RTCSessionDescription(payload));
      await this.flushCandidates(peer);
      return;
    }

    // Candidates routinely arrive before the description that gives them
    // meaning. Holding them is the difference between a connection that comes
    // up first time and one that takes a second attempt.
    if (!pc.remoteDescription) { peer.queued.push(payload); return; }
    await pc.addIceCandidate(new RTCIceCandidate(payload)).catch(() => {});
  }

  private async flushCandidates(peer: Peer): Promise<void> {
    const pending = peer.queued;
    peer.queued = [];
    for (const candidate of pending) {
      await peer.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
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
      // Held so the browser does not garbage-collect the graph.
      void source;
    } catch { /* no metering, but voice still works */ }

    const buffer = new Uint8Array(512);

    const tick = () => {
      if (this.stopped) return;
      this.meter = requestAnimationFrame(tick);

      const now = Date.now();
      let anyone = false;

      if (this.selfAnalyser) {
        const level = rms(this.selfAnalyser, buffer);
        this.events.onSelfLevel(level);
        // Your own voice does not duck your own video — you already know you
        // are talking, and hearing the film dip every time you breathe is
        // maddening.
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
