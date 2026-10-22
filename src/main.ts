import dataset from "../data/operators.json";
import {
  createGame,
  defaultSettings,
  defaultStats,
  normalizeSettings,
  RARITIES,
  searchOperators,
  STORAGE_KEY,
  submitGuess,
  validateSettings,
  type GameSettings,
  type GameSession,
  type LocalStats,
  type Operator,
  type SavedGameData,
} from "./game";
import "./card.css";

const operators = dataset.operators as Operator[];
const operatorsById = new Map(operators.map((operator) => [operator.id, operator]));
const appRoot = document.querySelector<HTMLDivElement>("#app");
if (!appRoot) throw new Error("页面缺少 #app 容器。");
const root = appRoot as HTMLDivElement;

interface RuntimeState {
  session: GameSession | null;
  stats: LocalStats;
  settings: GameSettings;
  notice: string;
  selectedId: string;
}

const state: RuntimeState = {
  session: null,
  stats: defaultStats(),
  settings: defaultSettings(),
  notice: "",
  selectedId: "",
};

function loadSavedData(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as SavedGameData;
    if (saved.version !== 1) return;
    state.stats = { ...defaultStats(), ...saved.stats };
    state.settings = normalizeSettings(saved.settings);
    if (saved.session && operatorsById.has(saved.session.answerId)) {
      state.session = saved.session;
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function save(): void {
  const payload: SavedGameData = {
    version: 1,
    session: state.session,
    stats: state.stats,
    settings: state.settings,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    state.notice = "浏览器无法保存本地记录；关闭页面后本局可能丢失。";
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[character];
  });
}

const fields: { key: keyof GameSession["guesses"][number]["result"]; label: string }[] = [
  { key: "rarity", label: "稀有度" },
  { key: "subclass", label: "职业 / 分支" },
  { key: "faction", label: "阵营" },
  { key: "race", label: "种族" },
  { key: "release_year", label: "实装" },
];

function fieldValue(operator: Operator, key: (typeof fields)[number]["key"]): string {
  switch (key) {
    case "rarity": return String(operator.rarity);
    case "subclass": return operator.subclass;
    case "faction": return operator.faction.replace(/[,，;；、]/g, "、");
    case "race": return operator.race;
    case "release_year": return String(operator.release_year);
  }
}

function fieldSub(operator: Operator, key: (typeof fields)[number]["key"], state: string): string {
  if (key === "subclass") return `职业：${operator.profession}`;
  if (key === "faction" && state === "close" && operator.faction_hidden.length) {
    return `隐藏：${operator.faction_hidden.join("、")}`;
  }
  return "";
}

function stateMark(fieldState: string): string {
  if (fieldState === "correct") return "√";
  if (fieldState === "close") return "~";
  if (fieldState === "higher") return "↑";
  if (fieldState === "lower") return "↓";
  return "×";
}

function renderRows(session: GameSession | null): string {
  if (!session?.guesses.length) {
    return `<div class="empty-board">输入干员名称，开始第一次猜测。</div>`;
  }
  return session.guesses.map((guess, index) => {
    const operator = operatorsById.get(guess.operatorId);
    if (!operator) return "";
    const cells = fields.map(({ key }) => {
      const state = guess.result[key];
      const value = escapeHtml(fieldValue(operator, key));
      const main = state === "higher" || state === "lower" ? `${value} ${stateMark(state)}` : `${stateMark(state)} ${value}`;
      const sub = fieldSub(operator, key, state);
      return `<div class="result-cell tone-${state}"><span class="cell-main">${main}</span>${sub ? `<span class="cell-sub">${escapeHtml(sub)}</span>` : ""}</div>`;
    }).join("");
    return `<div class="guess-row"><div class="guess-identity"><strong>${escapeHtml(operator.name)}</strong><span>#${index + 1}</span></div>${cells}</div>`;
  }).join("");
}

function formatLimit(limit: number): string {
  return limit === -1 ? "∞" : String(limit);
}

function statusInfo(session: GameSession | null): { text: string; kind: "playing" | "won" | "lost" } {
  if (!session) return { text: "选择一名干员，开始本局推演。", kind: "playing" };
  if (session.status === "won") {
    const answer = operatorsById.get(session.answerId);
    const detail = answer ? `${answer.name}（${answer.rarity}★ ${answer.profession}/${answer.subclass}）` : "未知";
    return { text: `猜中了！答案是 ${detail}`, kind: "won" };
  }
  if (session.status === "lost") {
    const answer = operatorsById.get(session.answerId);
    const detail = answer ? `${answer.name}（${answer.rarity}★ ${answer.profession}/${answer.subclass}）` : "未知";
    return { text: `次数用尽，答案是 ${detail}`, kind: "lost" };
  }
  if (session.maxAttempts === -1) {
    return { text: "次数不限 · 输入干员名继续", kind: "playing" };
  }
  return {
    text: `还剩 ${session.maxAttempts - session.guesses.length} 次机会 · 输入干员名继续`,
    kind: "playing",
  };
}

function gameCode(session: GameSession | null): string {
  return session ? `game_${session.startedAt.toString(36).slice(-6)}` : "game_local";
}

function render(): void {
  const session = state.session;
  const isPlaying = session?.status === "playing";
  const isFinished = session && session.status !== "playing";
  const attempts = session?.guesses.length ?? 0;
  const maxAttempts = session?.maxAttempts ?? state.settings.maxAttempts;
  const progress = `${attempts} / ${formatLimit(maxAttempts)}`;
  const status = statusInfo(session);
  const action = isPlaying
    ? `<form id="guess-form" class="guess-form" autocomplete="off"><label for="operator-search">提交干员</label><div class="search-wrap"><input id="operator-search" name="operator" type="search" placeholder="输入干员名称" aria-label="干员名称" aria-autocomplete="list" aria-controls="suggestions" /><button type="submit" aria-label="提交猜测">猜测 <span aria-hidden="true">→</span></button></div><div id="suggestions" class="suggestions" role="listbox"></div><p class="form-hint">可输入部分名称，再从候选中选择。</p></form>`
    : `<button class="start-button" id="start-game">${isFinished ? "再开一局" : "开始推演"}<span aria-hidden="true">→</span></button>${isFinished ? `<button class="quiet-button" id="clear-game">清除本局记录</button>` : ""}`;
  const settingsDialog = `
    <dialog class="settings-dialog" id="settings-dialog">
      <form method="dialog" class="settings-form">
        <div class="settings-head"><strong>游戏设置</strong><button class="settings-close" type="submit" aria-label="关闭">×</button></div>
        <div class="setting-row">
          <span class="setting-label">答案稀有度</span>
          <div class="rarity-options">
            ${RARITIES.map((rarity) => `<label class="rarity-option"><input type="checkbox" name="rarity" value="${rarity}"${state.settings.rarities.includes(rarity) ? " checked" : ""} /><span>${rarity}★</span></label>`).join("")}
          </div>
          <p class="setting-hint">只影响可作为答案的干员，不影响猜测。</p>
        </div>
        <div class="setting-row">
          <label class="setting-label" for="max-attempts">最大猜测次数</label>
          <input class="settings-number" id="max-attempts" type="number" min="-1" step="1" value="${state.settings.maxAttempts}" />
          <p class="setting-hint">-1 表示不限次数；新设置从下一局开始生效。</p>
        </div>
        <p class="settings-error" id="settings-error" role="alert"></p>
        <button class="settings-done" type="submit">完成</button>
      </form>
    </dialog>`;

  root.innerHTML = `
    <div class="page-shell">
      <main class="game-card">
        <header class="card-head">
          <div><p class="kicker">ARKNIGHTS · GUESS</p><h1>明日方舟 <span>猜干员</span></h1></div>
          <div class="card-meta"><div class="meta-row"><span class="game-id">${gameCode(session)}</span><button class="settings-button" id="open-settings" type="button" aria-label="游戏设置">⚙<span>设置</span></button>${isPlaying ? `<button class="restart-button" id="restart-game" type="button">重新开始</button>` : ""}</div><strong class="progress">${progress}</strong></div>
        </header>
        <hr class="card-rule" />

        <section class="action-area">
          ${action}
          ${state.notice ? `<p class="notice" role="status">${escapeHtml(state.notice)}</p>` : ""}
        </section>

        <div class="board-scroll">
          <div class="board-grid" role="table" aria-label="猜测线索">
            <div class="board-labels" role="row"><span></span>${fields.map((field) => `<span>${field.label}</span>`).join("")}</div>
            <div class="guess-list">${renderRows(session)}</div>
          </div>
        </div>

        <div class="status-bar status-${status.kind}">${escapeHtml(status.text)}</div>

        <div class="card-footer">
          <div class="legend"><span><i class="legend-dot correct">√</i>完全正确</span><span><i class="legend-dot close">~</i>部分命中</span><span><i class="legend-dot direction">↑↓</i>方向提示</span><span><i class="legend-dot wrong">×</i>错误</span></div>
          <span class="arrow-hint">↑ 答案更高 / 更晚　↓ 答案更低 / 更早</span>
        </div>
      </main>
      ${settingsDialog}
      <footer class="page-footer"><span>已开始 ${state.stats.gamesPlayed} · 成功 ${state.stats.gamesWon} · 最佳连胜 ${state.stats.bestStreak}</span><span>记录保存在此浏览器</span></footer>
    </div>`;

  document.querySelector<HTMLButtonElement>("#start-game")?.addEventListener("click", startGame);
  document.querySelector<HTMLButtonElement>("#restart-game")?.addEventListener("click", restartGame);
  const settingsDialogElement = document.querySelector<HTMLDialogElement>("#settings-dialog");
  document.querySelector<HTMLButtonElement>("#open-settings")?.addEventListener("click", openSettings);
  settingsDialogElement?.addEventListener("click", (event) => {
    if (event.target === settingsDialogElement) settingsDialogElement.close();
  });
  document.querySelectorAll<HTMLInputElement>('input[name="rarity"]').forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      readSettingsFromDom();
      save();
      updateSettingsError();
      updateProgressPreview();
    });
  });
  document.querySelector<HTMLInputElement>("#max-attempts")?.addEventListener("input", () => {
    readSettingsFromDom();
    save();
    updateSettingsError();
    updateProgressPreview();
  });
  updateSettingsError();
  document.querySelector<HTMLButtonElement>("#clear-game")?.addEventListener("click", () => {
    state.session = null;
    state.notice = "本局记录已清除。";
    save();
    render();
  });
  document.querySelector<HTMLFormElement>("#guess-form")?.addEventListener("submit", handleGuess);
  const input = document.querySelector<HTMLInputElement>("#operator-search");
  input?.addEventListener("input", () => renderSuggestions(input.value));
}

