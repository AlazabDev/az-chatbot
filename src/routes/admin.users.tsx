import { pageHead } from "@/lib/pageHead";
import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/admin/users")({
  head: () => pageHead("إدارة المستخدمين", "إدارة المستخدمين في منصة عزبوت للمحادثة وإدارة الوكلاء."),
  component: AdminUsersPage,
});

function AdminUsersPage() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-[#030957]" />
          <CardTitle>Users</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        إدارة المستخدمين، الدعوات، والصلاحيات.
      </CardContent>
    </Card>
  );
}
