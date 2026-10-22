import operatorDataset from "../data/operators.json";
import enemyDataset from "../data/enemies.json";
import {
  createEnemyGame,
  createGame,
  defaultSettings,
  defaultStatsByMode,
  normalizeSettings,
  RARITIES,
  searchEnemies,
  searchOperators,
  STORAGE_KEY,
  submitEnemyGuess,
  submitGuess,
  validateAttemptLimit,
  validateSettings,
  type Enemy,
  type FieldState,
  type GameMode,
  type GameSession,
  type GameSettings,
  type LocalStats,
  type Operator,
  type SavedGameData,
} from "./game";
import "./card.css";

const operators = operatorDataset.operators as Operator[];
const enemies = enemyDataset.enemies as Enemy[];
const operatorsById = new Map(operators.map((operator) => [operator.id, operator]));
const enemiesById = new Map(enemies.map((enemy) => [enemy.id, enemy]));

const appRoot = document.querySelector<HTMLDivElement>("#app");
if (!appRoot) throw new Error("页面缺少 #app 容器。");
const root = appRoot as HTMLDivElement;

type Item = Operator | Enemy;
type View = "home" | GameMode;

interface FieldDef {
  key: string;
  label: string;
  weight: number;
  value: (item: Item) => string;
  sub: (item: Item, state: FieldState) => string;
}

interface ModeConfig {
  mode: GameMode;
  title: string;
  noun: string;
  kicker: string;
  description: string;
  count: number;
  hasRarity: boolean;
  fields: FieldDef[];
  create: (settings: GameSettings) => GameSession;
  submit: (session: GameSession, item: Item) => GameSession;
  search: (query: string) => Item[];
  answerLine: (item: Item) => string;
}

const operatorFields: FieldDef[] = [
  { key: "rarity", label: "稀有度", weight: 1, value: (item) => String((item as Operator).rarity), sub: () => "" },
  {
    key: "subclass",
    label: "职业 / 分支",
    weight: 1.2,
    value: (item) => `${(item as Operator).profession}/${(item as Operator).subclass}`,
    sub: () => "",
  },
  {
    key: "faction",
    label: "阵营",
    weight: 1.2,
    value: (item) => (item as Operator).faction.replace(/[,，;；、]/g, "、"),
    sub: (item, state) =>
      state === "close" && (item as Operator).faction_hidden.length
        ? `隐藏：${(item as Operator).faction_hidden.join("、")}`
        : "",
  },
  { key: "race", label: "种族", weight: 1, value: (item) => (item as Operator).race, sub: () => "" },
  {
    key: "release_year",
    label: "实装",
    weight: 0.9,
    value: (item) => String((item as Operator).release_year),
    sub: () => "",
  },
];

const enemyFields: FieldDef[] = [
  { key: "level", label: "危险等级", weight: 0.9, value: (item) => (item as Enemy).level, sub: () => "" },
  { key: "endure", label: "耐久", weight: 0.8, value: (item) => (item as Enemy).endure, sub: () => "" },
  { key: "attack", label: "攻击", weight: 0.8, value: (item) => (item as Enemy).attack, sub: () => "" },
  { key: "defence", label: "防御", weight: 0.8, value: (item) => (item as Enemy).defence, sub: () => "" },
  { key: "resistance", label: "法术抗性", weight: 0.9, value: (item) => (item as Enemy).resistance, sub: () => "" },
  {
    key: "debut",
    label: "实装",
    weight: 1.8,
    value: (item) => (item as Enemy).debut,
    sub: () => "",
  },
];

const operatorMode: ModeConfig = {
  mode: "operator",
  title: "猜干员",
  noun: "干员",
  kicker: "OPERATORS",
  description: "稀有度 / 职业分支 / 阵营 / 种族 / 实装年份",
  count: operators.length,
  hasRarity: true,
  fields: operatorFields,
  create: (settings) => createGame(operators, { settings }),
  submit: (session, item) => submitGuess(session, item as Operator, operatorsById),
  search: (query) => searchOperators(operators, query, 7),
  answerLine: (item) => {
    const operator = item as Operator;
    return `${operator.name}（${operator.rarity}★ ${operator.profession}/${operator.subclass}）`;
  },
};

