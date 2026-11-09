import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/admin/settings")({
  component: AdminSettingsPage,
});

function AdminSettingsPage() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-[#030957]" />
          <CardTitle>Settings</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        إعدادات النظام، المفاتيح، البريد، وWebhooks.
      </CardContent>
    </Card>
  );
}
