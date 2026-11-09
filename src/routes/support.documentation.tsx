import { createFileRoute } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/support/documentation")({
  component: SupportDocumentationPage,
});

function SupportDocumentationPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-[#030957]" />
            <CardTitle>Documentation</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>تجميع خطوات التثبيت، الإعداد، والتشغيل في صفحة واحدة قابلة للتوسعة.</p>
          <p>الصفحة مهيأة لربطها لاحقًا بتوثيق Markdown أو قاعدة معرفة.</p>
        </CardContent>
      </Card>
    </div>
  );
}
