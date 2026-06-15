import "./styles.css";
import {
  DEFAULT_SETTINGS,
  type Level,
  type MeterSettings,
  type MeterState,
  type RateLimitWindow
} from "../shared/types";
import { levelForRemaining, validateSettings } from "../shared/rate-limits";

const appElement = document.querySelector<HTMLDivElement>("#app");
if (!appElement) {
  throw new Error("App root not found");
}
const appRoot = appElement;

const requestedMode = new URLSearchParams(window.location.search).get("mode");
const mode = requestedMode === "banner" ? "banner" : "main";

installDevelopmentMock();

let state: MeterState = {
  connection: "connecting",
  fiveHour: null,
  sevenDay: null,
  settings: { ...DEFAULT_SETTINGS },
  lastUpdatedAt: null,
  error: null
};
let activeView: "overview" | "settings" = "overview";
let saveMessage = "";

void initialize();

function installDevelopmentMock(): void {
  const params = new URLSearchParams(window.location.search);
  if (!import.meta.env.DEV || params.get("mock") !== "1" || window.codexMeter) {
    return;
  }

  const mockState: MeterState = {
    connection: "connected",
    fiveHour: {
      usedPercent: 17,
      remainingPercent: 83,
      windowDurationMins: 300,
      resetsAt: Math.floor(Date.now() / 1000) + 9_000
    },
    sevenDay: {
      usedPercent: 48,
      remainingPercent: 52,
      windowDurationMins: 10_080,
      resetsAt: Math.floor(Date.now() / 1000) + 360_000
    },
    settings: { ...DEFAULT_SETTINGS },
    lastUpdatedAt: Date.now(),
    error: null
  };
  const listeners = new Set<(nextState: MeterState) => void>();

  window.codexMeter = {
    getState: async () => mockState,
    refresh: async () => undefined,
    saveSettings: async (settings) => {
      mockState.settings = settings;
      listeners.forEach((listener) => listener({ ...mockState }));
      return { ok: true, settings };
    },
    resetSettings: async () => {
      mockState.settings = { ...DEFAULT_SETTINGS };
      listeners.forEach((listener) => listener({ ...mockState }));
      return mockState.settings;
    },
    openMainWindow: async () => undefined,
    openExternal: async () => true,
    quit: async () => undefined,
    onStateChanged: (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    }
  };
}

async function initialize(): Promise<void> {
  state = await window.codexMeter.getState();
  render();
  window.codexMeter.onStateChanged((nextState) => {
    state = nextState;
    render();
  });
}

function render(): void {
  document.body.dataset.mode = mode;
  appRoot.innerHTML = mode === "banner" ? renderBanner() : renderMain();
  bindInteractions();
}

function renderBanner(): string {
  return `
    <button class="fallback-banner" id="open-main" aria-label="打开 Codex Meter">
      ${bannerValue("5 小时", state.fiveHour)}
      <span class="banner-divider" aria-hidden="true"></span>
      ${bannerValue("7 天", state.sevenDay)}
    </button>
  `;
}

function bannerValue(label: string, window: RateLimitWindow | null): string {
  const remaining = window?.remainingPercent;
  const level = remaining === undefined ? "neutral" : levelForRemaining(remaining, state.settings);
  return `
    <span class="banner-value ${level}">
      <span class="banner-primary">
        <small>${label}</small>
        <strong>${remaining === undefined ? "--" : `${remaining}%`}</strong>
      </span>
      <span class="banner-reset">${bannerResetText(window?.resetsAt ?? null)}</span>
    </span>
  `;
}

function bannerResetText(timestamp: number | null): string {
  if (!timestamp) return "重置时间未知";
  return `${new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp * 1000))} 重置`;
}

