"use client";

import { useState } from "react";
import {
  Button,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  toast,
} from "@fylym/ui";
import type { ExportFormat } from "@fylym/contracts";
import { useExport } from "@/lib/editor-hooks";

const FORMATS: { value: ExportFormat; label: string }[] = [
  { value: "pdf", label: "PDF" },
  { value: "fdx", label: "Final Draft (FDX)" },
  { value: "fountain", label: "Fountain" },
];

export function ExportDialog({ scriptId }: { scriptId: string }) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [sceneNumbers, setSceneNumbers] = useState(false);
  const runExport = useExport(scriptId);

  async function onExport() {
    try {
      const { blob, filename } = await runExport.mutateAsync({
        format,
        options: { sceneNumbers, titlePage: true },
      });
      // Stream the file straight to the browser's downloads.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${filename}`);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Export</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export script</DialogTitle>
        </DialogHeader>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Format</legend>
          {FORMATS.map((f) => (
            <label key={f.value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="format"
                value={f.value}
                checked={format === f.value}
                onChange={() => setFormat(f.value)}
              />
              {f.label}
            </label>
          ))}
        </fieldset>

        {format === "pdf" && (
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={sceneNumbers}
              onChange={(e) => setSceneNumbers(e.target.checked)}
            />
            Scene numbers
          </label>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button
            onClick={onExport}
            disabled={runExport.isPending}
            data-testid="export-button"
          >
            {runExport.isPending ? "Exporting…" : "Export"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
