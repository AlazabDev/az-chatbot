import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Plug,
  GraduationCap,
  BookOpen,
  ArrowLeft,
  Users,
  Shield,
  Bot,
  ScrollText,
  Settings,
  BarChart3,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      throw redirect({ to: "/auth", search: { reason: "signin" } });
    }
    const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (roleErr) {
      if (import.meta.env.DEV) console.error("[admin] has_role failed", roleErr);
      throw redirect({ to: "/auth", search: { reason: "error" } });
    }
    if (!isAdmin) {
      throw redirect({ to: "/auth", search: { reason: "forbidden" } });
    }
  },
  component: AdminLayout,
});

const navItems = [
  { to: "/admin", label: "لوحة التحكم", icon: LayoutDashboard, exact: true },
  { to: "/admin/users", label: "المستخدمون", icon: Users },
  { to: "/admin/roles", label: "الأدوار", icon: Shield },
  { to: "/admin/ai", label: "الذكاء الاصطناعي", icon: Bot },
  { to: "/admin/knowledge", label: "قاعدة المعرفة", icon: BookOpen },
  { to: "/admin/training", label: "تدريب البوت", icon: GraduationCap },
  { to: "/admin/logs", label: "Logs", icon: ScrollText },
  { to: "/admin/settings", label: "الإعدادات", icon: Settings },
  { to: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/admin/integration", label: "إعدادات Azure OpenAI", icon: Plug },
  { to: "/admin/foundry", label: "وكلاء Microsoft Foundry", icon: Bot },
];

function AdminLayout() {
  return (
    <div dir="rtl" className="min-h-dvh bg-[#f4f5fb] text-[#030957]">
      <div className="flex min-h-dvh">
        <aside className="hidden w-64 shrink-0 border-l border-black/5 bg-white p-4 md:flex md:flex-col">
          <div className="mb-6 flex items-center gap-2 px-2">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold text-white"
              style={{ background: "linear-gradient(135deg,#030957,#1a237e)" }}
            >
              AZ
            </div>
            <div>
              <div className="text-sm font-bold">Azab Admin</div>
              <div className="text-[11px] text-muted-foreground">لوحة تحكم البوت</div>
            </div>
          </div>

          <nav className="flex flex-col gap-1">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.exact }}
                className="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition hover:bg-[#030957]/5"
                activeProps={{
                  className:
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm bg-[#030957] text-white hover:bg-[#030957]",
                }}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>

          <div className="mt-auto pt-4">
            <Link
              to="/"
              className="flex items-center gap-2 rounded-lg border border-black/10 px-3 py-2 text-xs text-muted-foreground transition hover:bg-white hover:text-[#030957]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              العودة إلى الموقع
            </Link>
          </div>
        </aside>

        <main className="flex-1 overflow-x-hidden">
          <header className="sticky top-0 z-10 border-b border-black/5 bg-white/80 px-6 py-4 backdrop-blur md:hidden">
            <div className="flex items-center justify-between">
              <div className="font-bold">Azab Admin</div>
              <Link to="/" className="text-xs text-muted-foreground">
                ← الموقع
              </Link>
            </div>
            <nav className="mt-3 flex gap-2 overflow-x-auto">
              {navItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: item.exact }}
                  className="whitespace-nowrap rounded-full border border-black/10 px-3 py-1 text-xs"
                  activeProps={{
                    className:
                      "whitespace-nowrap rounded-full bg-[#030957] text-white px-3 py-1 text-xs",
                  }}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </header>

          <div className="p-6 md:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
