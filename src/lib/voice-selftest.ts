'use client';

import { iceServers, hasTurn, turnUrls } from './voice';
import type { Envelope, VoiceTransport } from './voice-transport';

/* ==========================================================================
   Why voice is not working, answered in five seconds.

   "It says connecting" has three completely different causes with three
   completely different fixes, and from the outside they look identical:

     · the microphone was never granted,
     · Firestore is refusing the signalling channel (rules not deployed),
     · or the two networks cannot find a path to each other (needs a relay).

   Guessing between them costs an evening. This checks all three directly and
   names the one that is actually wrong.

   The network check is the interesting one. It builds a throwaway peer
   connection and watches which kinds of ICE candidate the browser manages to
   gather:

     host   — this machine's own address. Always present; proves nothing.
     srflx  — the public address STUN discovered. Proves STUN is reachable.
     relay  — an address on a TURN server. Proves the relay works, which is
              the only thing that gets two hostile networks connected.

   No relay candidate with TURN configured means the credentials or the URL
   are wrong, and that is worth knowing before blaming the code.
   ========================================================================== */

export interface Check {
  ok: boolean;
  label: string;
  detail: string;
}

export interface SelfTest {
  microphone: Check;
  signalling: Check;
  network: Check;
  candidates: { host: number; srflx: number; relay: number };
  /** Exactly the TURN URLs that were tried, after normalisation — so a typo
   *  in the environment variable is visible rather than inferred. */
  turnUrls: string[];
  /** What the STUN/TURN servers said when they refused. This is the answer to
   *  "why is there no relay candidate", and it is otherwise only visible in
   *  the browser console. */
  iceErrors: string[];
  /** The single sentence worth reading. */
  verdict: string;
  /** What to actually do about it, when there is something to do. */
  remedy?: string;
}

const GATHER_TIMEOUT_MS = 8000;
const SIGNAL_TIMEOUT_MS = 8000;

async function checkMicrophone(): Promise<Check> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return {
      ok: false,
      label: 'Microphone',
      detail: 'This browser exposes no microphone API. On iOS, voice needs Safari or a browser using its engine.',
    };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const track = stream.getAudioTracks()[0];
    const name = track?.label || 'default input';
    for (const t of stream.getTracks()) t.stop();
    return { ok: true, label: 'Microphone', detail: `Granted — ${name}` };
  } catch (err) {
    const code = (err as { name?: string }).name;
    return {
      ok: false,
      label: 'Microphone',
      detail:
        code === 'NotAllowedError' ? 'Blocked. Allow the microphone from the icon in the address bar.'
          : code === 'NotFoundError' ? 'No microphone is attached to this device.'
            : code === 'NotReadableError' ? 'Another application is holding the microphone.'
              : `Refused: ${(err as Error).message}`,
    };
  }
}

/** Round-trips one envelope through the real signalling path, addressed to
 *  ourselves. Exercises exactly the collections and rules that voice uses. */
async function checkSignalling(transport: VoiceTransport, uid: string): Promise<Check> {
  const marker = `selftest-${Math.random().toString(36).slice(2, 10)}`;

  return new Promise<Check>((resolve) => {
    let stop: (() => void) | null = null;
    let settled = false;

    const finish = (check: Check) => {
      if (settled) return;
      settled = true;
      stop?.();
      transport.drainMail().catch(() => {});
      transport.clearPresence().catch(() => {});
      resolve(check);
    };

    const timer = setTimeout(() => finish({
      ok: false,
      label: 'Signalling',
      detail: 'The message was accepted but never came back. Firestore may be unreachable from this network.',
    }), SIGNAL_TIMEOUT_MS);

    try {
      stop = transport.watchMail(
        (envelope: Envelope) => {
          if (envelope.payload !== JSON.stringify(marker)) return;
          clearTimeout(timer);
          finish({ ok: true, label: 'Signalling', detail: 'Firestore accepted and delivered a test message.' });
        },
        (error) => {
          clearTimeout(timer);
          const code = (error as { code?: string }).code ?? '';
          finish({
            ok: false,
            label: 'Signalling',
            detail: code.includes('permission-denied')
              ? 'Firestore refused to read the signalling channel — the security rules are not deployed.'
              : `Listener failed: ${error.message}`,
          });
        },
      );
    } catch (err) {
      clearTimeout(timer);
      finish({ ok: false, label: 'Signalling', detail: (err as Error).message });
      return;
    }

    // Presence first: it is the write that the rules are strictest about.
    transport
      .publishPresence({ session: marker, muted: true })
      .then(() => transport.send({ from: uid, to: uid, kind: 'candidate', payload: JSON.stringify(marker) }))
      .catch((err: Error) => {
        clearTimeout(timer);
        const code = (err as { code?: string }).code ?? '';
        finish({
          ok: false,
          label: 'Signalling',
          detail: code.includes('permission-denied')
            ? 'Firestore refused the write — the security rules are not deployed.'
            : `Write failed: ${err.message}`,
        });
      });
  });
}

/** Gathers candidates against the configured ICE servers and reports which
 *  kinds the network actually allows. */
/** 401 and 403 mean the server heard us and said no; everything else is the
 *  server not being reachable at all. Different problems, different fixes. */
function describeIceError(code: number, text: string, url: string): string {
  const host = url.replace(/^(turns?|stun):/i, '').split('?')[0];
  if (code === 401) return `${host} rejected the credentials (401). The username or password is wrong, or has been rotated.`;
  if (code === 403) return `${host} refused the request (403). The account may be over quota or the server not allowed for this plan.`;
  if (code === 438) return `${host} asked for a retry (438) and never completed. Usually a clock skew problem.`;
  if (code === 701) return `${host} could not be reached (701). The hostname is wrong, or this network blocks it.`;
  return `${host}: ${text || 'no detail'} (${code})`;
}

