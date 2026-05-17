const STORAGE_KEY = "coffee-counter-state-v2";
const LEGACY_STORAGE_KEYS = ["coffee-counter-state-v1"];
const DEFAULT_BACKGROUND = "#f37d9b";
const GEOLOCATION_TIMEOUT_MS = 8000;
const GEOLOCATION_MAXIMUM_AGE_MS = 120000;
const LOCATION_COORDINATE_DECIMALS = 5;
const MAX_HISTORY_ENTRIES = 5000;
const HISTORY_PREVIEW_LIMIT = 4;
const VALID_LOCATION_STATUSES = new Set([
  "off",
  "pending",
  "saved",
  "denied",
  "unavailable",
  "unsupported"
]);
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
const locationTrackingInput = document.getElementById("locationTrackingInput");
const locationTrackingValue = document.getElementById("locationTrackingValue");
const locationTrackingStatus = document.getElementById("locationTrackingStatus");
const historyCountValue = document.getElementById("historyCountValue");
const historySummary = document.getElementById("historySummary");
const historyPreviewList = document.getElementById("historyPreviewList");
const historyGroups = document.getElementById("historyGroups");
const historyStatTotal = document.getElementById("historyStatTotal");
const historyStatToday = document.getElementById("historyStatToday");
const historyStatLocated = document.getElementById("historyStatLocated");
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
    imageKey: "reference",
    locationTrackingEnabled: false
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
let locationPermissionState = supportsGeolocation() ? "idle" : "unsupported";
let isRequestingLocationPermission = false;
let pendingServiceWorker = null;

if (tapSoundTemplate) {
  tapSoundTemplate.preload = "auto";
  tapSoundTemplate.load();
}

