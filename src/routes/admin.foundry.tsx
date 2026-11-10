import { pageHead } from "@/lib/pageHead";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, XCircle, ExternalLink, ShieldCheck } from "lucide-react";
import { getFoundrySettingsStatus, discoverFoundryAgents, testFoundryAgent } from "@/lib/foundry-admin.functions";
import { listAgents, saveAgent } from "@/lib/agents.functions";
import { AgentsPage } from "./admin.agents";

export const Route = createFileRoute("/admin/foundry")({
  head: () => pageHead("وكلاء Microsoft Foundry", "وكلاء Microsoft Foundry في منصة عزبوت للمحادثة وإدارة الوكلاء."),
  component: FoundrySettingsPage,
});

function FoundrySettingsPage() {
  const loadStatus = useServerFn(getFoundrySettingsStatus);
  const loadRemote = useServerFn(discoverFoundryAgents);
  const loadExisting = useServerFn(listAgents);
  const testAgent = useServerFn(testFoundryAgent);
  const [tests, setTests] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const save = useServerFn(saveAgent);
  const qc = useQueryClient();
  const [discover, setDiscover] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const status = useQuery({
    queryKey: ["admin", "foundry", "status"],
    queryFn: () => loadStatus(),
  });
  const remote = useQuery({
    queryKey: ["admin", "foundry", "discovered"],
    queryFn: () => loadRemote(),
    enabled: discover,
    retry: false,
  });

  const testOne = async (name: string) => {
    if (testing) return;
    setTesting(name);
    setTests((state) => ({ ...state, [name]: "جارٍ الاختبار..." }));
    try {
      const r = await testAgent({ data: { name } });
      setTests((state) => ({ ...state, [name]: `ناجح — ${r.latencyMs}ms — ${r.reply}` }));
    } catch (error) {
      setTests((state) => ({ ...state, [name]: `فشل — ${(error as Error).message}` }));
    } finally {
      setTesting(null);
    }
  };
  const importAll = async () => {
    if (!remote.data || importing) return;
    setImporting(true);
    setMessage("");
    let added = 0;
    let updated = 0;
    let skipped = 0;
    try {
      const existing = await loadExisting();
      const byName = new Map(existing.filter((a) => a.provider === "foundry").map((a) => [a.agent_name, a]));
      for (const agent of remote.data) {
        if (!agent.version) { skipped++; continue; }
        const previous = byName.get(agent.name);
        if (previous) {
          if (previous.agent_version === agent.version) { skipped++; continue; }
          await save({ data: { ...previous, agent_version: agent.version } });
          updated++;
          continue;
        }
        await save({ data: {
          name: agent.name, description: agent.description, provider: "foundry",
          agent_name: agent.name, agent_version: agent.version, deployment: null,
          system_prompt: "", temperature: 0.7, max_tokens: 800,
          is_default: false, is_active: true, sort_order: 100 + added,
        } });
        added++;
      }
      await qc.invalidateQueries({ queryKey: ["admin", "agents"] });
      setMessage(`تم إضافة ${added} وكيل وتحديث إصدار ${updated} وكيل، وتخطي ${skipped}.`);
    } catch (error) {
      setMessage(`تمت إضافة ${added} وتحديث ${updated} قبل توقف المزامنة: ${(error as Error).message}`);
    } finally {
      setImporting(false);
    }
  };

  const checks = [
    { label: "FOUNDRY_PROJECT_ENDPOINT", ok: status.data?.endpointConfigured },
    { label: "Microsoft Entra ID (Foundry)", ok: status.data?.credentialConfigured },
    { label: "FOUNDRY_MODEL", ok: status.data?.modelConfigured },
  ];

  return (
    <div dir="rtl" className="mx-auto max-w-5xl space-y-6">
      <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold">إعدادات وكلاء Microsoft Foundry</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          اربط وكلاء مشروع Foundry بواجهة عزبوت: أدخل الاسم والإصدار لكل وكيل، ثم فعّله ليظهر في زر تبديل الوكلاء.
          يتم تنفيذ الطلبات عبر الخادم، ولا تُحفظ مفاتيح Foundry في المتصفح.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {checks.map((check) => (
            <div key={check.label} className="rounded-xl border border-slate-200 bg-[#f4f5fb] p-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                {status.isLoading ? (
                  <span className="h-4 w-4 animate-pulse rounded-full bg-slate-300" />
                ) : check.ok ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600" />
                )}
                {check.label}
              </div>
            </div>
          ))}
        </div>
        {status.data?.endpointHost && (
          <p dir="ltr" className="mt-3 break-all text-xs text-muted-foreground">
            {status.data.endpointHost}
          </p>
        )}
        {status.error && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            تعذر فحص إعدادات الاتصال: {(status.error as Error).message}
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
          <ShieldCheck className="h-4 w-4" />
          <span>تُضبط بيانات الاتصال في متغيرات بيئة الخادم فقط.</span>
          <a
            href="https://learn.microsoft.com/en-us/azure/ai-foundry/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 underline"
          >
            Microsoft Foundry <ExternalLink className="h-3 w-3" />
          </a>
          <Link to="/admin/integration" className="underline">إعدادات Azure OpenAI السابقة</Link>
        </div>
      </section>
      <section className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">اكتشاف الوكلاء من مشروع Foundry</h2>
            <p className="mt-1 text-xs text-muted-foreground">قراءة مباشرة من API دون تعديل الوكلاء على Azure.</p>
          </div>
          <button type="button" onClick={() => { setDiscover(true); void remote.refetch(); }}
            disabled={remote.isFetching}
            className="rounded-lg border border-black/10 px-4 py-2 text-sm disabled:opacity-50">
            {remote.isFetching ? "جارٍ الاتصال..." : "اكتشاف الوكلاء"}
          </button>
        </div>
        {remote.error && <p role="alert" className="mt-3 text-sm text-red-600">{(remote.error as Error).message}</p>}
        {remote.data && (
          <div className="mt-4 space-y-3">
            <p className="text-sm">الوكلاء المكتشفون: {remote.data.length}</p>
            <div className="max-h-96 space-y-2 overflow-auto">
              {remote.data.map((agent) => (
                <div key={agent.name} className="rounded-lg bg-[#f4f5fb] p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span>{agent.name}</span>
                    <span dir="ltr" className="text-xs text-muted-foreground">
                      {agent.version ? "v" + agent.version : "يلزم تحديد الإصدار"}
                    </span>
                    <button type="button" disabled={Boolean(testing)}
                      onClick={() => void testOne(agent.name)}
                      className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs disabled:opacity-50">
                      اختبار التشغيل
                    </button>
                  </div>
                  {tests[agent.name] && <p role="status" className="mt-2 text-xs">{tests[agent.name]}</p>}
                </div>
              ))}
            </div>
            <button type="button" disabled={importing || !remote.data.some((a) => a.version)}
              onClick={importAll}
              className="rounded-lg bg-[#030957] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {importing ? "جارٍ الربط..." : "مزامنة الوكلاء والإصدارات المكتشفة"}
            </button>
          </div>
        )}
        {message && <p role="status" className="mt-3 text-sm">{message}</p>}
      </section>
      <AgentsPage />
    </div>
  );
}
