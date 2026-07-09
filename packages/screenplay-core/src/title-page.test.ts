import { describe, expect, it } from "vitest";
import { parseTitlePageFields, serializeTitlePageFields, emptyTitlePageFields } from "./title-page.js";
import { parseFountain } from "./fountain/parse.js";
import { serializeFountain } from "./fountain/serialize.js";
import { parseFdx } from "./fdx/parse.js";
import { serializeFdx } from "./fdx/serialize.js";

describe("parseTitlePageFields", () => {
  it("parses standard Fountain title page keys", () => {
    const text = "Title: Coffee Break\nCredit: written by\nAuthor: A. Writer\nDraft date: 1/1/2026";
    const fields = parseTitlePageFields(text);
    expect(fields.title).toBe("Coffee Break");
    expect(fields.credit).toBe("written by");
    expect(fields.author).toBe("A. Writer");
    expect(fields.draftDate).toBe("1/1/2026");
  });

  it("handles indented continuation lines", () => {
    const text = "Contact: John Doe\n   123 Main Street\n   City, State 12345";
    const fields = parseTitlePageFields(text);
    expect(fields.contact).toBe("John Doe\n123 Main Street\nCity, State 12345");
  });

  it("returns empty fields for empty text", () => {
    const fields = parseTitlePageFields("");
    expect(fields).toEqual(emptyTitlePageFields());
  });

  it("handles alternate key names (authors -> author, date -> draftDate)", () => {
    const text = "Authors: Smith & Jones\nDate: 2026-07-01";
    const fields = parseTitlePageFields(text);
    expect(fields.author).toBe("Smith & Jones");
    expect(fields.draftDate).toBe("2026-07-01");
  });

  it("ignores unrecognized keys", () => {
    const text = "Title: My Script\nFoobar: Something\nAuthor: Me";
    const fields = parseTitlePageFields(text);
    expect(fields.title).toBe("My Script");
    expect(fields.author).toBe("Me");
  });
});

describe("serializeTitlePageFields", () => {
  it("serializes fields in canonical order", () => {
    const fields = { ...emptyTitlePageFields(), title: "Test", author: "Writer", credit: "by" };
    const text = serializeTitlePageFields(fields);
    const lines = text.split("\n");
    expect(lines[0]).toBe("Title: Test");
    expect(lines[1]).toBe("Credit: by");
    expect(lines[2]).toBe("Author: Writer");
  });

  it("skips empty fields", () => {
    const fields = { ...emptyTitlePageFields(), title: "Only Title" };
    const text = serializeTitlePageFields(fields);
    expect(text).toBe("Title: Only Title");
  });

  it("handles multiline values with indented continuations", () => {
    const fields = { ...emptyTitlePageFields(), contact: "John Doe\n123 Main St\nCity" };
    const text = serializeTitlePageFields(fields);
    expect(text).toBe("Contact: John Doe\n   123 Main St\n   City");
  });
});

describe("round-trip: parse -> serialize -> parse", () => {
  it("round-trips through serializeTitlePageFields -> parseTitlePageFields", () => {
    const original = {
      ...emptyTitlePageFields(),
      title: "My Screenplay",
      credit: "written by",
      author: "Jane Doe",
      draftDate: "July 2026",
      contact: "Jane Doe\n555-1234\njane@example.com",
    };
    const text = serializeTitlePageFields(original);
    const parsed = parseTitlePageFields(text);
    expect(parsed).toEqual(original);
  });
});

describe("Fountain round-trip", () => {
  it("preserves title page fields through Fountain parse -> serialize -> parse", () => {
    const fountain = "Title: Coffee Break\nCredit: written by\nAuthor: A. Writer\nDraft date: 1/1/2026\n\nINT. OFFICE - DAY\n\nAction here.";
    const doc1 = parseFountain(fountain);
    const titleBlock1 = doc1.blocks.find((b) => b.type === "title_page");
    expect(titleBlock1).toBeDefined();

    const fields1 = parseTitlePageFields(titleBlock1!.text);
    expect(fields1.title).toBe("Coffee Break");
    expect(fields1.credit).toBe("written by");
    expect(fields1.author).toBe("A. Writer");
    expect(fields1.draftDate).toBe("1/1/2026");

    const serialized = serializeFountain(doc1);
    const doc2 = parseFountain(serialized);
    const titleBlock2 = doc2.blocks.find((b) => b.type === "title_page");
    expect(titleBlock2).toBeDefined();

    const fields2 = parseTitlePageFields(titleBlock2!.text);
    expect(fields2.title).toBe(fields1.title);
    expect(fields2.credit).toBe(fields1.credit);
    expect(fields2.author).toBe(fields1.author);
    expect(fields2.draftDate).toBe(fields1.draftDate);
  });
});

describe("FDX round-trip", () => {
  it("preserves title page text through FDX parse -> serialize -> parse", () => {
    const fdx = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft DocumentType="Script" Template="No" Version="1">
  <TitlePage>
    <Content>
      <Paragraph Type="Text" Alignment="Center"><Text>Coffee Break</Text></Paragraph>
      <Paragraph Type="Text" Alignment="Center"><Text>written by</Text></Paragraph>
      <Paragraph Type="Text" Alignment="Center"><Text>A. Writer</Text></Paragraph>
    </Content>
  </TitlePage>
  <Content>
    <Paragraph Type="Action"><Text>Action here.</Text></Paragraph>
  </Content>
</FinalDraft>`;

    const doc1 = parseFdx(fdx);
    const titleBlock1 = doc1.blocks.find((b) => b.type === "title_page");
    expect(titleBlock1).toBeDefined();
    expect(titleBlock1!.text).toContain("Coffee Break");

    const serialized = serializeFdx(doc1);
    const doc2 = parseFdx(serialized);
    const titleBlock2 = doc2.blocks.find((b) => b.type === "title_page");
    expect(titleBlock2).toBeDefined();
    expect(titleBlock2!.text).toBe(titleBlock1!.text);
  });
});
