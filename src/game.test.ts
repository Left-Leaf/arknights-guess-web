import { describe, expect, it } from "vitest";
import {
  compareEnemies,
  compareOperators,
  createEnemyGame,
  createGame,
  defaultSettings,
  defaultStats,
  normalizeSettings,
  searchEnemies,
  submitEnemyGuess,
  submitGuess,
  validateSettings,
  type Enemy,
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

  it("does not win when only the dimensions match", () => {
    const answerOp = makeOperator({ id: "char_a", debut: "火蓝之心" });
    const twin = makeOperator({ id: "char_b", name: "孪生", debut: "火蓝之心" });
    const session = createGame([answerOp], { random: () => 0 });
    const byId = new Map([answerOp, twin].map((item) => [item.id, item]));
    expect(submitGuess(session, twin, byId).status).toBe("playing");
  });

  it("marks release year as close when only the year matches", () => {
    const guess = makeOperator({ id: "g", release_year: 2020, debut: "火蓝之心2020" });
    const answerOp = makeOperator({ id: "a", release_year: 2020, debut: "火蓝之心" });
    expect(compareOperators(guess, answerOp).release_year).toBe("close");
  });

  it("marks release year as correct when the debut activity matches", () => {
    expect(compareOperators(makeOperator({ debut: "将进酒" }), makeOperator({ debut: "将进酒" })).release_year).toBe(
      "correct",
    );
  });

  it("creates empty local stats", () => {
    expect(defaultStats()).toEqual({ gamesPlayed: 0, gamesWon: 0, currentStreak: 0, bestStreak: 0 });
  });
});

const makeEnemy = (overrides: Partial<Enemy> = {}): Enemy => ({
  id: "enemy_answer",
  name: "霜星",
  level: "领袖",
  endure: "S",
  attack: "A",
  defence: "D",
  resistance: "S",
  debut: "主线第五章",
  debut_order: 6,
  sort_id: 80,
  enemy_race: "感染生物",
  attack_type: "近战",
  damage_type: "法术",
  motion: "地面",
  ...overrides,
});

const enemyAnswer = makeEnemy();
const enemyGuess = makeEnemy({
  id: "enemy_guess",
  name: "源石虫",
  level: "普通",
  endure: "E",
  attack: "E",
  defence: "E",
  resistance: "E",
  debut: "初始",
  debut_order: 0,
  sort_id: 1,
});

it("compares six enemy fields", () => {
  expect(compareEnemies(enemyGuess, enemyAnswer)).toEqual({
    level: "higher",
    endure: "higher",
    attack: "higher",
    defence: "higher",
    resistance: "higher",
    debut: "higher",
  });
});

it("treats same debut activity as correct even with different sort ids", () => {
  const first = makeEnemy({ id: "e1", debut: "将进酒", debut_order: 30, sort_id: 383 });
  const second = makeEnemy({ id: "e2", debut: "将进酒", debut_order: 30, sort_id: 416 });
  expect(compareEnemies(first, second).debut).toBe("correct");
});

describe("enemy game session", () => {
  const enemies = [enemyAnswer, enemyGuess];
  const byId = new Map(enemies.map((item) => [item.id, item]));

  it("starts a game without rarity filtering", () => {
    const session = createEnemyGame(enemies, {
      settings: { rarities: [6], maxAttempts: 5 },
      random: () => 0,
    });
    expect(session.mode).toBe("enemy");
    expect(session.answerId).toBe(enemyAnswer.id);
    expect(session.maxAttempts).toBe(5);
  });

  it("wins on the correct enemy and rejects duplicates", () => {
    const session = createEnemyGame(enemies, { random: () => 0 });
    const wrong = submitEnemyGuess(session, enemyGuess, byId);
    expect(wrong.status).toBe("playing");
    expect(wrong.guesses[0].result.level).toBe("higher");
    expect(() => submitEnemyGuess(wrong, enemyGuess, byId)).toThrow("已经猜过了");
    expect(submitEnemyGuess(wrong, enemyAnswer, byId).status).toBe("won");
  });

  it("searches enemies by partial name", () => {
    expect(searchEnemies(enemies, "霜").map((item) => item.name)).toEqual(["霜星"]);
    expect(searchEnemies(enemies, "   ")).toEqual([]);
  });
});
