import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mockOffer = vi.hoisted(() => vi.fn());
vi.mock("@/lib/guestRealtime.functions", () => ({ guestRealtimeOffer: mockOffer }));

import { startLiveCall } from "@/lib/liveCall";

const AGENT = "11111111-1111-4111-8111-111111111111";

describe("guest WebRTC live call", () => {
  const stopTrack = vi.fn();
  let channel: { close: () => void; onmessage?: (e: { data: string }) => void };
  let pc: { close: () => void; connectionState: string; onconnectionstatechange?: () => void };

  beforeEach(() => {
    vi.clearAllMocks();
    channel = { close: vi.fn() };
    pc = { close: vi.fn(), connectionState: "new" };
    class Peer {
      get connectionState() { return pc.connectionState; }
      set onconnectionstatechange(callback: (() => void) | undefined) { pc.onconnectionstatechange = callback; }
      addTrack() {}
      createDataChannel() { return channel; }
      createOffer() { return Promise.resolve({ type: "offer", sdp: "v=0 offer" }); }
      setLocalDescription() { return Promise.resolve(); }
      setRemoteDescription() { return Promise.resolve(); }
      close() { pc.close(); }
    }
    vi.stubGlobal("RTCPeerConnection", Peer);
    Object.defineProperty(window, "RTCPeerConnection", { configurable: true, value: Peer });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({
        getAudioTracks: () => [{ enabled: true, stop: stopTrack }],
        getTracks: () => [{ stop: stopTrack }],
      }) },
    });
    mockOffer.mockResolvedValue({ supported: true, sdpAnswer: "v=0 answer", maxDurationSeconds: 120 });
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it("handles GA audio transcript events and releases the microphone on hangup", async () => {
    const onAssistantText = vi.fn();
    const onClosed = vi.fn();
    const handle = await startLiveCall(AGENT, { onAssistantText, onClosed });
    channel.onmessage?.({ data: JSON.stringify({
      type: "response.output_audio_transcript.delta", delta: "أهلاً",
    }) });
    channel.onmessage?.({ data: JSON.stringify({
      type: "response.output_audio_transcript.done",
    }) });
    expect(onAssistantText).toHaveBeenCalledWith("أهلاً");
    handle.stop();
    handle.stop();
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(channel.close).toHaveBeenCalledOnce();
    expect(pc.close).toHaveBeenCalledOnce();
    expect(onClosed).not.toHaveBeenCalled();
  });

  it("cleans up when the Foundry SDP negotiation fails", async () => {
    mockOffer.mockRejectedValueOnce(new Error("REALTIME_PROVIDER_ERROR"));
    await expect(startLiveCall(AGENT, {})).rejects.toThrow("REALTIME_PROVIDER_ERROR");
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(channel.close).toHaveBeenCalledOnce();
    expect(pc.close).toHaveBeenCalledOnce();
  });

  it("fires the onClosed callback only once on connection failure", async () => {
    const onClosed = vi.fn();
    await startLiveCall(AGENT, { onClosed });
    pc.connectionState = "failed";
    pc.onconnectionstatechange?.();
    pc.connectionState = "closed";
    pc.onconnectionstatechange?.();
    expect(onClosed).toHaveBeenCalledOnce();
    expect(stopTrack).toHaveBeenCalledOnce();
  });
});
