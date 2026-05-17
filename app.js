const STORAGE_KEY = "coffee-counter-state-v2";
const LEGACY_STORAGE_KEYS = ["coffee-counter-state-v1"];
const DEFAULT_BACKGROUND = "#f37d9b";
const MAX_HISTORY_ENTRIES = 5000;
const HISTORY_PREVIEW_LIMIT = 4;
const IMAGE_PRESETS = {
  reference: "assets/my_coffee_cup1.png",
  colacao: "assets/colacao%201.png",
  taza: "assets/Taza%20icono%20cafe.png"
};
const TAP_SOUND_SRC = "./sounds/749860__etheraudio__satisfying-click.wav";

const body = document.body;
const themeColorMeta = document.querySelector('meta[name="theme-color"]');
const counterScreen = document.getElementById("counterScreen");
const updateBanner = document.getElementById("updateBanner");
const refreshAppButton = document.getElementById("refreshAppButton");
const settingsScreen = document.getElementById("settingsScreen");
const historyScreen = document.getElementById("historyScreen");
const settingsButton = document.getElementById("settingsButton");
const closeSettingsButton = document.getElementById("closeSettingsButton");
const openHistoryButton = document.getElementById("openHistoryButton");
const closeHistoryButton = document.getElementById("closeHistoryButton");
const counterButton = document.getElementById("counterButton");
const cupArt = document.getElementById("cupArt");
const totalCount = document.getElementById("totalCount");
const plusOne = document.getElementById("plusOne");
const screenReaderStatus = document.getElementById("screenReaderStatus");
const backgroundColorInput = document.getElementById("backgroundColorInput");
const backgroundColorValue = document.getElementById("backgroundColorValue");
const historyCountValue = document.getElementById("historyCountValue");
const historySummary = document.getElementById("historySummary");
const historyPreviewList = document.getElementById("historyPreviewList");
const historyGroups = document.getElementById("historyGroups");
const historyStatTotal = document.getElementById("historyStatTotal");
const historyStatToday = document.getElementById("historyStatToday");
const historyStatLatest = document.getElementById("historyStatLatest");
const historyStatFirst = document.getElementById("historyStatFirst");
const historyEmptyState = document.getElementById("historyEmptyState");
const exportHistoryButton = document.getElementById("exportHistoryButton");
const clearHistoryButton = document.getElementById("clearHistoryButton");
const resetCounterButton = document.getElementById("resetCounterButton");
const imageRadios = Array.from(document.querySelectorAll('input[name="cupImage"]'));

const createDefaultState = () => ({
  total: 0,
  today: 0,
  dateKey: getTodayKey(),
  updatedAt: null,
  clickHistory: [],
  settings: {
    backgroundColor: DEFAULT_BACKGROUND,
    imageKey: "reference"
  }
});

let state = loadState();
const tapSoundTemplate = typeof Audio === "function" ? new Audio(TAP_SOUND_SRC) : null;
const timestampFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short"
});
const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit"
});
const dayTitleFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "long"
});
const daySubtitleFormatter = new Intl.DateTimeFormat(undefined, {
  month: "long",
  day: "numeric",
  year: "numeric"
});
let settingsOpen = false;
let historyOpen = false;
let pendingServiceWorker = null;

if (tapSoundTemplate) {
  tapSoundTemplate.preload = "auto";
  tapSoundTemplate.load();
}

normalizeTodayState();
render();
attachEvents();
registerServiceWorker();

