import { useEffect, useState } from "react";
import { pageHead } from "@/lib/pageHead";
import { createFileRoute } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getChatGatewayAnalytics } from "@/lib/chatAnalytics.functions";

type Analytics = Awaited<ReturnType<typeof getChatGatewayAnalytics>>;

export const Route = createFileRoute("/admin/analytics")({
  head: () => pageHead("إحصاءات الشات", "مؤشرات استخدام Foundry الخاصة بالشات العام."),
  component: AdminAnalyticsPage,
});

function AdminAnalyticsPage() {
  const [stats, setStats] = useState<Analytics | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    getChatGatewayAnalytics().then((value) => {
      if (alive) setStats(value);
    }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, []);

  return (
    <Card dir="rtl">
      <CardHeader>
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-[#030957]" />
          <CardTitle>مراقبة بوابة الشات العامة</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p role="alert">تعذّر تحميل إحصاءات Foundry.</p>}
        {!stats && !error && <p role="status">جارٍ تحميل مؤشرات الاستخدام…</p>}
        {stats && (
          <>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
              <Metric label="طلبات آخر 7 أيام" value={stats.totalRequestsLast7Days.toLocaleString("ar-EG")} />
              <Metric label="العينة المحللة" value={stats.sampledRequests.toLocaleString("ar-EG")} />
              <Metric label="Input Tokens" value={stats.inputTokensSampled.toLocaleString("ar-EG")} />
              <Metric label="Output Tokens" value={stats.outputTokensSampled.toLocaleString("ar-EG")} />
              <Metric label="التكلفة التقديرية (USD)" value={stats.estimatedCostUsdSampled.toFixed(4)} />
              <Metric label="زمن الاستجابة P95 (ms)" value={stats.p95LatencyMsSampled.toLocaleString("ar-EG")} />
            </div>
            <div className="rounded-lg border p-3 space-y-2">
              <h3 className="font-semibold">ميزانية Foundry اليومية المحجوزة</h3>
              <p className="text-sm">
                {stats.budget.reservedUsd.toFixed(4)} / {stats.budget.dailyLimitUsd.toFixed(2)} USD
                {" — "}
                {stats.budget.usedPercent}%
              </p>
              <progress className="w-full" max={100} value={Math.min(100, stats.budget.usedPercent)} />
              <p className="text-xs text-muted-foreground">
                الاستهلاك المرصود: {stats.budget.observedUsd.toFixed(4)} USD.
                الحجز احترازي ولا يمثل فاتورة Azure النهائية.
              </p>
              {stats.budget.alerts.map((alert) => (
                <p key={alert.code} role="alert"
                  className={alert.severity === "critical" ? "text-red-700 font-medium" : "text-amber-700"}>
                  {alert.code === "daily_budget_80_percent" ? "تحذير: تجاوز 80% من الميزانية اليومية"
                    : alert.code === "daily_budget_exhausted" ? "حرج: تم بلوغ الميزانية اليومية"
                      : alert.code}
                </p>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              الرموز والتكلفة وزمن الاستجابة محسوبة من أحدث {stats.sampledRequests} طلب ناجح بحد أقصى 1000 طلب، وليست بالضرورة إجمالي آخر سبعة أيام.
              تقدير التكلفة يتطلب ضبط أسعار الرموز على الخادم وعودة usage من Foundry.
            </p>
            <h3 className="font-semibold">أكثر الوكلاء استخدامًا ضمن العينة</h3>
            <div className="space-y-1">
              {stats.agents.map((agent) => (
                <div key={agent.agentId} className="flex items-center justify-between gap-4 rounded-lg border p-2 text-sm">
                  <code className="break-all text-xs" dir="ltr">{agent.agentId}</code>
                  <span>{agent.requests} طلب</span>
                </div>
              ))}
              {!stats.agents.length && <p className="text-sm text-muted-foreground">لا توجد بيانات استخدام مسجلة بعد.</p>}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-muted/30 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums" dir="ltr">{value}</div>
    </div>
  );
}
