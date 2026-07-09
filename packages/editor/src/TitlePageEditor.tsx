"use client";

import { useCallback, useMemo, useState } from "react";
import {
  parseTitlePageFields,
  serializeTitlePageFields,
  emptyTitlePageFields,
  type TitlePageFields,
  type Block,
} from "@fylym/screenplay-core";

export interface TitlePageEditorProps {
  block: Block | null;
  onChange?: (updatedBlock: Block) => void;
}

interface FieldDef {
  key: keyof TitlePageFields;
  label: string;
  placeholder: string;
  multiline?: boolean;
}

const FIELD_DEFS: readonly FieldDef[] = [
  { key: "title", label: "Title", placeholder: "Untitled Screenplay" },
  { key: "credit", label: "Credit", placeholder: "written by" },
  { key: "author", label: "Author", placeholder: "Author name" },
  { key: "source", label: "Source", placeholder: "Based on..." },
  { key: "draftDate", label: "Draft Date", placeholder: "July 2026" },
  { key: "contact", label: "Contact", placeholder: "Contact information", multiline: true },
  { key: "copyright", label: "Copyright", placeholder: "Copyright notice" },
  { key: "notes", label: "Notes", placeholder: "Additional notes", multiline: true },
  { key: "revision", label: "Revision", placeholder: "First Draft" },
];

function previewLines(fields: TitlePageFields): string[] {
  const lines: string[] = [];
  if (fields.title) lines.push(fields.title);
  if (fields.credit) lines.push("", fields.credit);
  if (fields.author) lines.push("", fields.author);
  if (fields.source) lines.push("", fields.source);
  if (fields.draftDate) lines.push("", fields.draftDate);
  if (fields.contact) {
    lines.push("");
    for (const l of fields.contact.split("\n")) lines.push(l);
  }
  if (fields.copyright) lines.push("", fields.copyright);
  if (fields.revision) lines.push("", fields.revision);
  if (fields.notes) {
    lines.push("");
    for (const l of fields.notes.split("\n")) lines.push(l);
  }
  return lines;
}

export function TitlePageEditor({ block, onChange }: TitlePageEditorProps) {
  const initial = useMemo(
    () => (block ? parseTitlePageFields(block.text) : emptyTitlePageFields()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [fields, setFields] = useState<TitlePageFields>(initial);
  const [collapsed, setCollapsed] = useState(false);

  const handleChange = useCallback(
    (key: keyof TitlePageFields, value: string) => {
      setFields((prev) => {
        const next = { ...prev, [key]: value };
        if (onChange && block) {
          const text = serializeTitlePageFields(next);
          onChange({ ...block, text });
        }
        return next;
      });
    },
    [onChange, block],
  );

  const lines = previewLines(fields);
  const hasContent = lines.some((l) => l.trim().length > 0);

  return (
    <div className="title-page-editor" data-testid="title-page-editor">
      <button
        type="button"
        className="title-page-toggle"
        data-testid="title-page-toggle"
        onClick={() => setCollapsed((c) => !c)}
      >
        {collapsed ? "▶ Title Page" : "▼ Title Page"}
      </button>

      {!collapsed && (
        <div className="title-page-body">
          <div className="title-page-form" data-testid="title-page-form">
            {FIELD_DEFS.map((def) => (
              <label key={def.key} className="title-page-field">
                <span className="title-page-field-label">{def.label}</span>
                {def.multiline ? (
                  <textarea
                    data-testid={`title-field-${def.key}`}
                    value={fields[def.key]}
                    placeholder={def.placeholder}
                    rows={3}
                    onChange={(e) => handleChange(def.key, e.target.value)}
                  />
                ) : (
                  <input
                    type="text"
                    data-testid={`title-field-${def.key}`}
                    value={fields[def.key]}
                    placeholder={def.placeholder}
                    onChange={(e) => handleChange(def.key, e.target.value)}
                  />
                )}
              </label>
            ))}
          </div>

          <div className="title-page-preview" data-testid="title-page-preview">
            <div className="title-page-preview-label">Preview</div>
            <div className="title-page-preview-page">
              {hasContent ? (
                <div className="title-page-preview-content">
                  {lines.map((line, i) => (
                    <div key={i} className="title-page-preview-line">
                      {line || " "}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="title-page-preview-empty">
                  Fill in the fields to see a preview
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .title-page-editor {
          border: 1px solid #e0e0e0;
          border-radius: 6px;
          margin-bottom: 16px;
          background: #fafafa;
        }
        .title-page-toggle {
          display: block;
          width: 100%;
          padding: 10px 14px;
          text-align: left;
          background: none;
          border: none;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          color: #333;
        }
        .title-page-toggle:hover {
          background: #f0f0f0;
        }
        .title-page-body {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          padding: 0 14px 14px;
        }
        .title-page-form {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .title-page-field {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .title-page-field-label {
          font-size: 12px;
          font-weight: 500;
          color: #666;
        }
        .title-page-field input,
        .title-page-field textarea {
          padding: 6px 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 13px;
          font-family: inherit;
          background: #fff;
        }
        .title-page-field input:focus,
        .title-page-field textarea:focus {
          outline: none;
          border-color: #4a90d9;
          box-shadow: 0 0 0 2px rgba(74, 144, 217, 0.2);
        }
        .title-page-preview {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .title-page-preview-label {
          font-size: 12px;
          font-weight: 500;
          color: #666;
        }
        .title-page-preview-page {
          background: #fff;
          border: 1px solid #ddd;
          border-radius: 4px;
          aspect-ratio: 8.5 / 11;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          overflow: hidden;
          position: relative;
        }
        .title-page-preview-content {
          position: absolute;
          top: 40%;
          left: 50%;
          transform: translateX(-50%);
          text-align: center;
          font-family: "Courier New", Courier, monospace;
          font-size: 8px;
          line-height: 2;
          white-space: pre;
          color: #333;
        }
        .title-page-preview-empty {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 12px;
          color: #999;
          text-align: center;
        }
        .title-page-preview-line {
          min-height: 1em;
        }
        @media (prefers-color-scheme: dark) {
          .title-page-editor {
            border-color: #444;
            background: #1a1a1a;
          }
          .title-page-toggle {
            color: #ddd;
          }
          .title-page-toggle:hover {
            background: #2a2a2a;
          }
          .title-page-field-label,
          .title-page-preview-label {
            color: #aaa;
          }
          .title-page-field input,
          .title-page-field textarea {
            background: #2a2a2a;
            border-color: #555;
            color: #ddd;
          }
          .title-page-preview-page {
            background: #fff;
            border-color: #555;
          }
          .title-page-preview-content {
            color: #333;
          }
        }
      `}</style>
    </div>
  );
}
