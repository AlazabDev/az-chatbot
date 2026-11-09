import { useEffect, useState } from "react";
import { Trash2, Volume2 } from "lucide-react";
import type { ChatSettingsState, ExportFormat, ThemeMode } from "@/types/chat";
import { listVoices, onVoicesChanged, speak } from "@/lib/voice";

interface ChatSettingsProps {
  settings: ChatSettingsState;
  onChange: (next: ChatSettingsState) => void;
  onClear: () => void;
  onClose: () => void;
}

export function ChatSettings({ settings, onChange, onClear, onClose }: ChatSettingsProps) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    setVoices(listVoices());
    return onVoicesChanged(() => setVoices(listVoices()));
  }, []);

  return (
    <div
      className="azab-pop-in absolute inset-x-0 top-0 z-10 m-2 rounded-xl border border-black/5 bg-white p-4 text-sm shadow-xl"
      role="dialog"
      aria-label="إعدادات المساعد"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-[#030957]">الإعدادات</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-muted-foreground hover:text-[#030957] focus:outline-none focus:ring-2 focus:ring-[#ffb900] rounded px-2 py-1"
        >
          إغلاق
        </button>
      </div>

      <div className="space-y-3">
        <label className="flex items-center justify-between gap-3">
          <span className="text-[#030957]">قراءة الردود صوتياً</span>
          <input
            type="checkbox"
            checked={settings.voiceReplies}
            onChange={(e) => onChange({ ...settings, voiceReplies: e.target.checked })}
            className="h-4 w-4 accent-[#ffb900]"
          />
        </label>

        <div className="flex items-center justify-between gap-2">
          <span className="shrink-0 text-[#030957]">الصوت</span>
          <div className="flex min-w-0 items-center gap-1.5">
            <select
              value={settings.voiceURI ?? ""}
              onChange={(e) => onChange({ ...settings, voiceURI: e.target.value })}
              aria-label="اختيار الصوت"
              className="min-w-0 max-w-[170px] truncate rounded-md border border-black/10 bg-white px-2 py-1 text-[#030957] focus:outline-none focus:ring-2 focus:ring-[#ffb900]"
            >
              <option value="">الافتراضي</option>
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => speak("مرحباً، أنا عزبوت.", "ar", settings.voiceURI)}
              aria-label="تجربة الصوت"
              title="تجربة الصوت"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#030957]/70 transition hover:bg-[#030957]/5 hover:text-[#030957] focus:outline-none focus:ring-2 focus:ring-[#ffb900]"
            >
              <Volume2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <label className="flex items-center justify-between gap-3">
          <span className="text-[#030957]">صيغة التصدير الافتراضية</span>
          <select
            value={settings.exportFormat}
            onChange={(e) =>
              onChange({
                ...settings,
                exportFormat: e.target.value as ExportFormat,
              })
            }
            className="rounded-md border border-black/10 bg-white px-2 py-1 text-[#030957] focus:outline-none focus:ring-2 focus:ring-[#ffb900]"
          >
            <option value="txt">TXT</option>
            <option value="json">JSON</option>
            <option value="md">Markdown</option>
          </select>
        </label>

        <label className="flex items-center justify-between gap-3">
          <span className="text-[#030957]">السمة</span>
          <select
            value={settings.theme}
            onChange={(e) =>
              onChange({
                ...settings,
                theme: e.target.value as ThemeMode,
              })
            }
            className="rounded-md border border-black/10 bg-white px-2 py-1 text-[#030957] focus:outline-none focus:ring-2 focus:ring-[#ffb900]"
          >
            <option value="light">فاتحة</option>
            <option value="dark">داكنة</option>
          </select>
        </label>

        <button
          type="button"
          onClick={onClear}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-600 transition hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-300"
        >
          <Trash2 className="h-4 w-4" />
          مسح المحادثة
        </button>
      </div>
    </div>
  );
}
