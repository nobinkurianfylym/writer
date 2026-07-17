"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, toast } from "@fylym/ui";
import { useBeats, useSaveBeats } from "@/lib/editor-hooks";
import {
  BEAT_COLORS,
  COLOR_ORDER,
  STRUCTURE_TEMPLATES,
  beatsFromTemplate,
  newBeat,
  type Beat,
  type BeatColor,
} from "@/lib/beats";

export function BeatBoard({
  scriptId,
  onImportToScript,
}: {
  scriptId: string;
  onImportToScript?: (beats: Beat[]) => void;
}) {
  const { data: loaded, isLoading } = useBeats(scriptId);
  const save = useSaveBeats(scriptId);
  const saveRef = useRef(save);
  saveRef.current = save;

  const [beats, setBeats] = useState<Beat[] | null>(null);
  const [structureOpen, setStructureOpen] = useState(false);
  const [renamingAct, setRenamingAct] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const dirty = useRef(false);

  // Seed local state once the server data arrives.
  useEffect(() => {
    if (loaded && beats === null) setBeats(loaded);
  }, [loaded, beats]);

  // Debounced autosave whenever the board changes.
  useEffect(() => {
    if (!dirty.current || beats === null) return;
    const t = setTimeout(() => {
      saveRef.current.mutate(beats);
      dirty.current = false;
    }, 600);
    return () => clearTimeout(t);
  }, [beats]);

  // Close the structure menu on outside click.
  useEffect(() => {
    if (!structureOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setStructureOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [structureOpen]);

  const acts = useMemo(() => {
    const order: string[] = [];
    for (const b of beats ?? []) if (!order.includes(b.act)) order.push(b.act);
    if (order.length === 0) order.push("Act I");
    return order;
  }, [beats]);

  if (beats === null) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        {isLoading ? "Loading beat board…" : "Preparing board…"}
      </p>
    );
  }

  const update = (next: Beat[]) => {
    dirty.current = true;
    setBeats(next);
  };
  const patchBeat = (id: string, patch: Partial<Beat>) =>
    update(beats.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const removeBeat = (id: string) => update(beats.filter((b) => b.id !== id));
  const addBeatToAct = (act: string) =>
    update([...beats, newBeat(act, colorForAct(acts, act))]);
  const addAct = () => {
    const name = prompt("Name this act", `Act ${acts.length + 1}`);
    if (!name?.trim()) return;
    update([...beats, newBeat(name.trim(), colorForAct(acts, name.trim()))]);
  };
  const moveBeat = (id: string, dir: -1 | 1) => {
    const idx = beats.findIndex((x) => x.id === id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= beats.length) return;
    const next = beats.slice();
    const a = next[idx];
    const bb = next[target];
    if (!a || !bb) return;
    next[idx] = bb;
    next[target] = a;
    update(next);
  };
  const renameAct = (from: string, to: string) => {
    const name = to.trim();
    setRenamingAct(null);
    if (!name || name === from) return;
    update(beats.map((b) => (b.act === from ? { ...b, act: name } : b)));
  };
  const deleteAct = (act: string) => {
    const actBeats = beats.filter((b) => b.act === act);
    const hasContent = actBeats.some(
      (b) => b.summary.trim() || b.title !== "New beat",
    );
    if (
      hasContent &&
      !confirm(
        `Delete "${act}" and its ${actBeats.length} beat${actBeats.length === 1 ? "" : "s"}?`,
      )
    ) {
      return;
    }
    update(beats.filter((b) => b.act !== act));
  };
  const moveAct = (act: string, dir: -1 | 1) => {
    const order = acts.slice();
    const idx = order.indexOf(act);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= order.length) return;
    const other = order[target];
    if (other === undefined) return;
    order[idx] = other;
    order[target] = act;
    // Regroup the flat beat list to match the new act order.
    update(order.flatMap((a) => beats.filter((b) => b.act === a)));
  };
  const applyStructure = (id: string) => {
    const tpl = STRUCTURE_TEMPLATES.find((t) => t.id === id);
    if (!tpl) return;
    const hasContent = beats.some(
      (b) => b.summary.trim() || b.title !== "New beat",
    );
    if (
      hasContent &&
      !confirm(
        `Replace the current beats with the "${tpl.label}" structure? Existing beat notes will be lost.`,
      )
    ) {
      setStructureOpen(false);
      return;
    }
    update(beatsFromTemplate(tpl));
    setStructureOpen(false);
    toast.success(`Applied ${tpl.label}`);
  };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Beat board
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">
            Plan your structure
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sketch the beats of your story, grouped by act. Everything autosaves.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div ref={menuRef} className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStructureOpen((v) => !v)}
            >
              Apply structure ▾
            </Button>
            {structureOpen && (
              <div className="absolute right-0 z-30 mt-2 max-h-[70vh] w-80 overflow-auto rounded-xl border bg-popover p-2 shadow-2xl">
                <p className="px-3 py-2 text-xs uppercase tracking-widest text-muted-foreground">
                  Story structures
                </p>
                {STRUCTURE_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => applyStructure(t.id)}
                    className="block w-full rounded-lg px-3 py-2.5 text-left transition hover:bg-accent"
                  >
                    <p className="text-sm font-medium">{t.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t.description}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={addAct}>
            + Add act
          </Button>
          {onImportToScript && (
            <Button size="sm" onClick={() => onImportToScript(beats)}>
              Import to Script
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-10">
        {acts.map((act) => {
          const actBeats = beats.filter((b) => b.act === act);
          return (
            <section key={act}>
              <div className="group/act mb-4 flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                {renamingAct === act ? (
                  <input
                    autoFocus
                    defaultValue={act}
                    aria-label={`Rename ${act}`}
                    onBlur={(e) => renameAct(act, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter")
                        renameAct(act, e.currentTarget.value);
                      if (e.key === "Escape") setRenamingAct(null);
                    }}
                    className="rounded border bg-transparent px-2 py-0.5 text-lg font-medium tracking-tight outline-none"
                  />
                ) : (
                  <button
                    onClick={() => setRenamingAct(act)}
                    title="Rename act"
                    className="rounded px-1 text-lg font-medium tracking-tight hover:bg-accent"
                  >
                    {act}
                  </button>
                )}
                <span className="text-xs text-muted-foreground">
                  {actBeats.length} beat{actBeats.length === 1 ? "" : "s"}
                </span>
                <span className="flex items-center gap-1 opacity-0 transition group-hover/act:opacity-100 focus-within:opacity-100">
                  <button
                    onClick={() => moveAct(act, -1)}
                    className="rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent"
                    aria-label={`Move ${act} up`}
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveAct(act, 1)}
                    className="rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent"
                    aria-label={`Move ${act} down`}
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => deleteAct(act)}
                    className="rounded px-1.5 py-1 text-xs text-muted-foreground hover:text-destructive"
                    aria-label={`Delete ${act}`}
                  >
                    Delete
                  </button>
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {actBeats.map((bt) => {
                  const c = BEAT_COLORS[bt.color];
                  return (
                    <article
                      key={bt.id}
                      className="group relative flex flex-col overflow-hidden rounded-xl border p-5 shadow-sm transition hover:shadow-md"
                      style={{ borderColor: c.ring, background: c.tint }}
                    >
                      <div
                        className="absolute left-0 top-0 h-1.5 w-full"
                        style={{ background: c.swatch }}
                      />
                      <input
                        value={bt.title}
                        onChange={(e) =>
                          patchBeat(bt.id, { title: e.target.value })
                        }
                        placeholder="Beat title"
                        className="mt-2 w-full bg-transparent text-lg font-medium text-foreground outline-none placeholder:text-muted-foreground/60"
                      />
                      <textarea
                        value={bt.summary}
                        onChange={(e) =>
                          patchBeat(bt.id, { summary: e.target.value })
                        }
                        placeholder="What happens in this beat?"
                        rows={4}
                        className="mt-2 w-full flex-1 resize-none bg-transparent text-sm leading-relaxed text-foreground/85 outline-none placeholder:text-muted-foreground/60"
                      />
                      <div className="mt-4 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          {COLOR_ORDER.map((cc) => (
                            <button
                              key={cc}
                              title={cc}
                              onClick={() => patchBeat(bt.id, { color: cc })}
                              className={`h-3.5 w-3.5 rounded-full ring-1 ring-black/10 transition hover:scale-110 ${
                                bt.color === cc
                                  ? "outline outline-2 outline-offset-1 outline-foreground"
                                  : ""
                              }`}
                              style={{ background: BEAT_COLORS[cc].swatch }}
                              aria-label={`Color ${cc}`}
                            />
                          ))}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                          <button
                            onClick={() => moveBeat(bt.id, -1)}
                            className="rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-black/5"
                            aria-label="Move up"
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => moveBeat(bt.id, 1)}
                            className="rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-black/5"
                            aria-label="Move down"
                          >
                            ↓
                          </button>
                          <button
                            onClick={() => removeBeat(bt.id)}
                            className="rounded px-1.5 py-1 text-xs text-muted-foreground hover:text-destructive"
                            aria-label="Delete beat"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
                <button
                  onClick={() => addBeatToAct(act)}
                  className="flex min-h-[180px] items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground transition hover:border-foreground hover:text-foreground"
                >
                  + Add beat
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Give each act its own default accent color so a fresh board reads clearly. */
function colorForAct(acts: string[], act: string): BeatColor {
  const i = acts.indexOf(act);
  return COLOR_ORDER[(i < 0 ? acts.length : i) % COLOR_ORDER.length] ?? "slate";
}