const enemyMode: ModeConfig = {
  mode: "enemy",
  title: "猜敌人",
  noun: "敌人",
  kicker: "ENEMIES",
  description: "危险等级 / 耐久 / 攻击 / 防御 / 法术抗性 / 登场活动",
  count: enemies.length,
  hasRarity: false,
  fields: enemyFields,
  create: (settings) => createEnemyGame(enemies, { settings }),
  submit: (session, item) => submitEnemyGuess(session, item as Enemy, enemiesById),
  search: (query) => searchEnemies(enemies, query, 7),
  answerLine: (item) => {
    const enemy = item as Enemy;
    return `${enemy.name}（${enemy.level} · ${enemy.debut}）`;
  },
};

const modeConfigs: Record<GameMode, ModeConfig> = {
  operator: operatorMode,
  enemy: enemyMode,
};

interface RuntimeState {
  view: View;
  sessions: Record<GameMode, GameSession | null>;
  stats: Record<GameMode, LocalStats>;
  settings: GameSettings;
  notice: string;
  selectedId: string;
}

const state: RuntimeState = {
  view: "home",
  sessions: { operator: null, enemy: null },
  stats: defaultStatsByMode(),
  settings: defaultSettings(),
  notice: "",
  selectedId: "",
};

function loadSavedData(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as SavedGameData;
    if (saved.version !== 2) return;
    state.settings = normalizeSettings(saved.settings);
    state.stats = {
      operator: { ...defaultStatsByMode().operator, ...saved.stats?.operator },
      enemy: { ...defaultStatsByMode().enemy, ...saved.stats?.enemy },
    };
    for (const mode of ["operator", "enemy"] as const) {
      const session = saved.sessions?.[mode];
      if (!session || session.mode !== mode) continue;
      const byId = mode === "operator" ? operatorsById : enemiesById;
      if (byId.has(session.answerId)) state.sessions[mode] = session;
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function save(): void {
  const payload: SavedGameData = {
    version: 2,
    sessions: state.sessions,
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

function itemOf(config: ModeConfig, id: string): Item | undefined {
  return config.mode === "operator" ? operatorsById.get(id) : enemiesById.get(id);
}

const STATE_ICONS: Record<string, string> = {
  correct:
    '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3.3 8.5 6.4 11.5 12.7 5.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  close:
    '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="4.9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 3.1a4.9 4.9 0 0 1 0 9.8z" fill="currentColor"/></svg>',
  higher:
    '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 12.6V4.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4.3 7.6 8 3.9l3.7 3.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  lower:
    '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 3.4v8.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4.3 8.4 8 12.1l3.7-3.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  wrong:
    '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
};

const STATE_LABELS: Record<string, string> = {
  correct: "完全正确",
  close: "部分命中",
  higher: "答案更高或更晚",
  lower: "答案更低或更早",
  wrong: "错误",
};

const ICON_SETTINGS =
  '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2.6 4.6h10.8M2.6 8h10.8M2.6 11.4h10.8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="5.8" cy="4.6" r="1.5" fill="currentColor"/><circle cx="10.2" cy="8" r="1.5" fill="currentColor"/><circle cx="5.8" cy="11.4" r="1.5" fill="currentColor"/></svg>';

const ICON_CLOSE =
  '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

const ICON_ARROW_RIGHT =
  '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3.2 8h9.2M8.8 4.2 12.6 8l-3.8 3.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const ICON_ARROW_LEFT =
  '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M12.8 8H3.6M7.2 4.2 3.4 8l3.8 3.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const ICON_GITHUB =
  '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>';

function githubLinks(): string {
  return `<span class="footer-links">
    <a class="footer-link" href="https://github.com/Left-Leaf/arknights-guess-web" target="_blank" rel="noopener noreferrer" aria-label="网页项目源码（GitHub）">${ICON_GITHUB}<span>网页源码</span></a>
    <a class="footer-link" href="https://github.com/Left-Leaf/astrbot_plugin_ark_guess" target="_blank" rel="noopener noreferrer" aria-label="AstrBot 插件源码（GitHub）">${ICON_GITHUB}<span>AstrBot 插件</span></a>
  </span>`;
}

function stateIcon(fieldState: string): string {
  const icon = STATE_ICONS[fieldState] ?? STATE_ICONS.wrong;
  return `<i class="cell-icon" role="img" aria-label="${STATE_LABELS[fieldState] ?? STATE_LABELS.wrong}">${icon}</i>`;
}

function renderRows(config: ModeConfig, session: GameSession | null): string {
  if (!session?.guesses.length) {
    return `<div class="empty-board">输入${config.noun}名称，开始第一次猜测。</div>`;
  }
  return session.guesses
    .map((guess, index) => {
      const item = itemOf(config, guess.guessId);
      if (!item) return "";
      const cells = config.fields
        .map((field) => {
          const fieldState = guess.result[field.key] ?? "wrong";
          const value = escapeHtml(field.value(item));
          const main = `${stateIcon(fieldState)}<span class="cell-text">${value}</span>`;
          const sub = field.sub(item, fieldState);
          return `<div class="result-cell tone-${fieldState}"><span class="cell-main">${main}</span>${sub ? `<span class="cell-sub">${escapeHtml(sub)}</span>` : ""}</div>`;
        })
        .join("");
      return `<div class="guess-row"><div class="guess-identity"><strong>${escapeHtml(item.name)}</strong><span>#${index + 1}</span></div>${cells}</div>`;
    })
    .join("");
}

function formatLimit(limit: number): string {
  return limit === -1 ? "∞" : String(limit);
}

function statusInfo(config: ModeConfig, session: GameSession | null): { text: string; kind: "playing" | "won" | "lost" } {
  if (!session) return { text: `输入${config.noun}名，开始新的一局。`, kind: "playing" };
  if (session.status === "won" || session.status === "lost") {
    const answer = itemOf(config, session.answerId);
    const detail = answer ? config.answerLine(answer) : "未知";
    const prefix = session.status === "won" ? "猜中了！答案是" : "次数用尽，答案是";
    return { text: `${prefix} ${detail}`, kind: session.status };
  }
  if (session.maxAttempts === -1) {
    return { text: `次数不限 · 输入${config.noun}名继续`, kind: "playing" };
  }
  return {
    text: `还剩 ${session.maxAttempts - session.guesses.length} 次机会 · 输入${config.noun}名继续`,
    kind: "playing",
  };
}

function gameCode(session: GameSession | null): string {
  return session ? `game_${session.startedAt.toString(36).slice(-6)}` : "game_local";
}

function settingsDialogMarkup(config: ModeConfig): string {
  const rarityBlock = config.hasRarity
    ? `<div class="setting-row">
        <span class="setting-label">答案稀有度</span>
        <div class="rarity-options">
          ${RARITIES.map((rarity) => `<label class="rarity-option"><input type="checkbox" name="rarity" value="${rarity}"${state.settings.rarities.includes(rarity) ? " checked" : ""} /><span>${rarity}★</span></label>`).join("")}
        </div>
        <p class="setting-hint">只影响可作为答案的干员，不影响猜测。</p>
      </div>`
    : `<p class="setting-hint">敌人题库没有稀有度筛选，全部 ${config.count} 名敌人均可作为答案。</p>`;
  return `
    <dialog class="settings-dialog" id="settings-dialog">
      <form method="dialog" class="settings-form">
        <div class="settings-head"><strong>游戏设置</strong><button class="settings-close" type="submit" aria-label="关闭">${ICON_CLOSE}</button></div>
        ${rarityBlock}
        <div class="setting-row">
          <label class="setting-label" for="max-attempts">最大猜测次数</label>
          <input class="settings-number" id="max-attempts" type="number" min="-1" step="1" value="${state.settings.maxAttempts}" />
          <p class="setting-hint">-1 表示不限次数；新设置从下一局开始生效。</p>
        </div>
        <p class="settings-error" id="settings-error" role="alert"></p>
        <button class="settings-done" type="submit">完成</button>
      </form>
    </dialog>`;
}

function renderHome(): void {
  const cards = (["operator", "enemy"] as const)
    .map((mode) => {
      const config = modeConfigs[mode];
      const session = state.sessions[mode];
      const badge = !session
        ? ""
        : session.status === "playing"
          ? `<span class="mode-badge">进行中 · 已猜 ${session.guesses.length} 次</span>`
          : `<span class="mode-badge">上一局已结束</span>`;
      return `<button class="mode-card" type="button" data-mode="${mode}">
        <span class="mode-kicker">${config.kicker} · ${config.count}</span>
        <strong>${config.title}</strong>
        <span class="mode-desc">${config.description}</span>
        ${badge}
        <span class="mode-cta">进入 ${ICON_ARROW_RIGHT}</span>
      </button>`;
    })
    .join("");

  root.innerHTML = `
    <div class="page-shell">
      <main class="game-card home-card">
        <header class="card-head">
          <div><p class="kicker">ARKNIGHTS · GUESS</p><h1>明日方舟 <span>猜一猜</span></h1></div>
          <div class="card-meta"><div class="meta-row"><span class="game-id">select_mode</span></div></div>
        </header>
        <hr class="card-rule" />
        <p class="home-lead">选择一个题库开始。每次猜测都会给出维度提示，逐步锁定答案。</p>
        <div class="mode-grid">${cards}</div>
        <p class="home-note">干员为五维判定；敌人为六维判定，实装一列显示登场活动。</p>
      </main>
      <footer class="page-footer"><span>记录保存在此浏览器 · 数据来源：PRTS</span>${githubLinks()}</footer>
    </div>`;

  root.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.mode as GameMode;
      state.view = mode;
      state.notice = "";
      state.selectedId = "";
      render();
    });
  });
}

