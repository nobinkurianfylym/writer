import { describe, expect, it } from "vitest";
import {
  isTransitionText,
  tokenizeCharacterName,
  tokenizeSceneHeading,
  type SceneType,
} from "./smart-type.js";

describe("tokenizeSceneHeading: curated edge cases", () => {
  it("parses a plain INT./time heading", () => {
    expect(tokenizeSceneHeading("INT. COFFEE SHOP - DAY")).toEqual({
      sceneType: "INT",
      location: "COFFEE SHOP",
      time: "DAY",
      raw: "INT. COFFEE SHOP - DAY",
    });
  });

  it("parses EXT. with an em-dash separator", () => {
    const result = tokenizeSceneHeading("EXT. MOUNTAIN RANGE — LATER");
    expect(result.sceneType).toBe("EXT");
    expect(result.location).toBe("MOUNTAIN RANGE");
    expect(result.time).toBe("LATER");
  });

  it("detects combined INT./EXT.", () => {
    expect(tokenizeSceneHeading("INT./EXT. CAR - DAY").sceneType).toBe("INT/EXT");
  });

  it("detects INT/EXT without periods", () => {
    expect(tokenizeSceneHeading("INT/EXT CAR - DAY").sceneType).toBe("INT/EXT");
  });

  it("detects the I/E. shorthand", () => {
    expect(tokenizeSceneHeading("I/E. CAR - NIGHT").sceneType).toBe("INT/EXT");
  });

  it("does not confuse a bare INT. for INT/EXT", () => {
    expect(tokenizeSceneHeading("INT. CAR - DAY").sceneType).toBe("INT");
  });

  it("handles a scene type with no trailing period", () => {
    const result = tokenizeSceneHeading("INT COFFEE SHOP - DAY");
    expect(result.sceneType).toBe("INT");
    expect(result.location).toBe("COFFEE SHOP");
  });

  it("does not split on a hyphen inside a single word", () => {
    const result = tokenizeSceneHeading("INT. TWENTY-FIRST FLOOR OFFICE - DAY");
    expect(result.location).toBe("TWENTY-FIRST FLOOR OFFICE");
    expect(result.time).toBe("DAY");
  });

  it("joins a nested location across multiple hyphen segments", () => {
    const result = tokenizeSceneHeading("INT. HOUSE - KITCHEN - DAY");
    expect(result.location).toBe("HOUSE - KITCHEN");
    expect(result.time).toBe("DAY");
  });

  it("joins a nested location mixing hyphen and em-dash separators", () => {
    const result = tokenizeSceneHeading("INT. HOUSE — KITCHEN - NIGHT");
    expect(result.location).toBe("HOUSE - KITCHEN");
    expect(result.time).toBe("NIGHT");
  });

  it("recognizes MOMENTS LATER as a time phrase", () => {
    expect(tokenizeSceneHeading("EXT. STREET - MOMENTS LATER").time).toBe("MOMENTS LATER");
  });

  it("recognizes bare LATER as a time phrase", () => {
    expect(tokenizeSceneHeading("EXT. STREET - LATER").time).toBe("LATER");
  });

  it("recognizes a hyphenated time (PRE-DAWN)", () => {
    const result = tokenizeSceneHeading("INT. HOUSE - PRE-DAWN");
    expect(result.location).toBe("HOUSE");
    expect(result.time).toBe("PRE-DAWN");
  });

  it("recognizes the two-word SAME TIME / MAGIC HOUR phrases", () => {
    expect(tokenizeSceneHeading("INT. HOUSE - SAME TIME").time).toBe("SAME TIME");
    expect(tokenizeSceneHeading("EXT. FIELD - MAGIC HOUR").time).toBe("MAGIC HOUR");
  });

  it("leaves location untouched when there's no time-of-day at all", () => {
    const result = tokenizeSceneHeading("INT. ABANDONED WAREHOUSE");
    expect(result.location).toBe("ABANDONED WAREHOUSE");
    expect(result.time).toBeNull();
  });

  it("does not misdetect an unrecognized trailing segment as time", () => {
    const result = tokenizeSceneHeading("INT. ROOM 237 - HAUNTED");
    expect(result.location).toBe("ROOM 237 - HAUNTED");
    expect(result.time).toBeNull();
  });

  it("is case-insensitive on the scene-type prefix", () => {
    expect(tokenizeSceneHeading("int. coffee shop - day").sceneType).toBe("INT");
  });

  it("returns a null sceneType for text with no recognizable prefix", () => {
    const result = tokenizeSceneHeading("SOMEWHERE, SOMETIME");
    expect(result.sceneType).toBeNull();
    expect(result.location).toBe("SOMEWHERE, SOMETIME");
  });
});