function renderMain(): string {
  return `
    <main class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark" aria-hidden="true">${iconGauge()}</div>
          <div>
            <strong>Codex Meter</strong>
            <span>本机用量监控</span>
          </div>
        </div>
        <nav aria-label="主导航">
          <button class="nav-item ${activeView === "overview" ? "active" : ""}" data-view="overview">
            ${iconDashboard()}<span>概览</span>
          </button>
          <button class="nav-item ${activeView === "settings" ? "active" : ""}" data-view="settings">
            ${iconSettings()}<span>设置</span>
          </button>
        </nav>
        <div class="sidebar-status">
          ${connectionPill()}
          <span>${updatedText()}</span>
        </div>
      </aside>
      <section class="content">
        ${activeView === "overview" ? renderOverview() : renderSettings()}
      </section>
    </main>
  `;
}

function renderOverview(): string {
  return `
    <header class="page-header">
      <div>
        <p class="eyebrow">实时状态</p>
        <h1>Codex 剩余用量</h1>
        <p class="subtitle">数据直接来自本机 Codex，不会读取或复制登录凭证。</p>
      </div>
      <button class="primary-button" id="refresh">
        ${iconRefresh()}<span>立即刷新</span>
      </button>
    </header>
    ${errorPanel()}
    <section class="overview-grid" aria-label="Codex 限额窗口">
      ${meterCard("5 小时", "短期使用窗口", state.fiveHour, false)}
      ${meterCard("7 天", "长期使用窗口", state.sevenDay, false)}
    </section>
    <section class="info-card">
      <div class="info-icon" aria-hidden="true">${iconInfo()}</div>
      <div>
        <h2>自动保持同步</h2>
        <p>Codex Meter 会监听实时用量变化，并每 60 秒主动校准一次。连接中断后会自动尝试恢复。</p>
      </div>
    </section>
  `;
}

function renderSettings(): string {
  const settings = state.settings;
  return `
    <header class="page-header compact">
      <div>
        <p class="eyebrow">偏好设置</p>
        <h1>显示与提醒</h1>
        <p class="subtitle">颜色分档和通知阈值相互独立。</p>
      </div>
    </header>
    <form id="settings-form" class="settings-layout" novalidate>
      <section class="settings-card">
        <div class="section-heading">
          <div>
            <h2>余量颜色</h2>
            <p>百分比文字与进度条会按以下范围显示。</p>
          </div>
        </div>
        <div class="threshold-preview" aria-label="当前颜色范围预览">
          <div class="preview-segment green">
            <strong>绿色</strong>
            <span id="green-range">${settings.yellowMax + 1}–100%</span>
          </div>
          <div class="preview-segment yellow">
            <strong>黄色</strong>
            <span id="yellow-range">${settings.redMax + 1}–${settings.yellowMax}%</span>
          </div>
          <div class="preview-segment red">
            <strong>红色</strong>
            <span id="red-range">0–${settings.redMax}%</span>
          </div>
        </div>
        <div class="field-grid">
          ${numberField("redMax", "红色上限", settings.redMax, "余量小于或等于该值时显示红色。")}
          ${numberField("yellowMax", "黄色上限", settings.yellowMax, "余量高于红色且不超过该值时显示黄色。")}
        </div>
        <p id="settings-error" class="form-error" role="alert"></p>
      </section>

      <section class="settings-card">
        <div class="section-heading">
          <div>
            <h2>低余量通知</h2>
            <p>每个窗口进入阈值后提醒一次，额度重置后重新启用。</p>
          </div>
          <label class="switch">
            <input id="notificationsEnabled" type="checkbox" ${settings.notificationsEnabled ? "checked" : ""} />
            <span class="switch-track" aria-hidden="true"></span>
            <span class="switch-label">启用通知</span>
          </label>
        </div>
        <div class="single-field">
          ${numberField(
            "notificationThreshold",
            "通知阈值",
            settings.notificationThreshold,
            "5 小时或 7 天余量降至该百分比时通知。"
          )}
        </div>
      </section>

      <section class="settings-card">
        <div class="section-heading">
          <div>
            <h2>启动</h2>
            <p>让 Codex Meter 在登录 macOS 后自动运行。</p>
          </div>
          <label class="switch">
            <input id="launchAtLogin" type="checkbox" ${settings.launchAtLogin ? "checked" : ""} />
            <span class="switch-track" aria-hidden="true"></span>
            <span class="switch-label">登录后启动</span>
          </label>
        </div>
      </section>

      <section class="settings-card about-card">
        <div>
          <p class="about-label">关于</p>
          <h2>Codex Meter</h2>
        </div>
        <dl class="author-info">
          <div>
            <dt>Author</dt>
            <dd>Helo Chang</dd>
          </div>
          <div>
            <dt>GitHub</dt>
            <dd>
              <button
                type="button"
                class="external-link"
                data-external-url="https://github.com/cyrilchang-0306/codexmeter"
                aria-label="在浏览器中打开 GitHub 项目 cyrilchang-0306/codexmeter"
              >
                cyrilchang-0306/codexmeter ${iconExternalLink()}
              </button>
            </dd>
          </div>
          <div>
            <dt>社交平台</dt>
            <dd>抖音 / 小红书 / B站：常期主义</dd>
          </div>
        </dl>
      </section>

      <div class="form-actions">
        <button type="button" class="secondary-button" id="reset-settings">恢复默认值</button>
        <span class="save-message" aria-live="polite">${escapeHtml(saveMessage)}</span>
        <button type="submit" class="primary-button">保存设置</button>
      </div>
    </form>
  `;
}

