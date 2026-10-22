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
}

export type FieldState = "correct" | "close" | "wrong" | "higher" | "lower";
export type GameStatus = "playing" | "won" | "lost";

export interface GuessResult {
  rarity: FieldState;
  subclass: FieldState;
  faction: FieldState;
  race: FieldState;
  release_year: FieldState;
}

export interface GuessRecord {
  operatorId: string;
  result: GuessResult;
}

export interface GameSession {
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
  version: 1;
  session: GameSession | null;
  stats: LocalStats;
  settings?: GameSettings;
}

export const MAX_ATTEMPTS = 8;
export const RARITIES = [1, 2, 3, 4, 5, 6] as const;
export const STORAGE_KEY = "ark-operator-guess:v1";

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

export function validateSettings(settings: GameSettings): string | null {
  if (!settings.rarities.length) {
    return "请至少选择一个答案稀有度。";
  }
  if (
    !Number.isInteger(settings.maxAttempts) ||
    settings.maxAttempts === 0 ||
    settings.maxAttempts < -1
  ) {
    return "最大猜测次数必须为正整数，或 -1（不限次数）。";
  }
  return null;
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

export function compareOperators(guess: Operator, answer: Operator): GuessResult {
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

  return {
    rarity: compareNumber(guess.rarity, answer.rarity),
    subclass,
    faction,
    race: guess.race.trim() === answer.race.trim() ? "correct" : "wrong",
    release_year: compareNumber(guess.release_year, answer.release_year),
  };
}

export interface CreateGameOptions {
  settings?: GameSettings;
  random?: () => number;
  now?: number;
}

export function createGame(operators: Operator[], options: CreateGameOptions = {}): GameSession {
  if (operators.length === 0) throw new Error("题库为空，无法开始游戏。");
  const settings = normalizeSettings(options.settings ?? defaultSettings());
  const invalid = validateSettings(settings);
  if (invalid) throw new Error(invalid);

  const candidates = operators.filter((operator) => settings.rarities.includes(operator.rarity));
  if (candidates.length === 0) {
    throw new Error("当前稀有度设置下没有可作为答案的干员。");
  }

  const random = options.random ?? Math.random;
  const index = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));
  const answer = candidates[index];
  return {
    answerId: answer.id,
    guesses: [],
    maxAttempts: settings.maxAttempts,
    status: "playing",
    startedAt: options.now ?? Date.now(),
  };
}

export function submitGuess(
  session: GameSession,
  guess: Operator,
  operatorsById: Map<string, Operator>,
  now = Date.now(),
): GameSession {
  if (session.status !== "playing") throw new Error("本局已经结束，请开始新一局。");
  if (session.guesses.some((record) => record.operatorId === guess.id)) {
    throw new Error(`「${guess.name}」已经猜过了。`);
  }
  const answer = operatorsById.get(session.answerId);
  if (!answer) throw new Error("本局答案无效，请刷新页面重新开始。");

  const guesses = [...session.guesses, { operatorId: guess.id, result: compareOperators(guess, answer) }];
  const limitReached = session.maxAttempts > 0 && guesses.length >= session.maxAttempts;
  const status: GameStatus = guess.id === answer.id ? "won" : limitReached ? "lost" : "playing";
  return {
    ...session,
    guesses,
    status,
    ...(status === "playing" ? {} : { finishedAt: now }),
  };
}

export function defaultStats(): LocalStats {
  return { gamesPlayed: 0, gamesWon: 0, currentStreak: 0, bestStreak: 0 };
}

export function searchOperators(operators: Operator[], query: string, limit = 8): Operator[] {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return [];
  return operators
    .map((operator) => {
      const name = operator.name.toLocaleLowerCase();
      const id = operator.id.toLocaleLowerCase();
      const rank = name === term || id === term ? 0 : name.startsWith(term) ? 1 : name.includes(term) || id.includes(term) ? 2 : 3;
      return { operator, rank, matches: rank < 3 };
    })
    .filter((entry) => entry.matches)
    .sort((left, right) => left.rank - right.rank || left.operator.name.localeCompare(right.operator.name, "zh-CN"))
    .slice(0, limit)
    .map((entry) => entry.operator);
}