initializeLocationSupportState();
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
    const historyEntry = recordClickTimestamp(timestamp);

    persistState();
    render({ animateCup: true, announceTap: true, vibrate: true });

    if (historyEntry.locationStatus === "pending") {
      captureLocationForEntry(historyEntry.id);
    }

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

  locationTrackingInput.addEventListener("change", async () => {
    if (locationTrackingInput.checked) {
      await enableLocationTracking();
      return;
    }

    disableLocationTracking("Location tracking turned off.");
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
  locationTrackingInput.checked = state.settings.locationTrackingEnabled;
  locationTrackingInput.disabled = isRequestingLocationPermission || !supportsGeolocation();
  locationTrackingValue.textContent = buildLocationTrackingValueLabel();
  locationTrackingStatus.textContent = buildLocationTrackingStatusText();

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
  const locatedCount = countHistoryEntriesWithLocation();

  if (historyCount === 0) {
    return "No taps saved yet. Your coffee moments will start appearing here once you press the cup.";
  }

  const latestTimestamp = formatTimestamp(state.clickHistory[0].timestamp);

  if (historyCount === 1) {
    if (locatedCount === 1) {
      return `1 coffee saved so far, with location. Latest tap: ${latestTimestamp}.`;
    }

    return `1 coffee saved so far. Latest tap: ${latestTimestamp}.`;
  }

  if (locatedCount > 0) {
    return `${historyCount.toLocaleString()} coffees saved, ${locatedCount.toLocaleString()} with location. Latest tap: ${latestTimestamp}.`;
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

  for (const entry of recentEntries) {
    const item = document.createElement("li");
    item.className = "history-preview-item";

    const marker = document.createElement("span");
    marker.className = "history-preview-dot";
    marker.setAttribute("aria-hidden", "true");

    const copy = document.createElement("span");
    copy.className = "history-preview-copy";

    const time = document.createElement("span");
    time.className = "history-preview-time";
    time.textContent = formatTime(entry.timestamp);

    const meta = document.createElement("span");
    meta.className = "history-preview-meta";
    meta.textContent = buildHistoryPreviewMeta(entry);

    copy.append(time, meta);
    item.append(marker, copy);
    historyPreviewList.append(item);
  }
}

function renderHistoryScreen() {
  const historyCount = state.clickHistory.length;
  const locatedCount = countHistoryEntriesWithLocation();
  const groups = getHistoryGroups();

  historyStatTotal.textContent = historyCount.toLocaleString();
  historyStatToday.textContent = state.today.toLocaleString();
  historyStatLocated.textContent = locatedCount.toLocaleString();
  historyStatLatest.textContent = historyCount
    ? formatTimestamp(state.clickHistory[0].timestamp)
    : "Not yet";
  historyStatFirst.textContent = historyCount
    ? `First saved tap: ${formatTimestamp(state.clickHistory[historyCount - 1].timestamp)}.`
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

  for (const entry of group.entries) {
    list.append(createHistoryEntryItem(entry));
  }

  dayCard.append(header, list);
  return dayCard;
}

function createHistoryEntryItem(entry) {
  const item = document.createElement("li");
  item.className = "history-entry";

  const marker = document.createElement("span");
  marker.className = "history-entry-marker";
  marker.setAttribute("aria-hidden", "true");

  const copy = document.createElement("div");
  copy.className = "history-entry-copy";

  const time = document.createElement("p");
  time.className = "history-entry-time";
  time.textContent = formatTime(entry.timestamp);

  const note = document.createElement("p");
  note.className = "history-entry-note";
  note.textContent = formatTimestamp(entry.timestamp);

  copy.append(time, note);

  const locationLine = buildHistoryEntryLocationLine(entry);

  if (locationLine) {
    const location = document.createElement("p");
    location.className = `history-entry-location history-entry-location-${entry.locationStatus}`;
    location.textContent = locationLine;
    copy.append(location);
  }

  item.append(marker, copy);
  return item;
}

function buildLocationTrackingValueLabel() {
  if (!supportsGeolocation()) {
    return "N/A";
  }

  if (isRequestingLocationPermission) {
    return "Wait";
  }

  return state.settings.locationTrackingEnabled ? "On" : "Off";
}

function buildLocationTrackingStatusText() {
  if (!supportsGeolocation()) {
    return "This browser cannot access phone GPS, so taps can only save the date and time.";
  }

  if (isRequestingLocationPermission) {
    return "Allow location access in the browser prompt to attach a place to future taps.";
  }

  if (state.settings.locationTrackingEnabled) {
    if (locationPermissionState === "denied") {
      return "Location permission is blocked right now. Future taps will keep only time until you allow it again.";
    }

    if (locationPermissionState === "granted") {
      return "On. Future taps will also save a GPS point on this device only.";
    }

    return "On. The app will ask your phone for a GPS point each time you tap the cup.";
  }

  if (locationPermissionState === "denied") {
    return "Permission was denied. Taps are still saved, but without a place.";
  }

  return "Off. Taps only save the date and time.";
}

function countHistoryEntriesWithLocation() {
  return state.clickHistory.filter((entry) => entry.locationStatus === "saved" && entry.location)
    .length;
}

function buildHistoryEntryLocationLine(entry) {
  if (entry.locationStatus === "saved" && entry.location) {
    const accuracyLabel =
      typeof entry.location.accuracy === "number"
        ? ` +/- ${Math.round(entry.location.accuracy)} m`
        : "";

    return `${formatCoordinates(entry.location)}${accuracyLabel}`;
  }

  if (entry.locationStatus === "pending") {
    return "Saving location...";
  }

  if (entry.locationStatus === "denied") {
    return "Location permission denied for this tap.";
  }

  if (entry.locationStatus === "unsupported") {
    return "Location is not supported on this device.";
  }

  if (entry.locationStatus === "unavailable") {
    return "Location was unavailable for this tap.";
  }

  return "";
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

function supportsGeolocation() {
  return typeof navigator !== "undefined" && "geolocation" in navigator;
}

function initializeLocationSupportState() {
  if (!supportsGeolocation()) {
    locationPermissionState = "unsupported";
    state.settings.locationTrackingEnabled = false;
    persistState();
    return;
  }

  if (state.settings.locationTrackingEnabled) {
    locationPermissionState = "granted";
  }
}

async function enableLocationTracking() {
  state.settings.locationTrackingEnabled = true;
  isRequestingLocationPermission = true;
  locationPermissionState = supportsGeolocation() ? "pending" : "unsupported";
  persistState();
  render({
    announcement:
      "Location tracking enabled. Allow the GPS prompt to attach places to future taps."
  });

  if (!supportsGeolocation()) {
    locationPermissionState = "unsupported";
    disableLocationTracking(
      "This browser cannot access location, so taps will keep only the date and time."
    );
    return;
  }

  try {
    await requestCurrentPosition();
    locationPermissionState = "granted";
    isRequestingLocationPermission = false;
    render({ announcement: "Location access allowed. Future taps will also save a place." });
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      locationPermissionState = "denied";
      disableLocationTracking(
        "Location permission was denied. Taps will keep only the date and time."
      );
      return;
    }

    locationPermissionState = "unavailable";
    isRequestingLocationPermission = false;
    render({
      announcement:
        "Location tracking is on, but the app could not confirm your position right now."
    });
  }
}

function disableLocationTracking(announcement) {
  state.settings.locationTrackingEnabled = false;
  isRequestingLocationPermission = false;
  persistState();
  render({ announcement });
}

function requestCurrentPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: GEOLOCATION_TIMEOUT_MS,
      maximumAge: GEOLOCATION_MAXIMUM_AGE_MS
    });
  });
}

