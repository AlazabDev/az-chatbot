import { createFileRoute } from "@tanstack/react-router";
import { Bot } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/admin/ai")({
  component: AdminAIPage,
});

function AdminAIPage() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-[#030957]" />
          <CardTitle>AI</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        إعدادات النماذج، الرسائل النظامية، والربط مع مزود الذكاء الاصطناعي.
      </CardContent>
    </Card>
  );
}
