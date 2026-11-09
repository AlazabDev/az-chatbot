import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export interface SidebarItem {
  to: string;
  label: string;
  icon?: LucideIcon;
  exact?: boolean;
}

interface SidebarProps {
  title: string;
  subtitle?: string;
  items: SidebarItem[];
  footer?: ReactNode;
  className?: string;
}

export function Sidebar({ title, subtitle, items, footer, className }: SidebarProps) {
  return (
    <aside
      className={cn(
        "flex h-full w-72 shrink-0 flex-col border-l border-border bg-background",
        className,
      )}
    >
      <div className="border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#030957] text-sm font-bold text-white">
            AZ
          </div>
          <div>
            <div className="text-sm font-bold text-foreground">{title}</div>
            {subtitle ? <div className="text-xs text-muted-foreground">{subtitle}</div> : null}
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.exact }}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
              activeProps={{
                className:
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm bg-[#030957] text-white hover:bg-[#030957]",
              }}
            >
              {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {footer ? <div className="border-t border-border p-4">{footer}</div> : null}
    </aside>
  );
}