function attachEvents() {
  counterButton.addEventListener("pointermove", handleCounterPointerMove);
  counterButton.addEventListener("pointerleave", resetCounterHoverPose);
  counterButton.addEventListener("pointercancel", resetCounterHoverPose);
  counterButton.addEventListener("pointerdown", (event) => {
    if (isOverlayOpen() || event.button > 0) {
      return;
    }

    const pointerState = getCounterPointerState(event.clientX, event.clientY);

    if (event.pointerType === "mouse") {
      applyCounterHoverPose(pointerState);
    }

    applyCounterPressPose(pointerState);
  });

  counterButton.addEventListener("click", async (event) => {
    if (isOverlayOpen()) {
      return;
    }

    if (event.detail > 0) {
      applyCounterPressPose(getCounterPointerState(event.clientX, event.clientY));
    } else {
      applyCounterPressPose();
      resetCounterHoverPose();
    }

    normalizeTodayState();
    const timestamp = new Date().toISOString();
    state.total += 1;
    state.today += 1;
    state.updatedAt = timestamp;
    recordClickTimestamp(timestamp);

    persistState();
    render({ animateCup: true, announceTap: true, vibrate: true });
    await playTapSound();
  });

  plusOne.addEventListener("animationend", () => {
    plusOne.textContent = "+1";
  });

  settingsButton.addEventListener("click", () => {
    openSettings();
  });

  closeSettingsButton.addEventListener("click", () => {
    closeSettings();
  });

  openHistoryButton.addEventListener("click", () => {
    openHistory();
  });

  closeHistoryButton.addEventListener("click", () => {
    closeHistory();
  });

  backgroundColorInput.addEventListener("input", () => {
    state.settings.backgroundColor = normalizeHexColor(backgroundColorInput.value);
    persistState();
    render({ announcement: "Background color updated." });
  });

  imageRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked) {
        return;
      }

      state.settings.imageKey = radio.value;
      persistState();
      render({ announcement: "Image updated." });
    });
  });

  exportHistoryButton.addEventListener("click", () => {
    if (!state.clickHistory.length) {
      return;
    }

    exportHistoryAsCsv();
    render({ announcement: "Click history exported." });
  });

  clearHistoryButton.addEventListener("click", () => {
    if (!state.clickHistory.length) {
      return;
    }

    const confirmed = window.confirm("Clear your saved click history?");

    if (!confirmed) {
      return;
    }

    state.clickHistory = [];
    state.updatedAt = new Date().toISOString();
    persistState();
    render({ announcement: "Click history cleared." });
  });

  resetCounterButton.addEventListener("click", () => {
    if (state.total === 0) {
      return;
    }

    const confirmed = window.confirm(
      "Reset the counter back to zero? Your saved click history will stay on this device."
    );

    if (!confirmed) {
      return;
    }

    state.total = 0;
    state.today = 0;
    state.updatedAt = new Date().toISOString();

    persistState();
    render({ announcement: "Counter reset." });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && historyOpen) {
      closeHistory();
    } else if (event.key === "Escape" && settingsOpen) {
      closeSettings();
    }
  });

  refreshAppButton.addEventListener("click", () => {
    if (!pendingServiceWorker) {
      return;
    }

    refreshAppButton.disabled = true;
    refreshAppButton.textContent = "Refreshing...";
    pendingServiceWorker.postMessage({ type: "SKIP_WAITING" });
  });
}

function handleCounterPointerMove(event) {
  if (isOverlayOpen() || event.pointerType !== "mouse") {
    return;
  }

  applyCounterHoverPose(getCounterPointerState(event.clientX, event.clientY));
}