function meterCard(
  title: string,
  subtitle: string,
  window: RateLimitWindow | null,
  compact: boolean
): string {
  if (!window) {
    return `
      <article class="meter-card ${compact ? "compact" : ""} loading-card">
        <div class="card-top">
          <div><h2>${title}</h2><p>${subtitle}</p></div>
          <span class="status-badge neutral">等待数据</span>
        </div>
        <div class="skeleton" aria-label="正在读取用量"></div>
        <p class="muted">连接成功后将在此显示真实余量。</p>
      </article>
    `;
  }

  const level = levelForRemaining(window.remainingPercent, state.settings);
  const label = levelLabel(level);
  return `
    <article class="meter-card ${compact ? "compact" : ""} level-${level}">
      <div class="card-top">
        <div><h2>${title}</h2><p>${subtitle}</p></div>
        <span class="status-badge ${level}">${statusDot()}${label}</span>
      </div>
      <div class="meter-value-row">
        <strong class="meter-value">${window.remainingPercent}<small>%</small></strong>
        <span>剩余</span>
      </div>
      <div
        class="progress-track"
        role="progressbar"
        aria-label="${title}剩余用量"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow="${window.remainingPercent}"
      >
        <div class="progress-fill" style="transform: scaleX(${window.remainingPercent / 100})"></div>
      </div>
      <div class="card-footer">
        <span>已用 ${window.usedPercent}%</span>
        <span>${resetText(window.resetsAt)}</span>
      </div>
    </article>
  `;
}

function connectionPill(): string {
  const labels = {
    connecting: "正在连接",
    connected: "实时连接",
    error: "连接异常"
  };
  return `<span class="connection-pill ${state.connection}">${statusDot()}${labels[state.connection]}</span>`;
}

function errorPanel(): string {
  if (!state.error) {
    return "";
  }
  return `
    <section class="error-panel" role="alert">
      ${iconAlert()}
      <div><strong>暂时无法读取余量</strong><p>${escapeHtml(state.error)}</p></div>
      <button class="secondary-button small" id="retry">重试</button>
    </section>
  `;
}

function numberField(id: string, label: string, value: number, helper: string): string {
  return `
    <label class="field" for="${id}">
      <span>${label}</span>
      <div class="number-input">
        <input id="${id}" name="${id}" type="number" min="0" max="100" step="1" value="${value}" />
        <span>%</span>
      </div>
      <small>${helper}</small>
    </label>
  `;
}

