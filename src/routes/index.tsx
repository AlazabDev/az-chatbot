import { createFileRoute } from "@tanstack/react-router";
import { ChatbotWidget } from "@/components/chatbot/ChatbotWidget";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "عزبوت — المساعد الذكي للصيانة" },
      {
        name: "description",
        content:
          "مساعد عزبوت الذكي: إنشاء طلبات الصيانة والاستفسار عن حالتها بالعربية مباشرة من زر المحادثة العائم.",
      },
      { property: "og:title", content: "عزبوت — المساعد الذكي للصيانة" },
      {
        property: "og:description",
        content: "زر محادثة عائم لإنشاء طلبات الصيانة ومتابعة حالتها بالعربية.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function Index() {
  return (
    <div dir="rtl" className="min-h-dvh w-full bg-transparent">
      {/* Only the floating launcher renders here — no admin or marketing UI. */}
      <ChatbotWidget />
    </div>
  );
}