function getCounterPointerState(clientX, clientY) {
  const rect = counterButton.getBoundingClientRect();

  if (!rect.width || !rect.height) {
    return {
      x: 0,
      y: 0
    };
  }

  const normalizedX = clamp(((clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
  const normalizedY = clamp(((clientY - rect.top) / rect.height) * 2 - 1, -1, 1);

  return {
    x: normalizedX,
    y: normalizedY
  };
}

function applyCounterHoverPose(pointerState) {
  counterButton.style.setProperty("--cup-hover-shift-x", `${(pointerState.x * 8).toFixed(2)}px`);
  counterButton.style.setProperty("--cup-hover-shift-y", `${(pointerState.y * 6).toFixed(2)}px`);
  counterButton.style.setProperty("--cup-hover-rotate", `${(pointerState.x * 4.5).toFixed(2)}deg`);
}

function resetCounterHoverPose() {
  counterButton.style.setProperty("--cup-hover-shift-x", "0px");
  counterButton.style.setProperty("--cup-hover-shift-y", "0px");
  counterButton.style.setProperty("--cup-hover-rotate", "0deg");
}

function applyCounterPressPose(pointerState = { x: 0, y: 0 }) {
  const pressDirectionX = clamp(-pointerState.x, -1, 1);
  const pressOriginX = clamp(50 + pointerState.x * 28, 18, 82);
  const verticalBias = 1 - (pointerState.y + 1) / 2;
  const pressShiftY = 15 + verticalBias * 4;

  counterButton.style.setProperty("--cup-press-origin-x", `${pressOriginX.toFixed(2)}%`);
  counterButton.style.setProperty(
    "--cup-press-shift-x",
    `${(pressDirectionX * 16).toFixed(2)}px`
  );
  counterButton.style.setProperty("--cup-press-shift-y", `${pressShiftY.toFixed(2)}px`);
  counterButton.style.setProperty(
    "--cup-recoil-shift-x",
    `${(pressDirectionX * -7).toFixed(2)}px`
  );
  counterButton.style.setProperty("--cup-recoil-shift-y", "-10px");
  counterButton.style.setProperty(
    "--cup-press-rotate",
    `${(pressDirectionX * 5.8).toFixed(2)}deg`
  );
  counterButton.style.setProperty(
    "--cup-recoil-rotate",
    `${(pressDirectionX * -2.8).toFixed(2)}deg`
  );
}

function render(options = {}) {
  const label = buildAccessibilityLabel();
  const activeImage = getActiveImageSource();
  const historyCount = state.clickHistory.length;

  totalCount.textContent = state.total.toLocaleString();
  cupArt.src = activeImage;
  cupArt.alt = "";
  counterButton.setAttribute("aria-label", label);
  counterButton.setAttribute("title", buildTooltipLabel());
  document.title = state.total > 0 ? `Coffee Counter (${state.total})` : "Coffee Counter";

  body.classList.toggle("is-settings-open", settingsOpen && !historyOpen);
  body.classList.toggle("is-history-open", historyOpen);
  body.classList.toggle("has-update-banner", Boolean(pendingServiceWorker));
  counterScreen.setAttribute("aria-hidden", String(settingsOpen || historyOpen));
  updateBanner.setAttribute("aria-hidden", String(!pendingServiceWorker));
  settingsScreen.setAttribute("aria-hidden", String(!settingsOpen || historyOpen));
  historyScreen.setAttribute("aria-hidden", String(!historyOpen));

  document.documentElement.style.setProperty("--app-bg", state.settings.backgroundColor);
  themeColorMeta.setAttribute("content", state.settings.backgroundColor);
  backgroundColorInput.value = state.settings.backgroundColor;
  backgroundColorValue.textContent = state.settings.backgroundColor.toUpperCase();

  imageRadios.forEach((radio) => {
    radio.checked = radio.value === state.settings.imageKey;
  });

  historyCountValue.textContent = `${historyCount.toLocaleString()} saved`;
  historySummary.textContent = buildHistorySummary();
  renderHistoryPreview();
  renderHistoryScreen();
  exportHistoryButton.disabled = historyCount === 0;
  clearHistoryButton.disabled = historyCount === 0;

  if (options.announceTap) {
    screenReaderStatus.textContent = `Coffee counted. ${label}`;
  } else if (options.announcement) {
    screenReaderStatus.textContent = options.announcement;
  } else {
    screenReaderStatus.textContent = label;
  }

  if (options.animateCup) {
    counterButton.classList.remove("is-counting");
    counterScreen.classList.remove("is-counting");
    void counterButton.offsetWidth;
    counterButton.classList.add("is-counting");
    counterScreen.classList.add("is-counting");
  }

  if (options.vibrate && "vibrate" in navigator) {
    navigator.vibrate(12);
  }
}

function buildAccessibilityLabel() {
  if (state.total === 0) {
    return "Coffee counter. No coffees counted yet. Tap the coffee cup to add one.";
  }

  return `Coffee counter. ${state.total} ${pluralize(
    state.total
  )} total, ${state.today} ${pluralize(state.today)} today. Tap the coffee cup to add one more.`;
}

function buildTooltipLabel() {
  if (state.total === 0) {
    return "Tap to count your first coffee";
  }

  return `${state.total} ${pluralize(state.total)} total, ${state.today} today`;
}

function buildHistorySummary() {
  const historyCount = state.clickHistory.length;

  if (historyCount === 0) {
    return "No taps saved yet. Your coffee moments will start appearing here once you press the cup.";
  }

  const latestTimestamp = formatTimestamp(state.clickHistory[0]);

  if (historyCount === 1) {
    return `1 coffee saved so far. Latest tap: ${latestTimestamp}.`;
  }

  return `${historyCount.toLocaleString()} coffees saved. Latest tap: ${latestTimestamp}.`;
}

function renderHistoryPreview() {
  historyPreviewList.replaceChildren();

  const recentEntries = state.clickHistory.slice(0, HISTORY_PREVIEW_LIMIT);

  if (!recentEntries.length) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "history-preview-item history-preview-item-empty";
    emptyItem.textContent = "Your recent taps will show up here.";
    historyPreviewList.append(emptyItem);
    return;
  }

  for (const timestamp of recentEntries) {
    const item = document.createElement("li");
    item.className = "history-preview-item";

    const marker = document.createElement("span");
    marker.className = "history-preview-dot";
    marker.setAttribute("aria-hidden", "true");

    const copy = document.createElement("span");
    copy.className = "history-preview-copy";

    const time = document.createElement("span");
    time.className = "history-preview-time";
    time.textContent = formatTime(timestamp);

    const meta = document.createElement("span");
    meta.className = "history-preview-meta";
    meta.textContent = buildHistoryPreviewMeta(timestamp);

    copy.append(time, meta);
    item.append(marker, copy);
    historyPreviewList.append(item);
  }
}

function renderHistoryScreen() {
  const historyCount = state.clickHistory.length;
  const groups = getHistoryGroups();

  historyStatTotal.textContent = historyCount.toLocaleString();
  historyStatToday.textContent = state.today.toLocaleString();
  historyStatLatest.textContent = historyCount ? formatTimestamp(state.clickHistory[0]) : "Not yet";
  historyStatFirst.textContent = historyCount
    ? `First saved tap: ${formatTimestamp(state.clickHistory[historyCount - 1])}.`
    : "First saved tap: Not yet.";

  historyGroups.replaceChildren();
  historyEmptyState.hidden = historyCount > 0;
  historyGroups.hidden = historyCount === 0;

  if (!historyCount) {
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const group of groups) {
    fragment.append(createHistoryDayCard(group));
  }

  historyGroups.append(fragment);
}

function createHistoryDayCard(group) {
  const dayCard = document.createElement("section");
  dayCard.className = "history-day-card";

  const header = document.createElement("header");
  header.className = "history-day-header";

  const titleWrap = document.createElement("div");
  titleWrap.className = "history-day-copy";

  const title = document.createElement("h2");
  title.className = "history-day-title";
  title.textContent = buildHistoryDayHeading(group.dateKey);

  const subtitle = document.createElement("p");
  subtitle.className = "history-day-subtitle";
  subtitle.textContent = daySubtitleFormatter.format(group.date);

  titleWrap.append(title, subtitle);

  const countBadge = document.createElement("span");
  countBadge.className = "history-day-count";
  countBadge.textContent = `${group.entries.length} ${pluralize(group.entries.length)}`;

  header.append(titleWrap, countBadge);

  const list = document.createElement("ol");
  list.className = "history-day-list";

  for (const timestamp of group.entries) {
    list.append(createHistoryEntryItem(timestamp));
  }

  dayCard.append(header, list);
  return dayCard;
}

function createHistoryEntryItem(timestamp) {
  const item = document.createElement("li");
  item.className = "history-entry";

  const marker = document.createElement("span");
  marker.className = "history-entry-marker";
  marker.setAttribute("aria-hidden", "true");

  const copy = document.createElement("div");
  copy.className = "history-entry-copy";

  const time = document.createElement("p");
  time.className = "history-entry-time";
  time.textContent = formatTime(timestamp);

  const note = document.createElement("p");
  note.className = "history-entry-note";
  note.textContent = formatTimestamp(timestamp);

  copy.append(time, note);
  item.append(marker, copy);
  return item;
}

function getActiveImageSource() {
  return IMAGE_PRESETS[state.settings.imageKey] || IMAGE_PRESETS.reference;
}

function openSettings() {
  settingsOpen = true;
  historyOpen = false;
  render({ announcement: "Settings opened." });
  closeSettingsButton.focus();
}

function closeSettings() {
  settingsOpen = false;
  historyOpen = false;
  render({ announcement: "Settings closed." });
  settingsButton.focus();
}

function openHistory() {
  settingsOpen = true;
  historyOpen = true;
  render({ announcement: "History opened." });
  closeHistoryButton.focus();
}

function closeHistory() {
  historyOpen = false;
  render({ announcement: "History closed." });
  openHistoryButton.focus();
}

function pluralize(amount) {
  return amount === 1 ? "coffee" : "coffees";
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function isOverlayOpen() {
  return settingsOpen || historyOpen;
}

function recordClickTimestamp(timestamp) {
  state.clickHistory.unshift(timestamp);

  if (state.clickHistory.length > MAX_HISTORY_ENTRIES) {
    state.clickHistory.length = MAX_HISTORY_ENTRIES;
  }
}

function normalizeTodayState() {
  const todayKey = getTodayKey();

  if (state.dateKey === todayKey) {
    return;
  }

  state.today = 0;
  state.dateKey = todayKey;
  persistState();
}

function getTodayKey() {
  return getDateKeyFromDate(new Date());
}

function getDateKeyFromDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getHistoryGroups() {
  const groups = [];

  for (const timestamp of state.clickHistory) {
    const parsed = new Date(timestamp);

    if (Number.isNaN(parsed.getTime())) {
      continue;
    }

    const dateKey = getDateKeyFromDate(parsed);
    const lastGroup = groups[groups.length - 1];

    if (!lastGroup || lastGroup.dateKey !== dateKey) {
      groups.push({
        dateKey,
        date: new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()),
        entries: [timestamp]
      });
      continue;
    }

    lastGroup.entries.push(timestamp);
  }

  return groups;
}

function buildHistoryPreviewMeta(timestamp) {
  const parsed = new Date(timestamp);

  if (Number.isNaN(parsed.getTime())) {
    return "Saved locally";
  }

  const dateKey = getDateKeyFromDate(parsed);
  const relativeLabel = buildHistoryDayHeading(dateKey);

  if (relativeLabel === dayTitleFormatter.format(parsed)) {
    return daySubtitleFormatter.format(parsed);
  }

  return `${relativeLabel}, ${daySubtitleFormatter.format(parsed)}`;
}

function buildHistoryDayHeading(dateKey) {
  const todayKey = getTodayKey();

  if (dateKey === todayKey) {
    return "Today";
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (dateKey === getDateKeyFromDate(yesterday)) {
    return "Yesterday";
  }

  const parsed = parseDateKey(dateKey);
  return dayTitleFormatter.format(parsed);
}

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map((part) => Number(part));
  return new Date(year, month - 1, day);
}

function formatTimestamp(timestamp) {
  const parsed = new Date(timestamp);

  if (Number.isNaN(parsed.getTime())) {
    return "Unknown date";
  }

  return timestampFormatter.format(parsed);
}

function formatTime(timestamp) {
  const parsed = new Date(timestamp);

  if (Number.isNaN(parsed.getTime())) {
    return "Unknown time";
  }

  return timeFormatter.format(parsed);
}

function loadState() {
  try {
    const raw = loadStoredValue();

    if (!raw) {
      return createDefaultState();
    }

    return normalizeState(JSON.parse(raw));
  } catch (error) {
    return createDefaultState();
  }
}

function loadStoredValue() {
  const currentValue = window.localStorage.getItem(STORAGE_KEY);

  if (currentValue) {
    return currentValue;
  }

  for (const key of LEGACY_STORAGE_KEYS) {
    const legacyValue = window.localStorage.getItem(key);

    if (legacyValue) {
      return legacyValue;
    }
  }

  return null;
}

function normalizeState(candidate) {
  const base = createDefaultState();
  const normalizedCandidate = candidate && typeof candidate === "object" ? candidate : {};
  const nextState = {
    ...base,
    ...normalizedCandidate,
    settings: {
      ...base.settings,
      ...(normalizedCandidate.settings || {})
    }
  };

  nextState.total = normalizeCount(nextState.total);
  nextState.today = normalizeCount(nextState.today);
  nextState.clickHistory = normalizeClickHistory(
    normalizedCandidate.clickHistory || normalizedCandidate.history
  );
  nextState.settings.backgroundColor = normalizeHexColor(nextState.settings.backgroundColor);

  if (
    !Object.prototype.hasOwnProperty.call(IMAGE_PRESETS, nextState.settings.imageKey)
  ) {
    nextState.settings.imageKey = "reference";
  }

  return nextState;
}

function persistState() {
  return saveState();
}

function saveState() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    return false;
  }

  return true;
}

