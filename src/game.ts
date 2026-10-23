export interface Operator {
  id: string;
  name: string;
  rarity: number;
  profession: string;
  subclass: string;
  faction: string;
  faction_hidden: string[];
  race: string;
  release_year: number;
  /** 实装时正在进行的活动（可能为空） */
  debut?: string;
}

export interface Enemy {
  id: string;
  name: string;
  level: string;
  endure: string;
  attack: string;
  defence: string;
  resistance: string;
  debut: string;
  debut_order: number;
  sort_id: number;
  enemy_race: string;
  attack_type: string;
  damage_type: string;
  motion: string;
}

export type GameMode = "operator" | "enemy";
export type FieldState = "correct" | "close" | "wrong" | "higher" | "lower";
export type FieldStateMap = Record<string, FieldState>;
export type GameStatus = "playing" | "won" | "lost";

export interface GuessRecord {
  guessId: string;
  result: FieldStateMap;
}

export interface GameSession {
  mode: GameMode;
  answerId: string;
  guesses: GuessRecord[];
  maxAttempts: number;
  status: GameStatus;
  startedAt: number;
  finishedAt?: number;
}

export interface LocalStats {
  gamesPlayed: number;
  gamesWon: number;
  currentStreak: number;
  bestStreak: number;
}

export interface GameSettings {
  rarities: number[];
  maxAttempts: number;
}

export interface SavedGameData {
  version: 2;
  sessions: Record<GameMode, GameSession | null>;
  stats: Record<GameMode, LocalStats>;
  settings: GameSettings;
}

export const MAX_ATTEMPTS = 8;
export const RARITIES = [1, 2, 3, 4, 5, 6] as const;
export const STORAGE_KEY = "ark-operator-guess:v2";

export const GRADE_RANK: Record<string, number> = {
  E: 1,
  D: 2,
  C: 3,
  B: 4,
  "B+": 5,
  A: 6,
  "A+": 7,
  S: 8,
  "S+": 9,
  SS: 10,
};

export const LEVEL_RANK: Record<string, number> = {
  普通: 1,
  精英: 2,
  领袖: 3,
};

export function defaultSettings(): GameSettings {
  return { rarities: [...RARITIES], maxAttempts: MAX_ATTEMPTS };
}

export function normalizeSettings(value: unknown): GameSettings {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rarities = Array.isArray(raw.rarities)
    ? [...new Set(
        raw.rarities.filter(
          (item): item is number =>
            typeof item === "number" && Number.isInteger(item) && item >= 1 && item <= 6,
        ),
      )].sort((left, right) => left - right)
    : defaultSettings().rarities;
  const maxAttempts =
    typeof raw.maxAttempts === "number" && Number.isInteger(raw.maxAttempts)
      ? raw.maxAttempts
      : defaultSettings().maxAttempts;
  return { rarities, maxAttempts };
}

export function validateAttemptLimit(value: number): string | null {
  if (!Number.isInteger(value) || value === 0 || value < -1) {
    return "最大猜测次数必须为正整数，或 -1（不限次数）。";
  }
  return null;
}

export function validateSettings(settings: GameSettings): string | null {
  if (!settings.rarities.length) {
    return "请至少选择一个答案稀有度。";
  }
  return validateAttemptLimit(settings.maxAttempts);
}

export function splitFactions(value: string): Set<string> {
  return new Set(
    value
      .split(/[,，;；、]/)
      .map((part) => part.trim())
      .filter(Boolean),
  );
}

function factionOverlap(left: Set<string>, right: Set<string>): boolean {
  return [...left].some((faction) => right.has(faction));
}

function compareNumber(guess: number, answer: number): FieldState {
  if (guess === answer) return "correct";
  return guess < answer ? "higher" : "lower";
}

function compareRank(guess: number | undefined, answer: number | undefined): FieldState {
  if (guess === undefined || answer === undefined) return "wrong";
  return compareNumber(guess, answer);
}

export function compareOperators(guess: Operator, answer: Operator): FieldStateMap {
  const subclass: FieldState =
    guess.profession.trim() !== answer.profession.trim()
      ? "wrong"
      : guess.subclass.trim() === answer.subclass.trim()
        ? "correct"
        : "close";

  const guessMain = splitFactions(guess.faction);
  const answerMain = splitFactions(answer.faction);
  const guessAll = new Set([...guessMain, ...guess.faction_hidden.map((item) => item.trim()).filter(Boolean)]);
  const answerAll = new Set([...answerMain, ...answer.faction_hidden.map((item) => item.trim()).filter(Boolean)]);
  const faction: FieldState = factionOverlap(guessMain, answerMain)
    ? "correct"
    : factionOverlap(guessAll, answerAll)
      ? "close"
      : "wrong";

  // 实装：登场活动一致 → 绿；仅年份一致（活动不同或缺失）→ 黄；否则给年份方向
  const yearState = compareNumber(guess.release_year, answer.release_year);
  const guessDebut = (guess.debut ?? "").trim();
  const answerDebut = (answer.debut ?? "").trim();
  const releaseYear: FieldState =
    guessDebut && answerDebut && guessDebut === answerDebut
      ? "correct"
      : yearState === "correct"
        ? "close"
        : yearState;

  return {
    rarity: compareNumber(guess.rarity, answer.rarity),
    subclass,
    faction,
    race: guess.race.trim() === answer.race.trim() ? "correct" : "wrong",
    release_year: releaseYear,
  };
}

