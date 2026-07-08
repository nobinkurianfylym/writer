import { describe, expect, it } from "vitest";
import { BLOCK_TYPES } from "./model.js";
import { parseFormatProfile } from "./format-profile.js";
import { usFeatureProfile } from "./profiles/us-feature.js";
import { usTvOneHourProfile } from "./profiles/us-tv-onehour.js";

describe("us-feature / us-tv-onehour profiles (snapshot)", () => {
  it("matches the pinned us-feature profile", () => {
    expect(usFeatureProfile).toMatchSnapshot();
  });

  it("matches the pinned us-tv-onehour profile", () => {
    expect(usTvOneHourProfile).toMatchSnapshot();
  });

  it("defines every one of the 15 block types", () => {
    expect(Object.keys(usFeatureProfile.elements).sort()).toEqual([...BLOCK_TYPES].sort());
    expect(Object.keys(usTvOneHourProfile.elements).sort()).toEqual([...BLOCK_TYPES].sort());
  });
});

describe("us-feature: published Hollywood-standard measurements", () => {
  it("uses a 1.5in left / 1in right margin on 8.5x11 paper", () => {
    expect(usFeatureProfile.page).toEqual({
      width: 8.5,
      height: 11,
      margins: { top: 1, bottom: 1, left: 1.5, right: 1 },
    });
  });

  it("pins scene_heading: 1.5in indent, 6in width, caps", () => {
    expect(usFeatureProfile.elements.scene_heading).toMatchObject({
      indent: 1.5,
      width: 6.0,
      caps: true,
    });
  });

  it("pins character: 3.7in indent, caps", () => {
    expect(usFeatureProfile.elements.character).toMatchObject({ indent: 3.7, caps: true });
  });

  it("pins dialogue: 2.5in indent, 3.5in width, not caps", () => {
    expect(usFeatureProfile.elements.dialogue).toMatchObject({
      indent: 2.5,
      width: 3.5,
      caps: false,
    });
  });

  it("pins parenthetical: 3.1in indent, 2.0in width", () => {
    expect(usFeatureProfile.elements.parenthetical).toMatchObject({ indent: 3.1, width: 2.0 });
  });

  it("pins transition: right-aligned, caps", () => {
    expect(usFeatureProfile.elements.transition).toMatchObject({ align: "right", caps: true });
  });

  it("pins 55 lines per page, (MORE)/(CONT'D) markers", () => {
    expect(usFeatureProfile.pagination).toMatchObject({
      linesPerPage: 55,
      moreText: "(MORE)",
      continuedText: "(CONT'D)",
    });
  });

  it("does not honor act breaks (features have no acts)", () => {
    expect(usFeatureProfile.pagination.honorsActBreaks).toBe(false);
  });
});

describe("us-tv-onehour: shares Hollywood-standard element geometry", () => {
  it("matches us-feature's element indents/widths/caps exactly", () => {
    expect(usTvOneHourProfile.elements).toEqual(usFeatureProfile.elements);
  });

  it("honors act breaks (features do not)", () => {
    expect(usTvOneHourProfile.pagination.honorsActBreaks).toBe(true);
  });
});

describe("parseFormatProfile: invalid profiles fail with the offending path", () => {
  it("rejects a profile with a non-numeric element indent, naming the path", () => {
    const broken = JSON.parse(JSON.stringify(usFeatureProfile)) as Record<string, unknown>;
    (broken.elements as Record<string, unknown>).character = {
      ...usFeatureProfile.elements.character,
      indent: "not-a-number",
    };
    expect(() => parseFormatProfile(broken)).toThrow(/elements\.character\.indent/);
  });

  it("rejects a profile missing a required block type, naming the path", () => {
    const broken = JSON.parse(JSON.stringify(usFeatureProfile)) as Record<string, unknown>;
    const elements = broken.elements as Record<string, unknown>;
    delete elements.dual_dialogue;
    expect(() => parseFormatProfile(broken)).toThrow(/elements\.dual_dialogue/);
  });

  it("rejects a completely malformed profile", () => {
    expect(() => parseFormatProfile({ nonsense: true })).toThrow(/Invalid format profile/);
  });

  it("rejects non-object input without throwing an unrelated error", () => {
    expect(() => parseFormatProfile(null)).toThrow(/Invalid format profile/);
    expect(() => parseFormatProfile("a string")).toThrow(/Invalid format profile/);
  });
});