function normalizeHexColor(value) {
  if (/^#[0-9a-f]{6}$/i.test(value)) {
    return value.toLowerCase();
  }

  if (/^#[0-9a-f]{3}$/i.test(value)) {
    const [, r, g, b] = value;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }

  return DEFAULT_BACKGROUND;
}

function normalizeCount(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.floor(value);
}

function normalizeClickHistory(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((entry) => {
      const parsed = new Date(entry);

      if (Number.isNaN(parsed.getTime())) {
        return null;
      }

      return parsed.toISOString();
    })
    .filter(Boolean)
    .slice(0, MAX_HISTORY_ENTRIES);
}

function exportHistoryAsCsv() {
  const rows = [
    ["index", "timestamp_iso", "local_time"],
    ...state.clickHistory.map((timestamp, index) => [
      String(index + 1),
      timestamp,
      formatTimestamp(timestamp)
    ])
  ];
  const csv = rows
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const objectUrl = window.URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");

  downloadLink.href = objectUrl;
  downloadLink.download = `coffee-counter-history-${getTodayKey()}.csv`;
  document.body.append(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  window.URL.revokeObjectURL(objectUrl);
}

async function playTapSound() {
  if (!tapSoundTemplate) {
    return;
  }

  const tapSound = tapSoundTemplate.cloneNode();

  try {
    tapSound.currentTime = 0;
    await tapSound.play();
  } catch (error) {
    return;
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  let hasReloadedForNewWorker = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hasReloadedForNewWorker) {
      return;
    }

    hasReloadedForNewWorker = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./service-worker.js", {
        updateViaCache: "none"
      })
      .then((registration) => {
        registration.update().catch(() => {
          return null;
        });

        if (registration.waiting) {
          queuePendingUpdate(registration.waiting);
        }

        registration.addEventListener("updatefound", () => {
          const installingWorker = registration.installing;

          if (!installingWorker) {
            return;
          }

          installingWorker.addEventListener("statechange", () => {
            if (
              installingWorker.state === "installed" &&
              registration.waiting &&
              navigator.serviceWorker.controller
            ) {
              queuePendingUpdate(registration.waiting);
            }
          });
        });
      })
      .catch(() => {
        return null;
      });
  });
}

function queuePendingUpdate(worker) {
  pendingServiceWorker = worker;
  refreshAppButton.disabled = false;
  refreshAppButton.textContent = "Refresh";
  render({ announcement: "A new version is available. Refresh when ready." });
}
