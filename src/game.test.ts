import { describe, expect, it } from "vitest";
import {
  compareOperators,
  createGame,
  defaultSettings,
  defaultStats,
  normalizeSettings,
  submitGuess,
  validateSettings,
  type Operator,
} from "./game";

const makeOperator = (overrides: Partial<Operator> = {}): Operator => ({
  id: "char_answer",
  name: "答案",
  rarity: 6,
  profession: "辅助",
  subclass: "凝滞师",
  faction: "罗德岛",
  faction_hidden: [],
  race: "菲林",
  release_year: 2023,
  ...overrides,
});

const answer = makeOperator();
const operators = [
  answer,
  makeOperator({
    id: "char_guess",
    name: "猜测",
    rarity: 4,
    profession: "辅助",
    subclass: "吟游者",
    faction: "巴别塔",
    faction_hidden: ["罗德岛"],
    race: "萨卡兹",
    release_year: 2020,
  }),
];

it("compares five fields, including hidden faction overlap", () => {
  expect(compareOperators(operators[1], answer)).toEqual({
    rarity: "higher",
    subclass: "close",
    faction: "close",
    race: "wrong",
    release_year: "higher",
  });
});

describe("game session", () => {
  it("starts with a hidden answer and no guesses", () => {
    const session = createGame(operators, { random: () => 0, now: 123 });
    expect(session.answerId).toBe(answer.id);
    expect(session.guesses).toEqual([]);
    expect(session.status).toBe("playing");
  });

  it("wins on the correct operator", () => {
    const session = createGame(operators, { random: () => 0 });
    const result = submitGuess(session, answer, new Map(operators.map((item) => [item.id, item])), 456);
    expect(result.status).toBe("won");
    expect(result.finishedAt).toBe(456);
  });

  it("only draws answers from selected rarities", () => {
    const session = createGame(operators, {
      settings: { rarities: [4], maxAttempts: 8 },
      random: () => 0,
    });
    expect(session.answerId).toBe("char_guess");
    expect(session.maxAttempts).toBe(8);
  });

  it("supports one attempt and unlimited attempts", () => {
    const byId = new Map(operators.map((item) => [item.id, item]));
    const oneTry = createGame(operators, {
      settings: { rarities: [6], maxAttempts: 1 },
      random: () => 0,
    });
    expect(submitGuess(oneTry, operators[1], byId).status).toBe("lost");

    const unlimited = createGame(operators, {
      settings: { rarities: [6], maxAttempts: -1 },
      random: () => 0,
    });
    expect(unlimited.maxAttempts).toBe(-1);
    expect(submitGuess(unlimited, operators[1], byId).status).toBe("playing");
  });

  it("validates and normalizes settings", () => {
    expect(validateSettings(defaultSettings())).toBeNull();
    expect(validateSettings({ rarities: [], maxAttempts: 8 })).toContain("稀有度");
    expect(validateSettings({ rarities: [6], maxAttempts: 0 })).toContain("最大猜测");
    expect(validateSettings({ rarities: [6], maxAttempts: -2 })).toContain("最大猜测");
    expect(validateSettings({ rarities: [6], maxAttempts: -1 })).toBeNull();
    expect(normalizeSettings({ rarities: [6, 9, 6, 4], maxAttempts: 2 })).toEqual({
      rarities: [4, 6],
      maxAttempts: 2,
    });
  });

  it("rejects duplicate guesses without mutating the original session", () => {
    const session = createGame(operators, { random: () => 0 });
    const byId = new Map(operators.map((item) => [item.id, item]));
    const next = submitGuess(session, operators[1], byId);
    expect(() => submitGuess(next, operators[1], byId)).toThrow("已经猜过了");
    expect(session.guesses).toHaveLength(0);
  });

  it("creates empty local stats", () => {
    expect(defaultStats()).toEqual({ gamesPlayed: 0, gamesWon: 0, currentStreak: 0, bestStreak: 0 });
  });
});
