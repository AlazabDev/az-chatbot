import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { FileText, BookOpen, HelpCircle, GraduationCap, LibraryBig, Activity } from "lucide-react";

import { Sidebar, type SidebarItem } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

const supportNav: SidebarItem[] = [
  { to: "/support", label: "نظرة عامة", icon: HelpCircle, exact: true },
  { to: "/support/faq", label: "FAQ", icon: HelpCircle },
  { to: "/support/documentation", label: "Documentation", icon: BookOpen },
  { to: "/support/tutorials", label: "Tutorials", icon: FileText },
  { to: "/support/training", label: "Training", icon: GraduationCap },
  { to: "/support/prompt-library", label: "Prompt Library", icon: LibraryBig },
  { to: "/support/diagnostics", label: "Diagnostics", icon: Activity },
];

export const Route = createFileRoute("/support")({
  component: SupportLayout,
});

function SupportLayout() {
  return (
    <div dir="rtl" className="flex min-h-dvh bg-background text-foreground">
      <div className="hidden md:block">
        <Sidebar
          title="Azabot Support"
          subtitle="مركز الدعم والتدريب"
          items={supportNav}
          footer={
            <Link to="/" className="text-xs text-muted-foreground transition hover:text-foreground">
              العودة إلى الواجهة
            </Link>
          }
        />
      </div>

      <main className="flex min-h-dvh flex-1 flex-col">
        <Topbar title="Support Center" description="المساعدة، التدريب، والتشخيص" />
        <div className="flex-1 p-4 md:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
