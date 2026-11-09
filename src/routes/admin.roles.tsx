import { createFileRoute } from "@tanstack/react-router";
import { Shield } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/admin/roles")({
  component: AdminRolesPage,
});

function AdminRolesPage() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-[#030957]" />
          <CardTitle>Roles</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        تعريف الأدوار والصلاحيات ونطاق الوصول.
      </CardContent>
    </Card>
  );
}
