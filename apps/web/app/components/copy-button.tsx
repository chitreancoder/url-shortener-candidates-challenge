import { CopyIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function CopyButton({ value, compact = false }: { value: string; compact?: boolean }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied");
    } catch {
      toast.error("Couldn't copy. Select the link and copy it manually.");
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size={compact ? "icon-sm" : "default"}
      onClick={copy}
      aria-label={compact ? `Copy ${value}` : undefined}
    >
      <CopyIcon />
      {!compact && "Copy"}
    </Button>
  );
}
