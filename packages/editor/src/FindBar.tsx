"use client";

import { useRef, useEffect } from "react";
import type { BlockType } from "@fylym/screenplay-core";

export interface FindBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  elementFilter: BlockType | null;
  onElementFilterChange: (f: BlockType | null) => void;
  matchCount: number;
  currentMatch: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

const FILTER_OPTIONS: { value: BlockType | ""; label: string }[] = [
  { value: "", label: "All Elements" },
  { value: "scene_heading", label: "Scene Headings" },
  { value: "action", label: "Action" },
  { value: "character", label: "Character" },
  { value: "dialogue", label: "Dialogue" },
  { value: "parenthetical", label: "Parenthetical" },
  { value: "transition", label: "Transition" },
];

export function FindBar({
  query,
  onQueryChange,
  elementFilter,
  onElementFilterChange,
  matchCount,
  currentMatch,
  onPrev,
  onNext,
  onClose,
}: FindBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="find-bar" data-testid="find-bar">
      <input
        ref={inputRef}
        data-testid="find-input"
        type="text"
        placeholder="Find..."
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.shiftKey ? onPrev() : onNext();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
      />
      <select
        data-testid="find-element-filter"
        value={elementFilter ?? ""}
        onChange={(e) =>
          onElementFilterChange(e.target.value ? (e.target.value as BlockType) : null)
        }
      >
        {FILTER_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <button data-testid="find-prev" onClick={onPrev}>
        ▲
      </button>
      <button data-testid="find-next" onClick={onNext}>
        ▼
      </button>
      <span className="find-count" data-testid="find-count">
        {matchCount > 0 ? `${currentMatch + 1}/${matchCount}` : "No results"}
      </span>
      <button className="find-close" data-testid="find-close" onClick={onClose}>
        ✕
      </button>
    </div>
  );
}
