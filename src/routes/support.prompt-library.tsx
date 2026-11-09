import { createFileRoute } from "@tanstack/react-router";
import { LibraryBig } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/support/prompt-library")({
  component: SupportPromptLibraryPage,
});

function SupportPromptLibraryPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <LibraryBig className="h-5 w-5 text-[#030957]" />
            <CardTitle>Prompt Library</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>مكتبة برومبتات جاهزة لإعادة الاستخدام داخل البوت والإدارة.</p>
          <p>يمكن لاحقًا ربطها بالتقييم والتصنيف والبحث.</p>
        </CardContent>
      </Card>
    </div>
  );
}
