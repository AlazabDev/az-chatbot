import { useState } from "react";
import { ChatButton } from "./ChatButton";
import { ChatWindow } from "./ChatWindow";
import { useChatSession } from "./useChatSession";

export function ChatbotWidget({
  onOpenChange,
  onStateChange,
}: {
  /** Notified whenever the chat window is opened or closed (used by the embed page). */
  onOpenChange?: (open: boolean) => void;
  onStateChange?: (state: "collapsed" | "expanded" | "open") => void;
} = {}) {
  const [open, setOpen] = useState(false);
  const [launcherExpanded, setLauncherExpanded] = useState(false);
  const [callRequest, setCallRequest] = useState(0);

  const setOpenState = (next: boolean) => {
    setOpen(next);
    if (next) setLauncherExpanded(false);
    onOpenChange?.(next);
    onStateChange?.(next ? "open" : "collapsed");
  };
  const setLauncherState = (expanded: boolean) => {
    setLauncherExpanded(expanded);
    onStateChange?.(expanded ? "expanded" : "collapsed");
  };
  const startCall = () => {
    setCallRequest((value) => value + 1);
    setOpenState(true);
  };
  const {
    hydrated,
    messages,
    setMessages,
    settings,
    setSettings,
    conversationId,
    setConversationId,
    selectedAgentId,
    setSelectedAgentId,
  } = useChatSession();

  if (!hydrated) return null;

  return (
    <>
      <ChatWindow
        open={open}
        messages={messages}
        setMessages={setMessages}
        conversationId={conversationId}
        setConversationId={setConversationId}
        settings={settings}
        setSettings={setSettings}
        callRequest={callRequest}
        selectedAgentId={selectedAgentId}
        onClose={() => setOpenState(false)}
      />
      <ChatButton
        isOpen={open}
        isExpanded={launcherExpanded}
        selectedAgentId={selectedAgentId}
        onSelectAgent={(agent) => {
          if (agent.id !== selectedAgentId) {
            setSelectedAgentId(agent.id);
            setConversationId("");
            setMessages([]);
          }
        }}
        onExpand={() => setLauncherState(true)}
        onCollapse={() => setLauncherState(false)}
        onOpenChat={() => setOpenState(true)}
        onStartCall={startCall}
      />
    </>
  );
}
