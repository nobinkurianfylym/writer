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
        let coords: { left: number; bottom: number } | null = null;
        if (pending) {
          try {
            const c = editorView.coordsAtPos(pending.from);
            coords = { left: c.left, bottom: c.bottom };
          } catch {
            coords = null;
          }
        }
        bar.render(pending, coords);

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
                // Always offer the original English word as the last choice,
                // so a word can be kept in English straight from the list.
                if (!candidates.includes(latin)) candidates = [...candidates, latin];
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

// A candidate dropdown anchored under the word being typed (Google
// Transliteration style): a vertical, numbered list with the top choice
// pre-selected. The original English word is offered as the last option.
class CandidateBar {
  private el: HTMLDivElement;

  constructor(private onPick: (index: number) => void) {
    this.el = document.createElement("div");
    this.el.setAttribute("data-testid", "manglish-bar");
    Object.assign(this.el.style, {
      position: "fixed",
      zIndex: "60",
      display: "none",
      minWidth: "180px",
      maxWidth: "min(88vw, 360px)",
      padding: "4px",
      borderRadius: "10px",
      background: "var(--editor-bg, #fff)",
      color: "var(--editor-fg, #111)",
      border: "1px solid rgba(120,120,130,0.3)",
      boxShadow: "0 12px 34px -10px rgba(0,0,0,0.45)",
      font: "14px/1.35 system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    } as CSSStyleDeclaration);
    document.body.appendChild(this.el);
  }

  render(pending: Pending | null, coords: { left: number; bottom: number } | null): void {
    if (!pending || !coords) {
      this.el.style.display = "none";
      this.el.textContent = "";
      return;
    }
    this.el.style.display = "block";
    // Anchor just below the word; clamp to keep it on-screen.
    const width = Math.min(360, Math.max(180, this.el.offsetWidth || 220));
    const left = Math.max(8, Math.min(coords.left, window.innerWidth - width - 8));
    this.el.style.left = `${left}px`;
    this.el.style.top = `${coords.bottom + 6}px`;

    const frag = document.createDocumentFragment();

    if (pending.candidates.length === 0) {
      const loading = document.createElement("div");
      loading.textContent = pending.loading ? `Finding “${pending.latin}”…` : "…";
      Object.assign(loading.style, { padding: "6px 10px", opacity: "0.6" } as CSSStyleDeclaration);
      frag.appendChild(loading);
    } else {
      pending.candidates.forEach((c, i) => {
        const isEnglish = c === pending.latin;
        const activeState = i === pending.active;
        const row = document.createElement("button");
        row.type = "button";
        row.tabIndex = -1;
        Object.assign(row.style, {
          display: "flex",
          alignItems: "center",
          gap: "10px",
          width: "100%",
          textAlign: "left",
          cursor: "pointer",
          border: "none",
          borderRadius: "7px",
          padding: "6px 10px",
          fontSize: "16px",
          background: activeState ? "var(--editor-accent, #2b4ca6)" : "transparent",
          color: activeState ? "#fff" : "inherit",
        } as CSSStyleDeclaration);

        const num = document.createElement("span");
        num.textContent = i < 9 ? String(i + 1) : "·";
        Object.assign(num.style, {
          minWidth: "1.1em",
          textAlign: "center",
          fontSize: "12px",
          opacity: activeState ? "0.85" : "0.45",
          fontFamily: "ui-monospace, Menlo, monospace",
        } as CSSStyleDeclaration);
        row.appendChild(num);

        const word = document.createElement("span");
        word.textContent = c;
        word.style.flex = "1";
        if (isEnglish) word.style.fontFamily = "ui-monospace, Menlo, monospace";
        row.appendChild(word);

        if (isEnglish) {
          const tag = document.createElement("span");
          tag.textContent = "EN";
          Object.assign(tag.style, {
            fontSize: "9px",
            fontWeight: "700",
            letterSpacing: "0.06em",
            padding: "1px 5px",
            borderRadius: "5px",
            border: "1px solid currentColor",
            opacity: "0.7",
          } as CSSStyleDeclaration);
          row.appendChild(tag);
        }

        row.addEventListener("mousedown", (e) => {
          e.preventDefault();
          this.onPick(i);
        });
        frag.appendChild(row);
      });

      const hint = document.createElement("div");
      hint.textContent = "Space/Enter · 1–9 pick · Esc keep English";
      Object.assign(hint.style, {
        padding: "4px 10px 2px",
        fontSize: "10px",
        opacity: "0.45",
        borderTop: "1px solid rgba(120,120,130,0.2)",
        marginTop: "2px",
      } as CSSStyleDeclaration);
      frag.appendChild(hint);
    }

    this.el.replaceChildren(frag);
  }

  destroy(): void {
    this.el.remove();
  }
}