async function captureLocationForEntry(entryId) {
  if (!supportsGeolocation()) {
    updateHistoryEntry(entryId, { locationStatus: "unsupported" });
    render();
    return;
  }

  try {
    const position = await requestCurrentPosition();

    updateHistoryEntry(entryId, {
      location: normalizeStoredLocation(position.coords),
      locationStatus: "saved"
    });
    locationPermissionState = "granted";
    render();
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      locationPermissionState = "denied";
      updateHistoryEntry(entryId, { locationStatus: "denied" });
      state.settings.locationTrackingEnabled = false;
      persistState();
      render({
        announcement:
          "Location permission was denied. This coffee stayed saved, but without a place."
      });
      return;
    }

    updateHistoryEntry(entryId, { locationStatus: "unavailable" });
    locationPermissionState = "unavailable";
    render({ announcement: "Coffee saved, but its location was unavailable." });
  }
}

function updateHistoryEntry(entryId, patch) {
  const entryIndex = state.clickHistory.findIndex((entry) => entry.id === entryId);

  if (entryIndex === -1) {
    return;
  }

  const currentEntry = state.clickHistory[entryIndex];
  const nextEntry = {
    ...currentEntry,
    ...patch
  };

  if (patch.location !== undefined) {
    nextEntry.location = normalizeStoredLocation(patch.location);
  }

  if (patch.locationStatus !== undefined) {
    nextEntry.locationStatus = normalizeLocationStatus(
      patch.locationStatus,
      nextEntry.location
    );
  }

  state.clickHistory[entryIndex] = nextEntry;
  state.updatedAt = new Date().toISOString();
  persistState();
}

function isPermissionDeniedError(error) {
  return Boolean(error && error.code === 1);
}

function recordClickTimestamp(timestamp) {
  const nextEntry = createHistoryEntry(timestamp, {
    locationStatus: state.settings.locationTrackingEnabled ? "pending" : "off"
  });

  state.clickHistory.unshift(nextEntry);

  if (state.clickHistory.length > MAX_HISTORY_ENTRIES) {
    state.clickHistory.length = MAX_HISTORY_ENTRIES;
  }

  return nextEntry;
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

  for (const entry of state.clickHistory) {
    const parsed = new Date(entry.timestamp);

    if (Number.isNaN(parsed.getTime())) {
      continue;
    }

    const dateKey = getDateKeyFromDate(parsed);
    const lastGroup = groups[groups.length - 1];

    if (!lastGroup || lastGroup.dateKey !== dateKey) {
      groups.push({
        dateKey,
        date: new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()),
        entries: [entry]
      });
      continue;
    }

    lastGroup.entries.push(entry);
  }

  return groups;
}

