import { pageHead } from "@/lib/pageHead";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  XCircle,
  Plug,
  GraduationCap,
  MessageSquare,
  BookOpen,
  Users,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { loadAzureConfig, loadTrainingExamples } from "@/lib/adminConfig";
import { getAdminOverview } from "@/lib/adminStats.functions";

export const Route = createFileRoute("/admin/")({
  head: () => pageHead("لوحة التحكم", "لوحة التحكم في منصة عزبوت للمحادثة وإدارة الوكلاء."),
  component: AdminHome,
});

function AdminHome() {
  const [connected, setConnected] = useState(false);
  const [deployment, setDeployment] = useState("");
  const [trainingCount, setTrainingCount] = useState(0);

  const fetchOverview = useServerFn(getAdminOverview);
  const overview = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => fetchOverview(),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const cfg = loadAzureConfig();
    setConnected(Boolean(cfg.enabled && cfg.endpoint && cfg.apiKey && cfg.deployment));
    setDeployment(cfg.deployment);
    setTrainingCount(loadTrainingExamples().length);
  }, []);

  const stats = overview.data;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">لوحة التحكم</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          نظرة عامة حقيقية على محادثات البوت وحالة الربط.
        </p>
      </div>

      {overview.isError && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4" />
          تعذر تحميل الإحصائيات. تأكد من صلاحيات حسابك ثم
          <button onClick={() => overview.refetch()} className="font-semibold underline">
            أعد المحاولة
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="حالة الاتصال"
          value={connected ? "متصل بـ Azure OpenAI" : "غير مفعّل"}
          hint={deployment ? `النشر: ${deployment}` : undefined}
          icon={
            connected ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            ) : (
              <XCircle className="h-5 w-5 text-red-500" />
            )
          }
          small
        />
        <StatCard
          label="المحادثات"
          value={stats ? String(stats.conversations) : undefined}
          loading={overview.isLoading}
          hint={stats ? `${stats.humanTakeover} محادثة بتدخل بشري` : undefined}
          icon={<Users className="h-5 w-5 text-[#030957]" />}
        />
        <StatCard
          label="الرسائل"
          value={stats ? String(stats.messages) : undefined}
          loading={overview.isLoading}
          hint={stats ? `${stats.messagesLast7Days} رسالة في 7 أيام` : undefined}
          icon={<MessageSquare className="h-5 w-5 text-[#030957]" />}
        />
        <StatCard
          label="ملفات قاعدة المعرفة"
          value={stats ? String(stats.knowledgeDocuments) : undefined}
          loading={overview.isLoading}
          icon={<BookOpen className="h-5 w-5 text-[#ffb900]" />}
        />
        <StatCard
          label="أمثلة التدريب"
          value={String(trainingCount)}
          hint="سؤال/جواب محفوظ"
          icon={<GraduationCap className="h-5 w-5 text-[#ffb900]" />}
        />
      </div>

      <section className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold">أحدث المحادثات</h2>
        {overview.isLoading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحميل…
          </div>
        ) : stats && stats.recentConversations.length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 font-medium">الزائر</th>
                  <th className="py-2 font-medium">الرسائل</th>
                  <th className="py-2 font-medium">الحالة</th>
                  <th className="py-2 font-medium">آخر نشاط</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentConversations.map((c) => (
                  <tr key={c.id} className="border-t border-black/5">
                    <td className="py-2">{c.visitor_name || "زائر"}</td>
                    <td className="py-2">{c.message_count}</td>
                    <td className="py-2">{c.status}</td>
                    <td className="py-2 text-xs text-muted-foreground" dir="ltr">
                      {c.last_message_at
                        ? new Date(c.last_message_at).toLocaleString("ar-EG")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">لا توجد محادثات مسجّلة بعد.</p>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <QuickLink
          to="/admin/integration"
          icon={<Plug className="h-6 w-6 text-[#030957]" />}
          title="إعداد Azure OpenAI"
          desc="Endpoint و API Key وإعدادات النموذج."
        />
        <QuickLink
          to="/admin/training"
          icon={<GraduationCap className="h-6 w-6 text-[#030957]" />}
          title="تدريب البوت"
          desc="جرّب البوت وعدّل الردود واحفظها."
        />
        <QuickLink
          to="/admin/knowledge"
          icon={<BookOpen className="h-6 w-6 text-[#030957]" />}
          title="قاعدة المعرفة"
          desc="ارفع ملفات التوجيه والمستندات."
        />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon,
  loading,
  small,
}: {
  label: string;
  value?: string;
  hint?: string;
  icon: React.ReactNode;
  loading?: boolean;
  small?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        {icon}
      </div>
      <div className={small ? "mt-2 text-lg font-bold" : "mt-2 text-3xl font-bold"}>
        {loading ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        ) : (
          (value ?? "—")
        )}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function QuickLink({
  to,
  icon,
  title,
  desc,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <Link
      to={to}
      className="group rounded-2xl border border-black/5 bg-white p-5 shadow-sm transition hover:border-[#ffb900]/40 hover:shadow-md"
    >
      {icon}
      <div className="mt-3 font-bold">{title}</div>
      <div className="mt-1 text-sm text-muted-foreground">{desc}</div>
      <div className="mt-3 text-xs font-semibold text-[#030957] group-hover:text-[#ffb900]">
        فتح ←
      </div>
    </Link>
  );
}
