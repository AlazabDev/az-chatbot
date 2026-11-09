import { FileText, Image as ImageIcon, X } from "lucide-react";
import type { ChatFile } from "@/types/chat";

interface FileAttachmentPreviewProps {
  files: ChatFile[];
  onRemove: (id: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileAttachmentPreview({ files, onRemove }: FileAttachmentPreviewProps) {
  if (files.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 border-t border-black/5 bg-[#f8f9fc] px-3 py-2">
      {files.map((f) => (
        <div
          key={f.id}
          className="flex items-center gap-2 rounded-lg border border-black/5 bg-white px-2 py-1.5 text-xs shadow-sm"
        >
          {f.dataUrl ? (
            <img src={f.dataUrl} alt={f.name} className="h-7 w-7 rounded object-cover" />
          ) : f.type.startsWith("image/") ? (
            <ImageIcon className="h-4 w-4 text-[#030957]" />
          ) : (
            <FileText className="h-4 w-4 text-[#030957]" />
          )}
          <div className="max-w-[140px] leading-tight">
            <div className="truncate font-medium text-[#030957]">{f.name}</div>
            <div className="text-[10px] text-muted-foreground">{formatBytes(f.size)}</div>
          </div>
          <button
            type="button"
            onClick={() => onRemove(f.id)}
            aria-label={`حذف ${f.name}`}
            className="rounded p-1 text-muted-foreground transition hover:bg-black/5 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-[#ffb900]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