function buildHistoryPreviewMeta(entry) {
  const parsed = new Date(entry.timestamp);

  if (Number.isNaN(parsed.getTime())) {
    return "Saved locally";
  }

  const dateKey = getDateKeyFromDate(parsed);
  const relativeLabel = buildHistoryDayHeading(dateKey);

  const metaParts = [
    relativeLabel === dayTitleFormatter.format(parsed)
      ? daySubtitleFormatter.format(parsed)
      : `${relativeLabel}, ${daySubtitleFormatter.format(parsed)}`
  ];
  const locationMeta = buildHistoryPreviewLocationMeta(entry);

  if (locationMeta) {
    metaParts.push(locationMeta);
  }

  return metaParts.join(" • ");
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

function buildHistoryPreviewLocationMeta(entry) {
  if (entry.locationStatus === "saved" && entry.location) {
    return "Location saved";
  }

  if (entry.locationStatus === "pending") {
    return "Saving location";
  }

  if (entry.locationStatus === "denied" || entry.locationStatus === "unavailable") {
    return "No location";
  }

  return "";
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

function formatCoordinates(location) {
  return `${location.latitude.toFixed(LOCATION_COORDINATE_DECIMALS)}, ${location.longitude.toFixed(LOCATION_COORDINATE_DECIMALS)}`;
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
  nextState.settings.locationTrackingEnabled = Boolean(
    nextState.settings.locationTrackingEnabled
  );

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

function normalizeHistoryEntry(entry) {
  if (typeof entry === "string") {
    const parsed = new Date(entry);

    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return createHistoryEntry(parsed.toISOString(), {
      locationStatus: "off"
    });
  }

  if (!entry || typeof entry !== "object") {
    return null;
  }

  const parsed = new Date(entry.timestamp);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return createHistoryEntry(parsed.toISOString(), {
    id: entry.id,
    location: entry.location,
    locationStatus: entry.locationStatus
  });
}

function createHistoryEntry(timestamp, options = {}) {
  const normalizedLocation = normalizeStoredLocation(options.location);

  return {
    id: typeof options.id === "string" && options.id ? options.id : createHistoryEntryId(),
    timestamp,
    location: normalizedLocation,
    locationStatus: normalizeLocationStatus(options.locationStatus, normalizedLocation)
  };
}

function createHistoryEntryId() {
  if (
    typeof crypto !== "undefined" &&
    crypto &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `tap-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function normalizeLocationStatus(status, location) {
  if (location) {
    return "saved";
  }

  if (VALID_LOCATION_STATUSES.has(status)) {
    return status;
  }

  return "off";
}

function normalizeStoredLocation(location) {
  if (!location || typeof location !== "object") {
    return null;
  }

  const latitude = Number(location.latitude ?? location.lat);
  const longitude = Number(location.longitude ?? location.lng ?? location.lon);
  const accuracy =
    location.accuracy === null || location.accuracy === undefined
      ? null
      : Number(location.accuracy);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }

  return {
    latitude: roundNumber(latitude, LOCATION_COORDINATE_DECIMALS),
    longitude: roundNumber(longitude, LOCATION_COORDINATE_DECIMALS),
    accuracy:
      Number.isFinite(accuracy) && accuracy >= 0 ? roundNumber(accuracy, 1) : null
  };
}

function roundNumber(value, decimals) {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}

function normalizeClickHistory(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((entry) => normalizeHistoryEntry(entry))
    .filter(Boolean)
    .slice(0, MAX_HISTORY_ENTRIES);
}

function exportHistoryAsCsv() {
  const rows = [
    [
      "index",
      "entry_id",
      "timestamp_iso",
      "local_time",
      "location_status",
      "latitude",
      "longitude",
      "accuracy_m"
    ],
    ...state.clickHistory.map((entry, index) => [
      String(index + 1),
      entry.id,
      entry.timestamp,
      formatTimestamp(entry.timestamp),
      entry.locationStatus,
      entry.location ? entry.location.latitude : "",
      entry.location ? entry.location.longitude : "",
      entry.location && typeof entry.location.accuracy === "number"
        ? entry.location.accuracy
        : ""
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
