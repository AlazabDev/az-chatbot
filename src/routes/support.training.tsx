import { createFileRoute } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/support/training")({
  component: SupportTrainingPage,
});

function SupportTrainingPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-[#030957]" />
            <CardTitle>Training</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>مخصص لرفع ملفات التدريب، مراجعة الأمثلة، وتحسين سلوك البوت.</p>
          <p>هذه الواجهة ستكون نقطة الدمج مع قاعدة المعرفة لاحقًا.</p>
        </CardContent>
      </Card>
    </div>
  );
}