function renderGame(config: ModeConfig): void {
  const session = state.sessions[config.mode];
  const isPlaying = session?.status === "playing";
  const isFinished = session && session.status !== "playing";
  const attempts = session?.guesses.length ?? 0;
  const maxAttempts = session?.maxAttempts ?? state.settings.maxAttempts;
  const progress = `${attempts} / ${formatLimit(maxAttempts)}`;
  const status = statusInfo(config, session);
  const guessForm = `<form id="guess-form" class="guess-form" autocomplete="off"><label for="item-search">提交${config.noun}</label><div class="search-wrap"><input id="item-search" name="item" type="search" placeholder="输入${config.noun}名称" aria-label="${config.noun}名称" aria-autocomplete="list" aria-controls="suggestions" /><button type="submit" aria-label="提交猜测">猜测 <span class="button-arrow">${ICON_ARROW_RIGHT}</span></button></div><div id="suggestions" class="suggestions" role="listbox"></div><p class="form-hint">可输入部分名称，再从候选中选择。</p></form>`;
  const action = isFinished
    ? `<button class="start-button" id="restart-game">再开一局<span class="button-arrow">${ICON_ARROW_RIGHT}</span></button>`
    : guessForm;

  const colsTemplate = `minmax(96px, 190px) ${config.fields.map((field) => `${field.weight}fr`).join(" ")}`;

  root.innerHTML = `
    <div class="page-shell">
      <main class="game-card">
        <header class="card-head">
          <div><p class="kicker">ARKNIGHTS · GUESS</p><h1>明日方舟 <span>${config.title}</span></h1></div>
          <div class="card-meta"><div class="meta-row"><button class="back-button" id="back-home" type="button"><span class="button-arrow">${ICON_ARROW_LEFT}</span>返回</button><span class="game-id">${gameCode(session)}</span><button class="settings-button" id="open-settings" type="button" aria-label="游戏设置">${ICON_SETTINGS}<span>设置</span></button>${isPlaying ? `<button class="restart-button" id="restart-game" type="button">重新开始</button>` : ""}</div><strong class="progress">${progress}</strong></div>
        </header>
        <hr class="card-rule" />

        <section class="action-area">
          ${action}
          ${state.notice ? `<p class="notice" role="status">${escapeHtml(state.notice)}</p>` : ""}
        </section>

        <div class="board-scroll">
          <div class="board-grid" role="table" aria-label="猜测线索" style="--cols:${config.fields.length};--cols-template:${colsTemplate}">
            <div class="board-labels" role="row"><span></span>${config.fields.map((field) => `<span>${field.label}</span>`).join("")}</div>
            <div class="guess-list">${renderRows(config, session)}</div>
          </div>
        </div>

        <div class="status-bar status-${status.kind}">${escapeHtml(status.text)}</div>

        <div class="card-footer">
          <div class="legend"><span><i class="legend-dot correct">${STATE_ICONS.correct}</i>完全正确</span><span><i class="legend-dot close">${STATE_ICONS.close}</i>部分命中</span><span><i class="legend-dot direction">${STATE_ICONS.higher}${STATE_ICONS.lower}</i>方向提示</span><span><i class="legend-dot wrong">${STATE_ICONS.wrong}</i>错误</span></div>
          <span class="arrow-hint">${STATE_ICONS.higher}答案更高 / 更晚 ${STATE_ICONS.lower}答案更低 / 更早</span>
        </div>
      </main>
      ${settingsDialogMarkup(config)}
      <footer class="page-footer"><span>本模式：已开始 ${state.stats[config.mode].gamesPlayed} · 成功 ${state.stats[config.mode].gamesWon} · 最佳连胜 ${state.stats[config.mode].bestStreak}</span>${githubLinks()}</footer>
    </div>`;

  bindGameEvents(config);
}

