import { Plugin, PluginKey, TextSelection, type EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { transliterate } from "./transliterate.js";

export const manglishKey = new PluginKey<ManglishState>("manglish");

// Transaction metas.
export const MANGLISH_TOGGLE = "manglishToggle"; // boolean — enable/disable
const MANGLISH_CANDIDATES = "manglishCandidates"; // { latin, candidates }
const MANGLISH_SET_ACTIVE = "manglishSetActive"; // number (delta)
const MANGLISH_CLEAR = "manglishClear"; // true

/** Fetches ordered Malayalam candidates for a Latin (Manglish) token. */
export type FetchCandidates = (latin: string) => Promise<string[]>;

interface Pending {
  from: number;
  to: number;
  latin: string;
  candidates: string[];
  active: number;
  loading: boolean;
}

export interface ManglishState {
  enabled: boolean;
  pending: Pending | null;
}

/** The Latin word immediately before a collapsed cursor, or null. */
function latinTokenBeforeCursor(
  state: EditorState,
): { from: number; to: number; latin: string } | null {
  const sel = state.selection;
  if (!sel.empty) return null;
  const $from = sel.$from;
  const before = $from.parent.textBetween(0, $from.parentOffset, undefined, "￼");
  const m = before.match(/[A-Za-z]+$/);
  if (!m) return null;
  const latin = m[0];
  const to = $from.pos;
  return { from: to - latin.length, to, latin };
}

export function manglishPlugin(fetchCandidates: FetchCandidates): Plugin<ManglishState> {
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let seq = 0;
  let scheduledFor: string | null = null;

  return new Plugin<ManglishState>({
    key: manglishKey,
    state: {
      init: () => ({ enabled: false, pending: null }),
      apply(tr, value, _old, newState): ManglishState {
        const toggle = tr.getMeta(MANGLISH_TOGGLE);
        if (typeof toggle === "boolean") {
          return { enabled: toggle, pending: null };
        }
        if (tr.getMeta(MANGLISH_CLEAR)) {
          return { ...value, pending: null };
        }
        const cand = tr.getMeta(MANGLISH_CANDIDATES) as
          | { latin: string; candidates: string[] }
          | undefined;
        if (cand && value.pending && value.pending.latin === cand.latin) {
          return {
            ...value,
            pending: { ...value.pending, candidates: cand.candidates, active: 0, loading: false },
          };
        }
        const delta = tr.getMeta(MANGLISH_SET_ACTIVE) as number | undefined;
        if (typeof delta === "number" && value.pending && value.pending.candidates.length > 0) {
          const n = value.pending.candidates.length;
          return {
            ...value,
            pending: { ...value.pending, active: (value.pending.active + delta + n) % n },
          };
        }
        if (!value.enabled) return value.pending ? { ...value, pending: null } : value;

        if (tr.docChanged || tr.selectionSet) {
          const tok = latinTokenBeforeCursor(newState);
          if (!tok) return value.pending ? { ...value, pending: null } : value;
          const same = value.pending && value.pending.latin === tok.latin;
          return {
            enabled: true,
            pending: {
              from: tok.from,
              to: tok.to,
              latin: tok.latin,
              candidates: same ? value.pending!.candidates : [],
              active: same ? value.pending!.active : 0,
              loading: !same,
            },
          };
        }
        return value;
      },
    },
    props: {
      handleKeyDown(view, event) {
        const st = manglishKey.getState(view.state);
        if (!st || !st.enabled || !st.pending) return false;
        const p = st.pending;

        if (event.key === "Escape") {
          view.dispatch(view.state.tr.setMeta(MANGLISH_CLEAR, true));
          return true;
        }
        if (p.candidates.length === 0) return false; // still loading — behave normally

        if (event.key === " " || event.key === "Enter") {
          commit(view, p, p.active, event.key === " ");
          return true;
        }
        if (/^[1-9]$/.test(event.key) && p.candidates.length >= Number(event.key)) {
          commit(view, p, Number(event.key) - 1, true);
          return true;
        }
        if (event.key === "ArrowRight" && p.candidates.length > 1) {
          view.dispatch(view.state.tr.setMeta(MANGLISH_SET_ACTIVE, 1));
          return true;
        }
        if (event.key === "ArrowLeft" && p.candidates.length > 1) {
          view.dispatch(view.state.tr.setMeta(MANGLISH_SET_ACTIVE, -1));
          return true;
        }
        return false;
      },
    },
    view(editorView) {
      const bar = new CandidateBar((index) => {
        const st = manglishKey.getState(editorView.state);
        if (st?.pending) commit(editorView, st.pending, index, true);
        editorView.focus();
      });

      const refresh = () => {
        const st = manglishKey.getState(editorView.state);
        const pending = st?.enabled ? st.pending : null;
        bar.render(pending);

        if (pending && pending.loading && pending.candidates.length === 0) {
          if (scheduledFor !== pending.latin) {
            scheduledFor = pending.latin;
            const latin = pending.latin;
            const mySeq = ++seq;
            if (debounce) clearTimeout(debounce);
            debounce = setTimeout(() => {
              void (async () => {
                let candidates: string[] = [];
                try {
                  candidates = await fetchCandidates(latin);
                } catch {
                  candidates = [];
                }
                if (!candidates || candidates.length === 0) {
                  candidates = [transliterate(latin)];
                }
                if (mySeq !== seq) return;
                const cur = manglishKey.getState(editorView.state);
                if (cur?.enabled && cur.pending && cur.pending.latin === latin) {
                  editorView.dispatch(
                    editorView.state.tr.setMeta(MANGLISH_CANDIDATES, { latin, candidates }),
                  );
                }
              })();
            }, 150);
          }
        } else {
          scheduledFor = null;
        }
      };

      refresh();
      return {
        update: refresh,
        destroy() {
          if (debounce) clearTimeout(debounce);
          bar.destroy();
        },
      };
    },
  });
}

function commit(view: EditorView, p: Pending, index: number, insertSpace: boolean): void {
  const list = p.candidates.length > 0 ? p.candidates : [p.latin];
  const chosen = (list[index] ?? list[0] ?? p.latin) + (insertSpace ? " " : "");
  const tr = view.state.tr.insertText(chosen, p.from, p.to);
  const caret = p.from + chosen.length;
  tr.setSelection(TextSelection.create(tr.doc, caret));
  tr.setMeta(MANGLISH_CLEAR, true);
  view.dispatch(tr);
  view.focus();
}

// A fixed candidate bar rendered at the bottom-center of the viewport.
class CandidateBar {
  private el: HTMLDivElement;

  constructor(private onPick: (index: number) => void) {
    this.el = document.createElement("div");
    this.el.setAttribute("data-testid", "manglish-bar");
    Object.assign(this.el.style, {
      position: "fixed",
      left: "50%",
      bottom: "24px",
      transform: "translateX(-50%)",
      zIndex: "50",
      display: "none",
      maxWidth: "min(92vw, 820px)",
      padding: "8px 10px",
      borderRadius: "12px",
      background: "var(--editor-bg, #fff)",
      color: "var(--editor-fg, #111)",
      border: "1px solid rgba(120,120,130,0.35)",
      boxShadow: "0 10px 40px -12px rgba(0,0,0,0.45)",
      font: "14px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    } as CSSStyleDeclaration);
    document.body.appendChild(this.el);
  }

  render(pending: Pending | null): void {
    if (!pending) {
      this.el.style.display = "none";
      this.el.textContent = "";
      return;
    }
    this.el.style.display = "flex";
    this.el.style.alignItems = "center";
    this.el.style.gap = "8px";
    this.el.style.flexWrap = "wrap";

    const frag = document.createDocumentFragment();

    const latin = document.createElement("span");
    latin.textContent = pending.latin;
    Object.assign(latin.style, {
      opacity: "0.6",
      fontFamily: "ui-monospace, Menlo, monospace",
      paddingRight: "4px",
      borderRight: "1px solid rgba(120,120,130,0.3)",
    } as CSSStyleDeclaration);
    frag.appendChild(latin);

    if (pending.candidates.length === 0) {
      const loading = document.createElement("span");
      loading.textContent = pending.loading ? "Finding…" : "…";
      loading.style.opacity = "0.6";
      frag.appendChild(loading);
    } else {
      pending.candidates.forEach((c, i) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.tabIndex = -1;
        const num = i < 9 ? `${i + 1} ` : "";
        chip.textContent = `${num}${c}`;
        const activeState = i === pending.active;
        Object.assign(chip.style, {
          cursor: "pointer",
          border: "none",
          borderRadius: "8px",
          padding: "4px 10px",
          fontSize: "16px",
          background: activeState ? "var(--editor-accent, #2b4ca6)" : "transparent",
          color: activeState ? "#fff" : "inherit",
        } as CSSStyleDeclaration);
        chip.addEventListener("mousedown", (e) => {
          e.preventDefault();
          this.onPick(i);
        });
        frag.appendChild(chip);
      });
    }

    const hint = document.createElement("span");
    hint.textContent = "Space/Enter pick · 1–9 alt · Esc keep Latin";
    Object.assign(hint.style, {
      marginLeft: "6px",
      opacity: "0.5",
      fontSize: "11px",
    } as CSSStyleDeclaration);
    frag.appendChild(hint);

    this.el.replaceChildren(frag);
  }

  destroy(): void {
    this.el.remove();
  }
}
