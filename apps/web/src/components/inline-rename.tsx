"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@fylym/ui";

/**
 * An accessible inline-rename control: renders the current title, and when
 * editing swaps to a text field. Enter commits, Escape cancels. Used for both
 * projects and scripts so rename behaves identically everywhere.
 */
export function InlineRename({
  value,
  editing,
  onStart,
  onCommit,
  onCancel,
  label,
}: {
  value: string;
  editing: boolean;
  onStart: () => void;
  onCommit: (next: string) => void;
  onCancel: () => void;
  label: string;
}) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(value);
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing, value]);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={onStart}
        className="rounded text-left font-medium hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Rename ${label}`}
      >
        {value}
      </button>
    );
  }

  function commit() {
    const next = draft.trim();
    if (next && next !== value) onCommit(next);
    else onCancel();
  }

  return (
    <Input
      ref={inputRef}
      value={draft}
      aria-label={`New name for ${label}`}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      onBlur={commit}
      className="h-8 max-w-xs"
    />
  );
}
