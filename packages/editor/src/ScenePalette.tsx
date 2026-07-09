"use client";

import { useState, useRef, useEffect, useCallback, useId } from "react";
import type { SceneEntry } from "./find-navigate.js";

export interface ScenePaletteProps {
  scenes: SceneEntry[];
  onSelect: (blockIndex: number) => void;
  onClose: () => void;
}

export function ScenePalette({ scenes, onSelect, onClose }: ScenePaletteProps) {
  const [filter, setFilter] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const filtered = filter
    ? scenes.filter((s) => s.text.toLowerCase().includes(filter.toLowerCase()))
    : scenes;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filter]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const selected = list.children[selectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const entry = filtered[selectedIndex];
        if (entry) {
          onSelect(entry.blockIndex);
          onClose();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [filtered, selectedIndex, onSelect, onClose],
  );

  const activeDescendant = filtered[selectedIndex]
    ? `${listId}-item-${filtered[selectedIndex]!.blockIndex}`
    : undefined;

  return (
    <div
      className="scene-palette-overlay"
      data-testid="scene-palette-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="scene-palette" role="dialog" aria-label="Jump to scene" data-testid="scene-palette">
        <input
          ref={inputRef}
          data-testid="scene-palette-input"
          type="text"
          role="combobox"
          aria-label="Filter scenes"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={activeDescendant}
          aria-autocomplete="list"
          placeholder="Jump to scene..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <ul ref={listRef} id={listId} role="listbox" className="scene-palette-list" data-testid="scene-palette-list">
          {filtered.map((scene, i) => (
            <li
              key={scene.blockIndex}
              id={`${listId}-item-${scene.blockIndex}`}
              role="option"
              aria-selected={i === selectedIndex}
              data-testid="scene-palette-item"
              data-selected={i === selectedIndex ? "true" : undefined}
              onClick={() => {
                onSelect(scene.blockIndex);
                onClose();
              }}
            >
              {scene.sceneNumber && (
                <span className="scene-number">{scene.sceneNumber}</span>
              )}
              {scene.text}
            </li>
          ))}
          {filtered.length === 0 && (
            <li role="option" aria-disabled="true" className="scene-palette-empty">No scenes found</li>
          )}
        </ul>
      </div>
    </div>
  );
}
