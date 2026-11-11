import { guestRealtimeOffer } from "@/lib/guestRealtime.functions";

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
export async function startLiveCall(agentId: string, callbacks: LiveCallCallbacks): Promise<LiveCallHandle> {
  if (typeof window === "undefined" || !window.RTCPeerConnection) {
    throw new Error("WEBRTC_UNSUPPORTED");
  }

  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(agentId))
    throw new Error("REALTIME_AGENT_UNAVAILABLE");

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

  let response: Awaited<ReturnType<typeof guestRealtimeOffer>>;
  try {
    response = await guestRealtimeOffer({ data: { agentId, sdp: offer.sdp ?? "" } });
  } catch (error) {
    stream.getTracks().forEach((t) => t.stop());
    pc.close();
    throw error;
  }
  if (!response.supported) {
    stream.getTracks().forEach((t) => t.stop());
    pc.close();
    throw new Error("REALTIME_UNAVAILABLE");
  }
  await pc.setRemoteDescription({ type: "answer", sdp: response.sdpAnswer });
  const callLimit = window.setTimeout(() => {
    if (closed) return;
    closed = true;
    stream.getTracks().forEach((t) => t.stop());
    channel.close();
    pc.close();
    audio.srcObject = null;
    callbacks.onClosed?.();
  }, response.maxDurationSeconds * 1000);

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
      window.clearTimeout(callLimit);
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