function openSettings(): void {
  const dialog = document.querySelector<HTMLDialogElement>("#settings-dialog");
  if (dialog && !dialog.open) dialog.showModal();
}

function readSettingsFromDom(): void {
  const rarities = [...document.querySelectorAll<HTMLInputElement>('input[name="rarity"]:checked')]
    .map((checkbox) => Number(checkbox.value))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 6)
    .sort((left, right) => left - right);
  const maxInput = document.querySelector<HTMLInputElement>("#max-attempts");
  const parsed = maxInput ? Number(maxInput.value) : state.settings.maxAttempts;
  state.settings = {
    rarities,
    maxAttempts: Number.isInteger(parsed) ? parsed : 0,
  };
}

function updateSettingsError(): void {
  const target = document.querySelector<HTMLElement>("#settings-error");
  if (target) target.textContent = validateSettings(state.settings) ?? "";
}

function updateProgressPreview(): void {
  if (state.session) return;
  const target = document.querySelector<HTMLElement>(".progress");
  if (target) target.textContent = `0 / ${formatLimit(state.settings.maxAttempts)}`;
}

function newSession(notice: string): void {
  readSettingsFromDom();
  const invalid = validateSettings(state.settings);
  if (invalid) {
    state.notice = invalid;
    render();
    openSettings();
    return;
  }
  try {
    state.session = createGame(operators, { settings: state.settings });
  } catch (error) {
    state.notice = error instanceof Error ? error.message : "无法开始游戏。";
    render();
    openSettings();
    return;
  }
  state.stats.gamesPlayed += 1;
  state.notice = notice;
  state.selectedId = "";
  save();
  render();
  document.querySelector<HTMLInputElement>("#operator-search")?.focus();
}

