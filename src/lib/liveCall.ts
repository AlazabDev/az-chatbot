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
  let stream: MediaStream | null = null;
  let channel: RTCDataChannel | null = null;
  let callLimit: ReturnType<typeof setTimeout> | undefined;
  const finish = (notify: boolean) => {
    if (closed) return;
    closed = true;
    if (callLimit !== undefined) clearTimeout(callLimit);
    try { stream?.getTracks().forEach((track) => track.stop()); } catch { /* noop */ }
    try { channel?.close(); } catch { /* noop */ }
    try { pc.close(); } catch { /* noop */ }
    audio.srcObject = null;
    if (notify) callbacks.onClosed?.();
  };

  let micTrack: MediaStreamTrack;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const track = stream.getAudioTracks()[0];
    if (!track) throw new Error("MICROPHONE_UNAVAILABLE");
    micTrack = track;
    pc.addTrack(micTrack, stream);
  } catch (error) {
    finish(false);
    throw error;
  }

  pc.ontrack = (e) => {
    audio.srcObject = e.streams[0];
  };

  channel = pc.createDataChannel("oai-events");
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
      case "response.output_audio_transcript.delta":
      case "response.audio_transcript.delta":
      case "response.output_text.delta":
        assistantBuffer += evt.delta ?? "";
        callbacks.onCaption?.(assistantBuffer);
        callbacks.onSpeakingChange?.(true);
        break;
      case "response.output_audio_transcript.done":
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

  let response: Awaited<ReturnType<typeof guestRealtimeOffer>>;
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    response = await guestRealtimeOffer({ data: { agentId, sdp: offer.sdp ?? "" } });
    if (!response.supported) throw new Error("REALTIME_UNAVAILABLE");
    await pc.setRemoteDescription({ type: "answer", sdp: response.sdpAnswer });
  } catch (error) {
    finish(false);
    throw error;
  }
  callLimit = window.setTimeout(() => finish(true), response.maxDurationSeconds * 1000);

  pc.onconnectionstatechange = () => {
    if (closed) return;
    if (pc.connectionState === "connected") callbacks.onConnected?.();
    if (["failed", "closed", "disconnected"].includes(pc.connectionState)) finish(true);
  };

  return {
    stop: () => finish(false),
    setMuted: (muted: boolean) => {
      micTrack.enabled = !muted;
    },
  };
}
