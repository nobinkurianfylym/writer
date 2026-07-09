/**
 * Structured representation of title-page fields and helpers to convert
 * between this structure and the raw `Key: Value\n...` text stored in a
 * `title_page` Block's `.text` property.
 *
 * The canonical key names match Fountain's title-page spec (§8) — see
 * fountain/parse.ts's `TITLE_PAGE_KEYS` for the full set. Only the most
 * commonly used fields are surfaced as typed properties; everything else
 * round-trips through `other`.
 */

export interface TitlePageFields {
  title: string;
  credit: string;
  author: string;
  source: string;
  draftDate: string;
  contact: string;
  copyright: string;
  notes: string;
  revision: string;
}

const EMPTY_FIELDS: TitlePageFields = {
  title: "",
  credit: "",
  author: "",
  source: "",
  draftDate: "",
  contact: "",
  copyright: "",
  notes: "",
  revision: "",
};

const KEY_TO_FIELD: Record<string, keyof TitlePageFields> = {
  title: "title",
  credit: "credit",
  author: "author",
  authors: "author",
  source: "source",
  "draft date": "draftDate",
  date: "draftDate",
  contact: "contact",
  copyright: "copyright",
  notes: "notes",
  revision: "revision",
  draft: "revision",
};

const FIELD_TO_KEY: Record<keyof TitlePageFields, string> = {
  title: "Title",
  credit: "Credit",
  author: "Author",
  source: "Source",
  draftDate: "Draft date",
  contact: "Contact",
  copyright: "Copyright",
  notes: "Notes",
  revision: "Revision",
};

const FIELD_ORDER: readonly (keyof TitlePageFields)[] = [
  "title",
  "credit",
  "author",
  "source",
  "draftDate",
  "contact",
  "copyright",
  "notes",
  "revision",
];

const KEY_LINE_RE = /^([A-Za-z][\w .'-]*):\s*(.*)/;

export function parseTitlePageFields(text: string): TitlePageFields {
  const fields: TitlePageFields = { ...EMPTY_FIELDS };
  if (!text) return fields;

  const lines = text.split("\n");
  let currentField: keyof TitlePageFields | null = null;

  for (const line of lines) {
    const keyMatch = KEY_LINE_RE.exec(line);
    if (keyMatch) {
      const key = (keyMatch[1] ?? "").trim().toLowerCase();
      const value = (keyMatch[2] ?? "").trim();
      const field = KEY_TO_FIELD[key];
      if (field) {
        fields[field] = fields[field] ? `${fields[field]}\n${value}` : value;
        currentField = field;
      } else {
        currentField = null;
      }
    } else if (currentField && /^[ \t]/.test(line)) {
      const continuation = line.trim();
      if (continuation) {
        fields[currentField] = fields[currentField]
          ? `${fields[currentField]}\n${continuation}`
          : continuation;
      }
    } else {
      currentField = null;
    }
  }

  return fields;
}

export function serializeTitlePageFields(fields: TitlePageFields): string {
  const lines: string[] = [];

  for (const field of FIELD_ORDER) {
    const value = fields[field];
    if (!value) continue;
    const key = FIELD_TO_KEY[field];
    const valueLines = value.split("\n");
    lines.push(`${key}: ${valueLines[0]}`);
    for (let i = 1; i < valueLines.length; i++) {
      lines.push(`   ${valueLines[i]}`);
    }
  }

  return lines.join("\n");
}

export function emptyTitlePageFields(): TitlePageFields {
  return { ...EMPTY_FIELDS };
}