export function compareEnemies(guess: Enemy, answer: Enemy): FieldStateMap {
  const debut: FieldState =
    guess.debut.trim() === answer.debut.trim()
      ? "correct"
      : compareNumber(guess.debut_order ?? 0, answer.debut_order ?? 0);

  return {
    level: compareRank(LEVEL_RANK[guess.level.trim()], LEVEL_RANK[answer.level.trim()]),
    endure: compareRank(GRADE_RANK[guess.endure.trim().toUpperCase()], GRADE_RANK[answer.endure.trim().toUpperCase()]),
    attack: compareRank(GRADE_RANK[guess.attack.trim().toUpperCase()], GRADE_RANK[answer.attack.trim().toUpperCase()]),
    defence: compareRank(GRADE_RANK[guess.defence.trim().toUpperCase()], GRADE_RANK[answer.defence.trim().toUpperCase()]),
    resistance: compareRank(GRADE_RANK[guess.resistance.trim().toUpperCase()], GRADE_RANK[answer.resistance.trim().toUpperCase()]),
    debut,
  };
}

export interface CreateGameOptions {
  settings?: GameSettings;
  random?: () => number;
  now?: number;
}

interface SessionSpec<T> {
  mode: GameMode;
  candidates: (items: T[], settings: GameSettings) => T[];
  compare: (guess: T, answer: T) => FieldStateMap;
}

function createSession<T extends { id: string; name: string }>(
  items: T[],
  spec: SessionSpec<T>,
  options: CreateGameOptions = {},
): GameSession {
  if (items.length === 0) throw new Error("题库为空，无法开始游戏。");
  const settings = normalizeSettings(options.settings ?? defaultSettings());
  const invalid =
    spec.mode === "operator" ? validateSettings(settings) : validateAttemptLimit(settings.maxAttempts);
  if (invalid) throw new Error(invalid);

  const candidates = spec.candidates(items, settings);
  if (candidates.length === 0) {
    throw new Error("当前稀有度设置下没有可作为答案的干员。");
  }

  const random = options.random ?? Math.random;
  const index = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));
  return {
    mode: spec.mode,
    answerId: candidates[index].id,
    guesses: [],
    maxAttempts: settings.maxAttempts,
    status: "playing",
    startedAt: options.now ?? Date.now(),
  };
}

function submit<T extends { id: string; name: string }>(
  session: GameSession,
  guess: T,
  byId: Map<string, T>,
  compare: (guess: T, answer: T) => FieldStateMap,
  now: number,
): GameSession {
  if (session.status !== "playing") throw new Error("本局已经结束，请开始新一局。");
  if (session.guesses.some((record) => record.guessId === guess.id)) {
    throw new Error(`「${guess.name}」已经猜过了。`);
  }
  const answer = byId.get(session.answerId);
  if (!answer) throw new Error("本局答案无效，请刷新页面重新开始。");

  const result = compare(guess, answer);
  const guesses = [...session.guesses, { guessId: guess.id, result }];
  const limitReached = session.maxAttempts > 0 && guesses.length >= session.maxAttempts;
  const status: GameStatus =
    guess.id === answer.id ? "won" : limitReached ? "lost" : "playing";
  return {
    ...session,
    guesses,
    status,
    ...(status === "playing" ? {} : { finishedAt: now }),
  };
}

const OPERATOR_SPEC: SessionSpec<Operator> = {
  mode: "operator",
  candidates: (items, settings) => items.filter((item) => settings.rarities.includes(item.rarity)),
  compare: compareOperators,
};

const ENEMY_SPEC: SessionSpec<Enemy> = {
  mode: "enemy",
  candidates: (items) => items,
  compare: compareEnemies,
};

export function createGame(operators: Operator[], options: CreateGameOptions = {}): GameSession {
  return createSession(operators, OPERATOR_SPEC, options);
}

export function createEnemyGame(enemies: Enemy[], options: CreateGameOptions = {}): GameSession {
  return createSession(enemies, ENEMY_SPEC, options);
}

export function submitGuess(
  session: GameSession,
  guess: Operator,
  operatorsById: Map<string, Operator>,
  now = Date.now(),
): GameSession {
  return submit(session, guess, operatorsById, compareOperators, now);
}

export function submitEnemyGuess(
  session: GameSession,
  guess: Enemy,
  enemiesById: Map<string, Enemy>,
  now = Date.now(),
): GameSession {
  return submit(session, guess, enemiesById, compareEnemies, now);
}

export function defaultStats(): LocalStats {
  return { gamesPlayed: 0, gamesWon: 0, currentStreak: 0, bestStreak: 0 };
}

export function defaultStatsByMode(): Record<GameMode, LocalStats> {
  return { operator: defaultStats(), enemy: defaultStats() };
}

function searchItems<T extends { id: string; name: string }>(items: T[], query: string, limit: number): T[] {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return [];
  return items
    .map((item) => {
      const name = item.name.toLocaleLowerCase();
      const id = item.id.toLocaleLowerCase();
      const rank = name === term || id === term ? 0 : name.startsWith(term) ? 1 : name.includes(term) || id.includes(term) ? 2 : 3;
      return { item, rank, matches: rank < 3 };
    })
    .filter((entry) => entry.matches)
    .sort((left, right) => left.rank - right.rank || left.item.name.localeCompare(right.item.name, "zh-CN"))
    .slice(0, limit)
    .map((entry) => entry.item);
}

export function searchOperators(operators: Operator[], query: string, limit = 8): Operator[] {
  return searchItems(operators, query, limit);
}

export function searchEnemies(enemies: Enemy[], query: string, limit = 8): Enemy[] {
  return searchItems(enemies, query, limit);
}