function startGame(): void {
  newSession("");
}

function restartGame(): void {
  if (!window.confirm("重开本局？当前猜测进度将被清除。")) return;
  newSession("");
}

function renderSuggestions(query: string): void {
  const container = document.querySelector<HTMLDivElement>("#suggestions");
  if (!container) return;
  state.selectedId = "";
  const matches = searchOperators(operators, query, 7);
  if (!query.trim() || !matches.length) {
    container.innerHTML = query.trim() ? `<p class="no-matches">没有找到候选干员</p>` : "";
    return;
  }
  container.innerHTML = matches.map((operator) => `
    <button class="suggestion" type="button" role="option" data-operator-id="${escapeHtml(operator.id)}">
      <strong>${escapeHtml(operator.name)}</strong>
    </button>`).join("");
  container.querySelectorAll<HTMLButtonElement>("[data-operator-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const operator = operatorsById.get(button.dataset.operatorId ?? "");
      const input = document.querySelector<HTMLInputElement>("#operator-search");
      if (!operator || !input) return;
      input.value = operator.name;
      state.selectedId = operator.id;
      container.innerHTML = `<p class="selected-hint">${escapeHtml(operator.name)}</p>`;
      input.focus();
    });
  });
}

function resolveInput(input: HTMLInputElement): Operator | null {
  if (state.selectedId) return operatorsById.get(state.selectedId) ?? null;
  const term = input.value.trim().toLocaleLowerCase();
  const exact = operators.filter((operator) => operator.name.toLocaleLowerCase() === term || operator.id.toLocaleLowerCase() === term);
  return exact.length === 1 ? exact[0] : null;
}

function handleGuess(event: SubmitEvent): void {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const input = form.elements.namedItem("operator") as HTMLInputElement;
  const guess = resolveInput(input);
  if (!guess) {
    state.notice = input.value.trim() ? "请选择候选列表中的干员，或输入完整名称。" : "先输入并选择一名干员。";
    render();
    document.querySelector<HTMLInputElement>("#operator-search")?.focus();
    return;
  }
  if (!state.session) return;
  const wasPlaying = state.session.status === "playing";
  try {
    state.session = submitGuess(state.session, guess, operatorsById);
    if (wasPlaying && state.session.status === "won") {
      state.stats.gamesWon += 1;
      state.stats.currentStreak += 1;
      state.stats.bestStreak = Math.max(state.stats.bestStreak, state.stats.currentStreak);
    } else if (wasPlaying && state.session.status === "lost") {
      state.stats.currentStreak = 0;
    }
    state.notice = "";
    state.selectedId = "";
    save();
    render();
  } catch (error) {
    state.notice = error instanceof Error ? error.message : "提交失败，请重试。";
    render();
  }
}

loadSavedData();
render();
