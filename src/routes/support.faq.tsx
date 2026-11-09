import { createFileRoute } from "@tanstack/react-router";
import { HelpCircle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/support/faq")({
  component: SupportFaqPage,
});

function SupportFaqPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-[#030957]" />
            <CardTitle>FAQ</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>هنا تُعرض إجابات الأسئلة الشائعة الخاصة بالبوت والإدارة والدعم.</p>
          <p>هذه الصفحة جاهزة لاحقًا للتغذية من قاعدة المعرفة.</p>
        </CardContent>
      </Card>
    </div>
  );
}