async function checkNetwork(): Promise<{
  check: Check;
  candidates: SelfTest['candidates'];
  iceErrors: string[];
}> {
  const candidates = { host: 0, srflx: 0, relay: 0 };
  const iceErrors: string[] = [];

  let pc: RTCPeerConnection;
  try {
    pc = new RTCPeerConnection({ iceServers: iceServers() });
  } catch (err) {
    // The commonest cause is a URL with no scheme, which WebRTC rejects
    // outright — and which is exactly what a provider dashboard hands you.
    return {
      check: {
        ok: false,
        label: 'Network',
        detail: `WebRTC rejected the server list: ${(err as Error).message}`,
      },
      candidates,
      iceErrors,
    };
  }

  pc.onicecandidateerror = (event) => {
    const e = event as RTCPeerConnectionIceErrorEvent;
    // STUN servers we do not control time out constantly and say nothing
    // useful; only failures against a configured relay are worth reporting.
    const message = describeIceError(e.errorCode, e.errorText, e.url ?? '');
    if (!iceErrors.includes(message)) iceErrors.push(message);
  };

  // A data channel is the cheapest way to make the browser gather at all —
  // without a track or a channel there is nothing to negotiate.
  pc.createDataChannel('probe');

  await new Promise<void>((resolve) => {
    const done = () => resolve();
    const timer = setTimeout(done, GATHER_TIMEOUT_MS);

    pc.onicecandidate = (event) => {
      if (!event.candidate) { clearTimeout(timer); done(); return; }
      const type = event.candidate.type;
      if (type === 'host') candidates.host += 1;
      else if (type === 'srflx' || type === 'prflx') candidates.srflx += 1;
      else if (type === 'relay') candidates.relay += 1;
      // A relay candidate is the answer to the only question that matters;
      // there is nothing to learn from waiting for the rest.
      if (candidates.relay > 0) { clearTimeout(timer); done(); }
    };

    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .catch(() => { clearTimeout(timer); done(); });
  });

  try { pc.close(); } catch { /* already gone */ }

  // Errors against the relay are the interesting ones; a silent STUN server
  // is background noise.
  const relayErrors = iceErrors.filter((e) => turnUrls().some(
    (u) => e.startsWith(u.replace(/^(turns?|stun):/i, '').split('?')[0]),
  ));

  if (candidates.relay > 0) {
    return {
      check: { ok: true, label: 'Network', detail: 'A relay is reachable — this will connect from anywhere.' },
      candidates,
      iceErrors,
    };
  }

  if (hasTurn) {
    return {
      check: {
        ok: false,
        label: 'Network',
        detail: relayErrors.length > 0
          ? relayErrors[0]
          : 'A relay is configured but never answered. Check the hostname, and whether this network allows it.',
      },
      candidates,
      iceErrors,
    };
  }

  if (candidates.srflx > 0) {
    return {
      check: {
        ok: true,
        label: 'Network',
        detail: 'STUN found this machine’s public address. Most connections will work; restrictive networks will not.',
      },
      candidates,
      iceErrors,
    };
  }

  return {
    check: {
      ok: false,
      label: 'Network',
      detail: 'No public address could be discovered. This network blocks STUN, so voice needs a relay.',
    },
    candidates,
    iceErrors,
  };
}

export async function runVoiceSelfTest(transport: VoiceTransport, uid: string): Promise<SelfTest> {
  // In parallel: they are independent, and three sequential timeouts would
  // make a failing test take half a minute.
  const [microphone, signalling, network] = await Promise.all([
    checkMicrophone(),
    checkSignalling(transport, uid),
    checkNetwork(),
  ]);

  const result: SelfTest = {
    microphone,
    signalling,
    network: network.check,
    candidates: network.candidates,
    turnUrls: turnUrls(),
    iceErrors: network.iceErrors,
    verdict: '',
  };

  // Reported in the order they have to be fixed in: no microphone means no
  // call at all, no signalling means no negotiation, and only then does the
  // network path matter.
  if (!microphone.ok) {
    result.verdict = 'Voice cannot start: the microphone is unavailable.';
    result.remedy = microphone.detail;
  } else if (!signalling.ok) {
    result.verdict = 'Voice cannot negotiate: the signalling channel is refused.';
    result.remedy = 'Run: firebase deploy --only firestore:rules';
  } else if (!network.check.ok && hasTurn) {
    result.verdict = 'Signalling works, but the relay is not answering.';
    result.remedy = network.check.detail.includes('401')
      ? 'The credentials are wrong or have been rotated. Copy them again from the provider and redeploy.'
      : network.check.detail.includes('701')
        ? 'The hostname is wrong. Copy it exactly from the provider dashboard and redeploy.'
        : 'Check NEXT_PUBLIC_TURN_URL, _USERNAME and _CREDENTIAL, then redeploy.';
  } else if (!network.check.ok) {
    result.verdict = 'Signalling works, but this network gives out no reachable address.';
    result.remedy = 'Add a TURN relay: set NEXT_PUBLIC_TURN_URL, _USERNAME and _CREDENTIAL.';
  } else if (!hasTurn) {
    result.verdict = 'Everything works here. Without a relay, some networks will still fail.';
    result.remedy = 'Optional: add TURN so every network connects.';
  } else {
    result.verdict = 'Everything checks out — microphone, signalling and relay.';
  }

  return result;
}
