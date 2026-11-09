import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Activity, GraduationCap, HelpCircle } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/support/")({
  component: SupportHome,
});

function SupportHome() {
  const cards = [
    {
      to: "/support/faq",
      title: "FAQ",
      desc: "إجابات سريعة على الأسئلة الشائعة.",
      icon: HelpCircle,
    },
    {
      to: "/support/documentation",
      title: "Documentation",
      desc: "توثيق الاستخدام والإعداد والتشغيل.",
      icon: BookOpen,
    },
    {
      to: "/support/training",
      title: "Training",
      desc: "تدريب البوت وتحسين الردود.",
      icon: GraduationCap,
    },
    {
      to: "/support/diagnostics",
      title: "Diagnostics",
      desc: "تشخيص سريع للأخطاء ومشاكل الاتصال.",
      icon: Activity,
    },
  ] as const;

  return (
    <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Link key={card.to} to={card.to}>
            <Card className="h-full transition hover:-translate-y-0.5 hover:shadow-md">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>{card.title}</CardTitle>
                  <Icon className="h-5 w-5 text-[#030957]" />
                </div>
                <CardDescription>{card.desc}</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">فتح الصفحة ←</CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
