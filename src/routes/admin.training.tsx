import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, RefreshCw, Loader2, Send, GraduationCap } from "lucide-react";
import { AzureTrainingLegacy } from "@/components/AzureTrainingLegacy";
import { listAgents } from "@/lib/agents.functions";
import { testFoundryAgent } from "@/lib/foundry-admin.functions";
import {
  listAgentTraining, saveAgentTraining, removeAgentTraining,
  previewAgentTraining, publishAgentTraining,
} from "@/lib/foundry-training.functions";

export const Route = createFileRoute("/admin/training")({ component: AgentTrainingPage });

function AgentTrainingPage() {
  const qc = useQueryClient();
  const loadAgents = useServerFn(listAgents);
  const loadExamples = useServerFn(listAgentTraining);
  const saveExample = useServerFn(saveAgentTraining);
  const removeExample = useServerFn(removeAgentTraining);
  const preview = useServerFn(previewAgentTraining);
  const publish = useServerFn(publishAgentTraining);
  const runTest = useServerFn(testFoundryAgent);
  const [mode, setMode] = useState<"foundry" | "azure">("foundry");
  const [selected, setSelected] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [notice, setNotice] = useState("");
  const [review, setReview] = useState<Awaited<ReturnType<typeof preview>> | null>(null);
  const [testResult, setTestResult] = useState("");
  const agents = useQuery({
    queryKey: ["admin","agents"],
    queryFn: () => loadAgents(),
  });
  const foundryAgents = (agents.data || []).filter((agent) => agent.provider === "foundry");
  const agentId = foundryAgents.some((agent) => agent.id === selected) ? selected : (foundryAgents[0]?.id || "");
  const agent = foundryAgents.find((a) => a.id === agentId);
  const examples = useQuery({
    queryKey: ["admin","training",agentId],
    queryFn: () => loadExamples({ data: { agentId } }),
    enabled: Boolean(agentId && mode === "foundry"),
    retry: false,
  });
  const save = useMutation({
    mutationFn: () => saveExample({ data: { agentId, question, answer } }),
    onSuccess: async () => {
      setQuestion(""); setAnswer(""); setReview(null);
      await qc.invalidateQueries({ queryKey: ["admin","training",agentId] });
      setNotice("تم حفظ مثال التدريب داخل قاعدة عزبوت، ولم يتم نشره إلى Foundry بعد.");
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => removeExample({ data: { agentId, id } }),
    onSuccess: async () => {
      setReview(null);
      await qc.invalidateQueries({ queryKey: ["admin","training",agentId] });
    },
  });
  const inspect = useMutation({
    mutationFn: () => preview({ data: { agentId } }),
    onSuccess: (result) => { setReview(result); setNotice("المعاينة جاهزة؛ لم يتم نشر أي إصدار."); },
  });
  const release = useMutation({
    mutationFn: () => publish({ data: { agentId, expectedVersion: review!.baseVersion } }),
    onSuccess: async (result) => {
      setReview(null);
      setNotice(result.message);
      if (result.ok) await qc.invalidateQueries({ queryKey: ["admin","agents"] });
    },
  });
  const verify = useMutation({
    mutationFn: () => runTest({ data: { name: agent!.agent_name! } }),
    onSuccess: (result) => setTestResult(
      `نجح الاتصال بالوكيل ${result.name}، الإصدار ${result.version ?? "غير محدد"}، المدة ${result.latencyMs}ms، الرد: ${result.reply}`),
  });
  const error = [agents.error,examples.error,save.error,remove.error,inspect.error,release.error,verify.error]
    .find(Boolean) as Error | undefined;

  return (
    <div dir="rtl" className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><GraduationCap className="h-6 w-6"/>تدريب واختبار الوكلاء</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            أمثلة تدريب محفوظة لكل وكيل. نشرها إلى Microsoft Foundry ينشئ إصدارًا جديدًا بعد المعاينة.
          </p>
        </div>
        <Link to="/admin/foundry" className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm">إعدادات Foundry</Link>
      </header>
      <div className="flex gap-2">
        <button type="button" onClick={() => setMode("foundry")}
          className={`rounded-lg px-4 py-2 text-sm ${mode === "foundry" ? "bg-[#030957] text-white" : "bg-white"}`}>
          Microsoft Foundry
        </button>
        <button type="button" onClick={() => setMode("azure")}
          className={`rounded-lg px-4 py-2 text-sm ${mode === "azure" ? "bg-[#030957] text-white" : "bg-white"}`}>
          Azure OpenAI (الصفحة السابقة)
        </button>
      </div>
      {mode === "azure" ? <AzureTrainingLegacy /> : (
        <>
          <section className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
            <label className="block text-sm font-semibold" htmlFor="agent-train-select">اختر وكيل Foundry</label>
            <select id="agent-train-select" value={agentId}
              onChange={(e) => { setSelected(e.target.value); setReview(null); setTestResult(""); setNotice(""); }}
              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm">
              {foundryAgents.map((a) => (
                <option key={a.id} value={a.id}>{a.name} — {a.agent_name} — v{a.agent_version}</option>
              ))}
            </select>
            {agent && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="text-xs text-muted-foreground">الإصدار المسجل: {agent.agent_version}</span>
                <button type="button" disabled={verify.isPending || !agent.agent_name}
                  onClick={() => { setTestResult(""); verify.mutate(); }}
                  className="rounded-lg border border-black/10 px-3 py-2 text-xs disabled:opacity-50">
                  {verify.isPending ? "جارٍ اختبار الاتصال..." : "اختبار تشغيل الوكيل فعليًا"}
                </button>
              </div>
            )}
            {testResult && <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">{testResult}</p>}
          </section>
          <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <form onSubmit={(e) => { e.preventDefault(); setNotice(""); save.mutate(); }}
              className="space-y-4 rounded-2xl border border-black/5 bg-white p-5">
              <h2 className="font-bold">إضافة مثال تدريبي للوكيل المحدد</h2>
              <label className="block text-sm">سؤال العميل
                <textarea required maxLength={4000} rows={4} value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  className="mt-1 w-full rounded-lg border p-3" />
              </label>
              <label className="block text-sm">الإجابة المعتمدة
                <textarea required maxLength={8000} rows={6} value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  className="mt-1 w-full rounded-lg border p-3" />
              </label>
              <button type="submit" disabled={!agentId || save.isPending || !question.trim() || !answer.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-[#ffb900] px-4 py-2 text-sm font-semibold text-[#030957] disabled:opacity-50">
                <Send className="h-4 w-4"/> حفظ المثال
              </button>
            </form>
            <div className="rounded-2xl border border-black/5 bg-white p-5">
              <h2 className="font-bold">أمثلة الوكيل ({examples.data?.length || 0})</h2>
              {examples.isLoading && <Loader2 className="mt-3 h-4 w-4 animate-spin"/>}
              <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto">
                {examples.data?.map((ex) => (
                  <div key={ex.id} className="rounded-xl bg-[#f4f5fb] p-3 text-sm">
                    <p className="font-semibold">س: {ex.question}</p>
                    <p className="mt-2 whitespace-pre-wrap text-muted-foreground">ج: {ex.answer}</p>
                    <button type="button" disabled={remove.isPending}
                      onClick={() => remove.mutate(ex.id)}
                      className="mt-2 text-xs text-red-700">حذف المثال</button>
                  </div>
                ))}
              </div>
            </div>
          </section>
          <section className="space-y-3 rounded-2xl border border-black/5 bg-white p-5">
            <h2 className="font-bold">معاينة ونشر التدريب إلى Foundry</h2>
            <p className="text-sm text-muted-foreground">
              المعاينة تقرأ تعريف الإصدار الحالي وتضيف أمثلة التدريب إلى التعليمات،
              وتحافظ على النموذج والأدوات الموجودة. النشر ينشئ إصدارًا جديدًا وليس Fine-tuning لأوزان النموذج.
            </p>
            <button type="button" disabled={!agentId || inspect.isPending}
              onClick={() => { setReview(null); inspect.mutate(); }}
              className="inline-flex items-center gap-2 rounded-lg border border-black/10 px-4 py-2 text-sm disabled:opacity-50">
              <RefreshCw className="h-4 w-4"/> معاينة التغيير قبل النشر
            </button>
            {review && (
              <div className="space-y-3 rounded-xl border border-amber-200 p-4">
                <p className="text-sm">الوكيل: {review.agentName} — الإصدار الحالي: {review.baseVersion} — الأمثلة: {review.exampleCount}</p>
                <p className="text-xs text-muted-foreground">حجم التعليمات: {review.beforeChars} ← {review.afterChars} حرف</p>
                <textarea dir="rtl" readOnly rows={8} value={review.instructionsPreview}
                  className="w-full rounded-lg border bg-slate-50 p-3 text-xs" />
                <button type="button" disabled={release.isPending}
                  onClick={() => {
                    if (window.confirm("سيُنشأ إصدار جديد في Microsoft Foundry وقد يصبح أحدث إصدار مستخدم. هل تؤكد النشر؟"))
                      release.mutate();
                  }}
                  className="rounded-lg bg-[#030957] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {release.isPending ? "جارٍ نشر الإصدار..." : "تأكيد إنشاء إصدار Foundry الجديد"}
                </button>
              </div>
            )}
          </section>
          {notice && <p role="status" className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm">{notice}</p>}
          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error.message}</p>}
        </>
      )}
    </div>
  );
}