describe("tokenizeCharacterName", () => {
  it("strips (V.O.)", () => {
    expect(tokenizeCharacterName("MAYA (V.O.)")).toMatchObject({
      name: "MAYA",
      extensions: ["V.O."],
    });
  });

  it("strips (O.S.)", () => {
    expect(tokenizeCharacterName("JOHN (O.S.)").extensions).toEqual(["O.S."]);
  });

  it("strips (CONT'D)", () => {
    expect(tokenizeCharacterName("SARAH (CONT'D)").extensions).toEqual(["CONT'D"]);
  });

  it("normalizes spelled-out and unpunctuated variants", () => {
    expect(tokenizeCharacterName("MAYA (VOICEOVER)").extensions).toEqual(["V.O."]);
    expect(tokenizeCharacterName("MAYA (OS)").extensions).toEqual(["O.S."]);
    expect(tokenizeCharacterName("MAYA (CONTD)").extensions).toEqual(["CONT'D"]);
  });

  it("strips multiple stacked extensions in order", () => {
    expect(tokenizeCharacterName("MAYA (V.O.) (CONT'D)")).toMatchObject({
      name: "MAYA",
      extensions: ["V.O.", "CONT'D"],
    });
  });

  it("leaves an unrecognized trailing parenthetical alone", () => {
    expect(tokenizeCharacterName("MAYA (30s)")).toMatchObject({
      name: "MAYA (30s)",
      extensions: [],
    });
  });

  it("leaves a bare name untouched", () => {
    expect(tokenizeCharacterName("MAYA")).toMatchObject({ name: "MAYA", extensions: [] });
  });
});

describe("isTransitionText", () => {
  it("detects CUT TO:", () => {
    expect(isTransitionText("CUT TO:")).toBe(true);
    expect(isTransitionText("cut to:")).toBe(true);
  });

  it("detects other '* TO:' transitions", () => {
    expect(isTransitionText("DISSOLVE TO:")).toBe(true);
    expect(isTransitionText("SMASH CUT TO:")).toBe(true);
    expect(isTransitionText("MATCH CUT TO:")).toBe(true);
  });

  it("detects FADE IN: and FADE OUT.", () => {
    expect(isTransitionText("FADE IN:")).toBe(true);
    expect(isTransitionText("FADE OUT.")).toBe(true);
  });

  it("rejects ordinary action text", () => {
    expect(isTransitionText("Maya walks to the door.")).toBe(false);
    expect(isTransitionText("")).toBe(false);
  });

  it("rejects text that merely contains 'to' without the trigger shape", () => {
    expect(isTransitionText("She turns to face him.")).toBe(false);
  });
});

// --- 200+ line real-world-shaped fixture (E1-4 accept criterion) ---------

const SCENE_TYPE_PREFIXES = ["INT.", "EXT.", "INT./EXT.", "I/E.", "INT", "EXT"] as const;

const LOCATIONS = [
  "COFFEE SHOP",
  "HOUSE - KITCHEN",
  "CAR",
  "ABANDONED WAREHOUSE",
  "CITY STREET",
  "OFFICE BUILDING - 5TH FLOOR",
  "SPACESHIP BRIDGE",
  "MOUNTAIN RANGE",
  "TWENTY-FIRST FLOOR OFFICE",
  "HOSPITAL - ICU",
];

const TIMES: (string | null)[] = [
  "DAY",
  "NIGHT",
  "MORNING",
  "EVENING",
  "AFTERNOON",
  "DAWN",
  "DUSK",
  "CONTINUOUS",
  "LATER",
  "MOMENTS LATER",
  "SAME TIME",
  "MAGIC HOUR",
  "PRE-DAWN",
  "NOON",
  "MIDNIGHT",
  "SUNRISE",
  "SUNSET",
  null,
];

interface FixtureCase {
  raw: string;
  expectedSceneType: SceneType;
  expectedTime: string | null;
}

function buildGeneratedFixture(): FixtureCase[] {
  const cases: FixtureCase[] = [];
  // Full cross product (6 prefixes x 10 locations x 18 times = 1080 lines):
  // every scene-type variant paired with every location against every
  // recognized time-of-day phrase (plus "no time at all").
  for (const prefix of SCENE_TYPE_PREFIXES) {
    for (const location of LOCATIONS) {
      for (const time of TIMES) {
        const raw = time ? `${prefix} ${location} - ${time}` : `${prefix} ${location}`;
        const expectedSceneType: SceneType =
          prefix === "INT./EXT." || prefix === "I/E."
            ? "INT/EXT"
            : prefix.startsWith("INT")
              ? "INT"
              : "EXT";
        cases.push({ raw, expectedSceneType, expectedTime: time });
      }
    }
  }
  return cases;
}

const CURATED_FIXTURE: FixtureCase[] = [
  { raw: "EXT. MOUNTAIN RANGE — LATER", expectedSceneType: "EXT", expectedTime: "LATER" },
  { raw: "INT. HOUSE — KITCHEN - DAY", expectedSceneType: "INT", expectedTime: "DAY" },
  { raw: "INT. HOUSE - PRE-DAWN", expectedSceneType: "INT", expectedTime: "PRE-DAWN" },
  { raw: "I/E. CAR - NIGHT", expectedSceneType: "INT/EXT", expectedTime: "NIGHT" },
  { raw: "INT./EXT. SUBMARINE - CONTINUOUS", expectedSceneType: "INT/EXT", expectedTime: "CONTINUOUS" },
];

const FIXTURE: FixtureCase[] = [...buildGeneratedFixture(), ...CURATED_FIXTURE];

describe("tokenizeSceneHeading: 200-line real-world fixture", () => {
  it("has at least 200 lines", () => {
    expect(FIXTURE.length).toBeGreaterThanOrEqual(200);
  });

  it("never throws and correctly extracts sceneType/time for every fixture line", () => {
    for (const { raw, expectedSceneType, expectedTime } of FIXTURE) {
      let result;
      expect(() => {
        result = tokenizeSceneHeading(raw);
      }).not.toThrow();
      expect(result!.sceneType).toBe(expectedSceneType);
      expect(result!.time).toBe(expectedTime);
      expect(result!.location.length).toBeGreaterThan(0);
    }
  });
});
