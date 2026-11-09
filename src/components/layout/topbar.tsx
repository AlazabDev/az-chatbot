import { Menu, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface TopbarProps {
  title: string;
  description?: string;
  onMenuClick?: () => void;
  className?: string;
}

export function Topbar({ title, description, onMenuClick, className }: TopbarProps) {
  return (
    <header
      className={cn(
        "flex items-center justify-between gap-4 border-b border-border bg-background px-4 py-3",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {onMenuClick ? (
          <Button variant="ghost" size="icon" onClick={onMenuClick} className="md:hidden">
            <Menu className="h-4 w-4" />
          </Button>
        ) : null}
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold text-foreground">{title}</h1>
          {description ? (
            <p className="truncate text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>

      <div className="hidden w-full max-w-sm items-center gap-2 md:flex">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="بحث سريع" className="pr-9" />
        </div>
      </div>
    </header>
  );
}
