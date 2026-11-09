import { createFileRoute } from "@tanstack/react-router";
import { Activity } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/support/diagnostics")({
  component: SupportDiagnosticsPage,
});

function SupportDiagnosticsPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-[#030957]" />
            <CardTitle>Diagnostics</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>فحوصات سريعة لحالة الجلسة، الاتصال، والأخطاء التشغيلية.</p>
          <p>هذه الصفحة مهيأة لتغذية نتائج فحص health checks لاحقًا.</p>
        </CardContent>
      </Card>
    </div>
  );
}
