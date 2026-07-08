import { describe, expect, it } from "vitest";
import type { Block } from "@fylym/screenplay-core";
import {
  characterNameSuggestions,
  exchangeOpeningCharacter,
  extensionSuggestions,
  sceneLocationSuggestions,
  twoCharacterAlternatingPair,
} from "./suggestions.js";

function block(type: Block["type"], text: string): Block {
  return { id: crypto.randomUUID(), type, text, marks: [], attrs: {} };
}

describe("characterNameSuggestions", () => {
  it("rotates the most-recent speaker to the end, leading with the next-most-recent", () => {
    const blocks = [block("character", "MAYA"), block("dialogue", "Hi."), block("character", "SAM"), block("dialogue", "Hey.")];
    expect(characterNameSuggestions(blocks, blocks.length)).toEqual(["MAYA", "SAM"]);
  });

  it("returns names in recency order (post-rotation) for 3+ characters", () => {
    const blocks = [
      block("character", "MAYA"),
      block("dialogue", "a"),
      block("character", "SAM"),
      block("dialogue", "b"),
      block("character", "LEE"),
      block("dialogue", "c"),
    ];
    // Raw recency (most-recent first) would be LEE, SAM, MAYA; rotating
    // the top (LEE) to the end gives SAM, MAYA, LEE.
    expect(characterNameSuggestions(blocks, blocks.length)).toEqual(["SAM", "MAYA", "LEE"]);
  });

  it("deduplicates repeated speakers, keeping only the most recent occurrence's rank", () => {
    const blocks = [
      block("character", "MAYA"),
      block("dialogue", "a"),
      block("character", "SAM"),
      block("dialogue", "b"),
      block("character", "MAYA"),
      block("dialogue", "c"),
    ];
    expect(characterNameSuggestions(blocks, blocks.length)).toEqual(["SAM", "MAYA"]);
  });

  it("filters by prefix, case-insensitively", () => {
    const blocks = [block("character", "MAYA"), block("dialogue", "a"), block("character", "SAM"), block("dialogue", "b")];
    expect(characterNameSuggestions(blocks, blocks.length, "ma")).toEqual(["MAYA"]);
  });

  it("only considers blocks before beforeIndex", () => {
    const blocks = [block("character", "MAYA"), block("dialogue", "a"), block("character", "SAM"), block("dialogue", "b")];
    expect(characterNameSuggestions(blocks, 2)).toEqual(["MAYA"]);
  });

  it("returns an empty list with no prior characters", () => {
    expect(characterNameSuggestions([block("action", "x")], 1)).toEqual([]);
  });
});

describe("twoCharacterAlternatingPair", () => {
  it("returns [other, last] when exactly two distinct characters have spoken", () => {
    const blocks = [block("character", "MAYA"), block("dialogue", "a"), block("character", "SAM"), block("dialogue", "b")];
    expect(twoCharacterAlternatingPair(blocks, blocks.length)).toEqual(["MAYA", "SAM"]);
  });

  it("returns null with only one distinct character", () => {
    const blocks = [block("character", "MAYA"), block("dialogue", "a"), block("character", "MAYA"), block("dialogue", "b")];
    expect(twoCharacterAlternatingPair(blocks, blocks.length)).toBeNull();
  });

  it("returns null with three or more distinct characters", () => {
    const blocks = [
      block("character", "MAYA"),
      block("dialogue", "a"),
      block("character", "SAM"),
      block("dialogue", "b"),
      block("character", "LEE"),
      block("dialogue", "c"),
    ];
    expect(twoCharacterAlternatingPair(blocks, blocks.length)).toBeNull();
  });

  it("returns null with zero characters", () => {
    expect(twoCharacterAlternatingPair([block("action", "x")], 1)).toBeNull();
  });
});

describe("sceneLocationSuggestions", () => {
  it("extracts the location portion, most recent first, deduplicated", () => {
    const blocks = [block("scene_heading", "INT. HOUSE - DAY"), block("scene_heading", "EXT. STREET - NIGHT"), block("scene_heading", "INT. HOUSE - NIGHT")];
    expect(sceneLocationSuggestions(blocks, blocks.length)).toEqual(["HOUSE", "STREET"]);
  });

  it("filters by prefix", () => {
    const blocks = [block("scene_heading", "INT. HOUSE - DAY"), block("scene_heading", "EXT. STREET - NIGHT")];
    expect(sceneLocationSuggestions(blocks, blocks.length, "ho")).toEqual(["HOUSE"]);
  });
});

describe("extensionSuggestions", () => {
  it("lists all extensions with no prefix", () => {
    expect(extensionSuggestions()).toEqual(["V.O.", "O.S.", "O.C.", "CONT'D"]);
  });

  it("filters by prefix", () => {
    expect(extensionSuggestions("v")).toEqual(["V.O."]);
    expect(extensionSuggestions("o")).toEqual(["O.S.", "O.C."]);
  });
});

describe("exchangeOpeningCharacter", () => {
  it("finds the character cue across intervening dialogue/parenthetical blocks", () => {
    const blocks = [
      block("character", "MAYA"),
      block("parenthetical", "beat"),
      block("dialogue", "Hello."),
      block("dialogue", ""), // the block Enter was just pressed on
    ];
    expect(exchangeOpeningCharacter(blocks, 3)).toBe("MAYA");
  });

  it("returns null when the preceding block isn't part of a character-opened exchange", () => {
    const blocks = [block("action", "Something happens."), block("dialogue", "")];
    expect(exchangeOpeningCharacter(blocks, 1)).toBeNull();
  });

  it("returns null at the start of the document", () => {
    expect(exchangeOpeningCharacter([block("dialogue", "")], 0)).toBeNull();
  });
});
