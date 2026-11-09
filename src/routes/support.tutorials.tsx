import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/support/tutorials")({
  component: SupportTutorialsPage,
});

function SupportTutorialsPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#030957]" />
            <CardTitle>Tutorials</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>صفحة دروس سريعة تشرح المهام المتكررة وتدفق الاستخدام.</p>
          <p>يمكن لاحقًا إضافة فيديوهات، صور، أو خطوات تفاعلية.</p>
        </CardContent>
      </Card>
    </div>
  );
}
