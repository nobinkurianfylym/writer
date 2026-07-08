import { describe, expect, it } from "vitest";
import { BLOCK_TYPES, type BlockType } from "./model.js";
import { transition, type TransitionKey } from "./transition.js";
import { usFeatureProfile } from "./profiles/us-feature.js";
import { usTvOneHourProfile } from "./profiles/us-tv-onehour.js";

const KEYS: TransitionKey[] = ["Tab", "Enter"];
const MAIN_CYCLE_TYPES: BlockType[] = ["action", "character", "transition", "shot"];
const DIALOGUE_TOGGLE_TYPES: BlockType[] = ["dialogue", "parenthetical"];
const OTHER_TYPES: BlockType[] = BLOCK_TYPES.filter(
  (t) => !MAIN_CYCLE_TYPES.includes(t) && !DIALOGUE_TOGGLE_TYPES.includes(t),
);

describe("transition: totality", () => {
  it("is defined for every (type, key, isEmpty) combination", () => {
    let count = 0;
    for (const type of BLOCK_TYPES) {
      for (const key of KEYS) {
        for (const isEmpty of [true, false]) {
          const result = transition(type, key, isEmpty);
          expect(BLOCK_TYPES).toContain(result.nextType);
          expect(["retype", "newBlock"]).toContain(result.caret);
          count++;
        }
      }
    }
    expect(count).toBe(BLOCK_TYPES.length * KEYS.length * 2);
  });
});

describe("transition: §4 spec examples", () => {
  it("character + Enter -> dialogue", () => {
    expect(transition("character", "Enter", false).nextType).toBe("dialogue");
  });

  it("dialogue + Tab -> parenthetical, regardless of emptiness", () => {
    expect(transition("dialogue", "Tab", false).nextType).toBe("parenthetical");
    expect(transition("dialogue", "Tab", true).nextType).toBe("parenthetical");
  });

  it("empty dialogue + Enter -> action", () => {
    expect(transition("dialogue", "Enter", true).nextType).toBe("action");
  });
});

describe("transition: Tab main cycle", () => {
  it("cycles action -> character -> transition -> shot -> action", () => {
    expect(transition("action", "Tab", true).nextType).toBe("character");
    expect(transition("character", "Tab", true).nextType).toBe("transition");
    expect(transition("transition", "Tab", true).nextType).toBe("shot");
    expect(transition("shot", "Tab", true).nextType).toBe("action");
  });

  it("Tab cycle target is independent of emptiness", () => {
    for (const type of MAIN_CYCLE_TYPES) {
      expect(transition(type, "Tab", true)).toEqual(transition(type, "Tab", false));
    }
  });

  it("toggles dialogue <-> parenthetical instead of advancing the main cycle", () => {
    expect(transition("dialogue", "Tab", false).nextType).toBe("parenthetical");
    expect(transition("parenthetical", "Tab", false).nextType).toBe("dialogue");
  });

  it("defaults every other type into the main cycle via character", () => {
    for (const type of OTHER_TYPES) {
      expect(transition(type, "Tab", true).nextType).toBe("character");
    }
  });
});

describe("transition: Enter demotion vs. advance", () => {
  it("parenthetical demotes only to dialogue, not all the way to action", () => {
    expect(transition("parenthetical", "Enter", true).nextType).toBe("dialogue");
  });

  it("every empty-Enter demotion lands on action, except parenthetical", () => {
    for (const type of BLOCK_TYPES) {
      const target = transition(type, "Enter", true).nextType;
      if (type === "parenthetical") {
        expect(target).toBe("dialogue");
      } else {
        expect(target).toBe("action");
      }
    }
  });

  it("Enter always creates a new block, never retypes in place", () => {
    for (const type of BLOCK_TYPES) {
      expect(transition(type, "Enter", true).caret).toBe("newBlock");
      expect(transition(type, "Enter", false).caret).toBe("newBlock");
    }
  });

  it("Tab always retypes in place, never creates a new block", () => {
    for (const type of BLOCK_TYPES) {
      expect(transition(type, "Tab", true).caret).toBe("retype");
      expect(transition(type, "Tab", false).caret).toBe("retype");
    }
  });
});

describe("transition: auto-caps entry consistency with format profiles (§4)", () => {
  const capsTypes: BlockType[] = ["scene_heading", "character", "transition"];

  it("every auto-caps landing type is caps:true in both shipped profiles", () => {
    for (const type of capsTypes) {
      expect(usFeatureProfile.elements[type].caps).toBe(true);
      expect(usTvOneHourProfile.elements[type].caps).toBe(true);
    }
  });
});