function bindInteractions(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      activeView = button.dataset.view === "settings" ? "settings" : "overview";
      saveMessage = "";
      render();
    });
  });

  for (const id of ["refresh", "retry"]) {
    document.querySelector<HTMLButtonElement>(`#${id}`)?.addEventListener("click", async (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      button.disabled = true;
      await window.codexMeter.refresh();
    });
  }

  document.querySelector("#open-main")?.addEventListener("click", async () => {
    await window.codexMeter.openMainWindow();
  });

  document.querySelectorAll<HTMLButtonElement>("[data-external-url]").forEach((button) => {
    button.addEventListener("click", async () => {
      const url = button.dataset.externalUrl;
      if (url) {
        await window.codexMeter.openExternal(url);
      }
    });
  });

  const form = document.querySelector<HTMLFormElement>("#settings-form");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const nextSettings = readSettingsForm();
    const error = validateSettings(nextSettings);
    const errorElement = document.querySelector<HTMLParagraphElement>("#settings-error");
    if (error) {
      if (errorElement) errorElement.textContent = error;
      return;
    }

    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit) {
      submit.disabled = true;
      submit.textContent = "保存中…";
    }
    const result = await window.codexMeter.saveSettings(nextSettings);
    saveMessage = result.ok ? "已保存" : result.error ?? "保存失败";
    if (!result.ok && errorElement) {
      errorElement.textContent = saveMessage;
    }
    render();
  });

  document.querySelector("#reset-settings")?.addEventListener("click", async () => {
    await window.codexMeter.resetSettings();
    saveMessage = "已恢复默认值";
    render();
  });

  for (const id of ["redMax", "yellowMax"]) {
    document.querySelector<HTMLInputElement>(`#${id}`)?.addEventListener("input", () => {
      const previewSettings = readSettingsForm();
      const error = validateSettings(previewSettings);
      const errorElement = document.querySelector<HTMLParagraphElement>("#settings-error");
      if (errorElement) errorElement.textContent = error ?? "";
      if (!error) {
        updateThresholdPreview(previewSettings);
      }
    });
  }
}

function updateThresholdPreview(settings: MeterSettings): void {
  const green = document.querySelector("#green-range");
  const yellow = document.querySelector("#yellow-range");
  const red = document.querySelector("#red-range");
  if (green) green.textContent = `${settings.yellowMax + 1}–100%`;
  if (yellow) yellow.textContent = `${settings.redMax + 1}–${settings.yellowMax}%`;
  if (red) red.textContent = `0–${settings.redMax}%`;
}

function readSettingsForm(): MeterSettings {
  const numberValue = (id: string) => {
    const value = document.querySelector<HTMLInputElement>(`#${id}`)?.valueAsNumber;
    return typeof value === "number" && Number.isFinite(value) ? value : -1;
  };
  return {
    redMax: numberValue("redMax"),
    yellowMax: numberValue("yellowMax"),
    notificationThreshold: numberValue("notificationThreshold"),
    notificationsEnabled:
      document.querySelector<HTMLInputElement>("#notificationsEnabled")?.checked ?? false,
    launchAtLogin: document.querySelector<HTMLInputElement>("#launchAtLogin")?.checked ?? false
  };
}

function updatedText(): string {
  if (!state.lastUpdatedAt) {
    return "尚未同步";
  }
  return `更新于 ${new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(state.lastUpdatedAt))}`;
}

function resetText(timestamp: number | null): string {
  if (!timestamp) {
    return "重置时间未知";
  }
  return `${new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp * 1000))} 重置`;
}

function levelLabel(level: Level): string {
  return { green: "充足", yellow: "注意", red: "紧张" }[level];
}

function statusDot(): string {
  return '<span class="status-dot" aria-hidden="true"></span>';
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };
    return map[character];
  });
}

function iconRefresh(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.34 5.66M20 4v7h-7"/></svg>';
}
function iconGauge(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.9 19a9 9 0 1 1 14.2 0M12 13l4-4"/><path d="M12 19v-1"/></svg>';
}
function iconDashboard(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>';
}
function iconSettings(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 9 19.37a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15 1.7 1.7 0 0 0 3.08 14H3v-4h.08A1.7 1.7 0 0 0 4.63 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63 1.7 1.7 0 0 0 10 3.08V3h4v.08A1.7 1.7 0 0 0 15 4.63a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9 1.7 1.7 0 0 0 20.92 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z"/></svg>';
}
function iconInfo(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>';
}
function iconAlert(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v5M12 17h.01"/></svg>';
}
function iconExternalLink(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/></svg>';
}
