import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Plus, Save, Trash2, Loader2, Star, AlertTriangle, CheckCircle2 } from "lucide-react";
import { listAgents, saveAgent, deleteAgent, type BotAgent } from "@/lib/agents.functions";

export const Route = createFileRoute("/admin/agents")({
  component: AgentsPage,
});

type Draft = Omit<BotAgent, "updated_at">;

const emptyDraft = (): Draft => ({
  id: "",
  name: "",
  description: "",
  provider: "foundry",
  agent_name: "",
  agent_version: "1",
  deployment: "",
  system_prompt: "",
  temperature: 0.7,
  max_tokens: 800,
  is_default: false,
  is_active: true,
  sort_order: 0,
});

export function AgentsPage() {
  const qc = useQueryClient();
  const fetchAgents = useServerFn(listAgents);
  const persist = useServerFn(saveAgent);
  const remove = useServerFn(deleteAgent);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const agents = useQuery({
    queryKey: ["admin", "agents"],
    queryFn: () => fetchAgents(),
  });

  const saveMut = useMutation({
    mutationFn: (d: Draft) => persist({ data: { ...d, id: d.id || null } }),
    onSuccess: () => {
      setDraft(null);
      setNotice("تم حفظ إعدادات الوكيل بنجاح.");
      qc.invalidateQueries({ queryKey: ["admin", "agents"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "agents"] }),
  });

  const errorText =
    (saveMut.error as Error | null)?.message ??
    (deleteMut.error as Error | null)?.message ??
    (agents.error as Error | null)?.message ??
    null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">وكلاء البوت</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            إعداد كامل للبوت مع إمكانية الاتصال بأكثر من وكيل، وتحديد الوكيل الافتراضي للموقع.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDraft(emptyDraft())}
          className="inline-flex items-center gap-2 rounded-xl bg-[#030957] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
        >
          <Plus className="h-4 w-4" /> وكيل جديد
        </button>
      </div>

      {notice && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" /> {notice}
        </div>
      )}
      {errorText && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4" /> {errorText}
        </div>
      )}

      {draft && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveMut.mutate(draft);
          }}
          className="space-y-4 rounded-2xl border border-black/5 bg-white p-5 shadow-sm"
        >
          <h2 className="text-sm font-bold">{draft.id ? "تعديل الوكيل" : "إضافة وكيل"}</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="الاسم المعروض">
              <input
                required
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="المزوّد">
              <select
                value={draft.provider}
                onChange={(e) => setDraft({ ...draft, provider: e.target.value })}
                className={inputCls}
              >
                <option value="foundry">Azure AI Foundry Agent</option>
                <option value="azure-openai">Azure OpenAI Deployment</option>
              </select>
            </Field>
            <Field label="اسم الوكيل في Foundry" hint="مثال: az-agent-azabot">
              <input
                value={draft.agent_name ?? ""}
                onChange={(e) => setDraft({ ...draft, agent_name: e.target.value })}
                dir="ltr"
                className={inputCls}
              />
            </Field>
            <Field label="إصدار الوكيل">
              <input
                value={draft.agent_version}
                onChange={(e) => setDraft({ ...draft, agent_version: e.target.value })}
                dir="ltr"
                className={inputCls}
              />
            </Field>
            <Field label="اسم النشر (Deployment)" hint="لمزوّد Azure OpenAI">
              <input
                value={draft.deployment ?? ""}
                onChange={(e) => setDraft({ ...draft, deployment: e.target.value })}
                dir="ltr"
                className={inputCls}
              />
            </Field>
            <Field label="ترتيب العرض">
              <input
                type="number"
                min={0}
                value={draft.sort_order}
                onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })}
                className={inputCls}
              />
            </Field>
            <Field label={`درجة الإبداع (${draft.temperature})`}>
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={draft.temperature}
                onChange={(e) => setDraft({ ...draft, temperature: Number(e.target.value) })}
                className="w-full accent-[#ffb900]"
              />
            </Field>
            <Field label="أقصى عدد للرموز">
              <input
                type="number"
                min={64}
                max={16000}
                value={draft.max_tokens}
                onChange={(e) => setDraft({ ...draft, max_tokens: Number(e.target.value) })}
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="الوصف">
            <input
              value={draft.description ?? ""}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              className={inputCls}
            />
          </Field>

          <Field label="التوجيهات (System Prompt)">
            <textarea
              rows={5}
              value={draft.system_prompt}
              onChange={(e) => setDraft({ ...draft, system_prompt: e.target.value })}
              className={`${inputCls} resize-y`}
            />
          </Field>

          <div className="flex flex-wrap items-center gap-6 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.is_default}
                onChange={(e) => setDraft({ ...draft, is_default: e.target.checked })}
                className="h-4 w-4 accent-[#ffb900]"
              />
              الوكيل الافتراضي للموقع
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.is_active}
                onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
                className="h-4 w-4 accent-[#ffb900]"
              />
              مفعّل
            </label>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saveMut.isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-[#ffb900] px-4 py-2 text-sm font-semibold text-[#030957] disabled:opacity-50"
            >
              {saveMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              حفظ
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded-xl border border-black/10 px-4 py-2 text-sm"
            >
              إلغاء
            </button>
          </div>
        </form>
      )}

      <section className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold">الوكلاء المسجّلون</h2>
        {agents.isLoading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحميل…
          </div>
        ) : (agents.data?.length ?? 0) === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            لا يوجد وكلاء بعد. أضف أول وكيل لبدء التشغيل.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {agents.data!.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/5 bg-[#f4f5fb] p-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-semibold">
                    <Bot className="h-4 w-4 text-[#030957]" />
                    {a.name}
                    {a.is_default && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#ffb900]/25 px-2 py-0.5 text-[11px] font-semibold">
                        <Star className="h-3 w-3" /> افتراضي
                      </span>
                    )}
                    {!a.is_active && (
                      <span className="rounded-full bg-black/10 px-2 py-0.5 text-[11px]">
                        معطّل
                      </span>
                    )}
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground" dir="ltr">
                    {a.provider} • {a.agent_name ?? a.deployment ?? "—"} • v{a.agent_version} • temp{" "}
                    {a.temperature}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setNotice(null);
                      const { updated_at: _u, ...rest } = a;
                      setDraft(rest);
                    }}
                    className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium hover:border-[#ffb900]"
                  >
                    تعديل
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteMut.mutate(a.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> حذف
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-[#030957] outline-none focus:border-[#ffb900] focus:ring-2 focus:ring-[#ffb900]/30";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}
