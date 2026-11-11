import { foundryRealtimeSession } from "@/lib/foundry.functions";
import { logChatError } from "@/lib/chatErrors";

export interface LiveCallHandle {
  stop: () => void;
  setMuted: (muted: boolean) => void;
}

export interface LiveCallCallbacks {
  onConnected?: () => void;
  onSpeakingChange?: (speaking: boolean) => void;
  onUserText?: (text: string) => void;
  onAssistantText?: (text: string) => void;
  onCaption?: (text: string) => void;
  onClosed?: () => void;
}

interface RealtimeEvent {
  type?: string;
  delta?: string;
  transcript?: string;
}

/**
 * Starts a true live (full-duplex) voice call over WebRTC using an ephemeral
 * Realtime session minted server-side. Throws a controlled local error when
 * Realtime is unavailable so the caller can fall back without a server 500.
 */
export async function startLiveCall(callbacks: LiveCallCallbacks): Promise<LiveCallHandle> {
  if (typeof window === "undefined" || !window.RTCPeerConnection) {
    throw new Error("WEBRTC_UNSUPPORTED");
  }

  const session = await foundryRealtimeSession({ data: {} });
  if (!session.supported) {
    throw new Error("REALTIME_UNAVAILABLE");
  }

  const token = session.client_secret?.value;
  const url = session.webrtc_url;
  if (!token || !url) throw new Error("REALTIME_UNAVAILABLE");

  const pc = new RTCPeerConnection();
  const audio = new Audio();
  audio.autoplay = true;

  let closed = false;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const [micTrack] = stream.getAudioTracks();
  pc.addTrack(micTrack, stream);

  pc.ontrack = (e) => {
    audio.srcObject = e.streams[0];
  };

  const channel = pc.createDataChannel("oai-events");
  let assistantBuffer = "";
  let userBuffer = "";

  channel.onmessage = (e) => {
    let evt: RealtimeEvent;
    try {
      evt = JSON.parse(e.data as string) as RealtimeEvent;
    } catch {
      return;
    }
    switch (evt.type) {
      case "response.audio_transcript.delta":
      case "response.output_text.delta":
        assistantBuffer += evt.delta ?? "";
        callbacks.onCaption?.(assistantBuffer);
        callbacks.onSpeakingChange?.(true);
        break;
      case "response.audio_transcript.done":
      case "response.output_text.done":
        if (assistantBuffer.trim()) {
          callbacks.onAssistantText?.(assistantBuffer.trim());
        }
        assistantBuffer = "";
        callbacks.onSpeakingChange?.(false);
        break;
      case "conversation.item.input_audio_transcription.delta":
        userBuffer += evt.delta ?? "";
        callbacks.onCaption?.(userBuffer);
        break;
      case "conversation.item.input_audio_transcription.completed": {
        const text = (evt.transcript ?? userBuffer).trim();
        if (text) callbacks.onUserText?.(text);
        userBuffer = "";
        break;
      }
      default:
        break;
    }
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  const res = await fetch(url, {
    method: "POST",
    body: offer.sdp ?? "",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/sdp",
    },
  });
  if (!res.ok) {
    logChatError("realtime-sdp", `${res.status}`);
    stream.getTracks().forEach((t) => t.stop());
    pc.close();
    throw new Error("REALTIME_HANDSHAKE_FAILED");
  }

  await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "connected") callbacks.onConnected?.();
    if (
      !closed &&
      (pc.connectionState === "failed" ||
        pc.connectionState === "closed" ||
        pc.connectionState === "disconnected")
    ) {
      callbacks.onClosed?.();
    }
  };

  return {
    stop: () => {
      closed = true;
      try {
        stream.getTracks().forEach((t) => t.stop());
        channel.close();
        pc.close();
      } catch {
        /* noop */
      }
      audio.srcObject = null;
    },
    setMuted: (muted: boolean) => {
      micTrack.enabled = !muted;
    },
  };
}