function render(): void {
  if (state.view === "home") {
    renderHome();
    return;
  }
  renderGame(modeConfigs[state.view]);
}

function bindGameEvents(config: ModeConfig): void {
  document.querySelector<HTMLButtonElement>("#back-home")?.addEventListener("click", () => {
    state.view = "home";
    state.notice = "";
    state.selectedId = "";
    render();
  });
  document.querySelector<HTMLButtonElement>("#restart-game")?.addEventListener("click", () => {
    const playing = state.sessions[config.mode]?.status === "playing";
    if (playing && !window.confirm("结束本局？当前猜测进度将被清除。")) return;
    endSession(config, playing ? "已结束本局，输入名称开始新的一局。" : "");
  });
  document.querySelector<HTMLButtonElement>("#open-settings")?.addEventListener("click", openSettings);
  const dialog = document.querySelector<HTMLDialogElement>("#settings-dialog");
  dialog?.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
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
  document.querySelector<HTMLFormElement>("#guess-form")?.addEventListener("submit", (event) =>
    handleGuess(event, config),
  );
  const input = document.querySelector<HTMLInputElement>("#item-search");
  input?.addEventListener("input", () => renderSuggestions(input.value, config));
}

function openSettings(): void {
  const dialog = document.querySelector<HTMLDialogElement>("#settings-dialog");
  if (dialog && !dialog.open) dialog.showModal();
}

