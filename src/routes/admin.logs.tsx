import { createFileRoute } from "@tanstack/react-router";
import { ScrollText } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/admin/logs")({
  component: AdminLogsPage,
});

function AdminLogsPage() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-[#030957]" />
          <CardTitle>Logs</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        سجل الأحداث والأخطاء وعمليات التدقيق.
      </CardContent>
    </Card>
  );
}