function readSettingsFromDom(): void {
  const rarityInputs = [...document.querySelectorAll<HTMLInputElement>('input[name="rarity"]')];
  const rarities = rarityInputs.length
    ? rarityInputs
        .filter((checkbox) => checkbox.checked)
        .map((checkbox) => Number(checkbox.value))
        .filter((value) => Number.isInteger(value) && value >= 1 && value <= 6)
        .sort((left, right) => left - right)
    : state.settings.rarities;
  const maxInput = document.querySelector<HTMLInputElement>("#max-attempts");
  const parsed = maxInput ? Number(maxInput.value) : state.settings.maxAttempts;
  state.settings = {
    rarities,
    maxAttempts: Number.isInteger(parsed) ? parsed : 0,
  };
}

function updateSettingsError(): void {
  const target = document.querySelector<HTMLElement>("#settings-error");
  if (!target) return;
  const config = state.view === "home" ? null : modeConfigs[state.view];
  const message =
    config && !config.hasRarity
      ? validateAttemptLimit(state.settings.maxAttempts)
      : validateSettings(state.settings);
  target.textContent = message ?? "";
}

function updateProgressPreview(): void {
  if (state.view === "home") return;
  if (state.sessions[state.view]) return;
  const target = document.querySelector<HTMLElement>(".progress");
  if (target) target.textContent = `0 / ${formatLimit(state.settings.maxAttempts)}`;
}

function endSession(config: ModeConfig, notice: string): void {
  state.sessions[config.mode] = null;
  state.notice = notice;
  state.selectedId = "";
  save();
  render();
  document.querySelector<HTMLInputElement>("#item-search")?.focus();
}

function renderSuggestions(query: string, config: ModeConfig): void {
  const container = document.querySelector<HTMLDivElement>("#suggestions");
  if (!container) return;
  state.selectedId = "";
  const matches = config.search(query);
  if (!query.trim() || !matches.length) {
    container.innerHTML = query.trim() ? `<p class="no-matches">没有找到候选${config.noun}</p>` : "";
    return;
  }
  container.innerHTML = matches
    .map(
      (item) => `
    <button class="suggestion" type="button" role="option" data-item-id="${escapeHtml(item.id)}">
      <strong>${escapeHtml(item.name)}</strong>
    </button>`,
    )
    .join("");
  container.querySelectorAll<HTMLButtonElement>("[data-item-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = itemOf(config, button.dataset.itemId ?? "");
      const input = document.querySelector<HTMLInputElement>("#item-search");
      if (!item || !input) return;
      input.value = item.name;
      state.selectedId = item.id;
      container.innerHTML = `<p class="selected-hint">${escapeHtml(item.name)}</p>`;
      input.focus();
    });
  });
}

function resolveInput(input: HTMLInputElement, config: ModeConfig): Item | null {
  if (state.selectedId) return itemOf(config, state.selectedId) ?? null;
  const term = input.value.trim().toLocaleLowerCase();
  const source: Item[] = config.mode === "operator" ? operators : enemies;
  const exact = source.filter(
    (item) => item.name.toLocaleLowerCase() === term || item.id.toLocaleLowerCase() === term,
  );
  return exact.length === 1 ? exact[0] : null;
}

function handleGuess(event: SubmitEvent, config: ModeConfig): void {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const input = form.elements.namedItem("item") as HTMLInputElement;
  const guess = resolveInput(input, config);
  if (!guess) {
    state.notice = input.value.trim()
      ? `请选择候选列表中的${config.noun}，或输入完整名称。`
      : `先输入并选择一名${config.noun}。`;
    render();
    document.querySelector<HTMLInputElement>("#item-search")?.focus();
    return;
  }
  const session = state.sessions[config.mode];
  try {
    let active = session;
    if (!active) {
      // 首次提交时才创建新对局，避免空点“重新开始”就消耗一局
      readSettingsFromDom();
      const invalid = config.hasRarity
        ? validateSettings(state.settings)
        : validateAttemptLimit(state.settings.maxAttempts);
      if (invalid) {
        state.notice = invalid;
        render();
        openSettings();
        return;
      }
      active = config.create(state.settings);
      state.sessions[config.mode] = active;
      state.stats[config.mode].gamesPlayed += 1;
    }
    const next = config.submit(active, guess);
    state.sessions[config.mode] = next;
    const stats = state.stats[config.mode];
    if (next.status === "won") {
      stats.gamesWon += 1;
      stats.currentStreak += 1;
      stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
    } else if (next.status === "lost") {
      stats.currentStreak = 0;
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
