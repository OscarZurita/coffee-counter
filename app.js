const STORAGE_KEY = "coffee-counter-state-v1";

const counterButton = document.getElementById("counterButton");
const screenReaderStatus = document.getElementById("screenReaderStatus");

const createDefaultState = () => ({
  total: 0,
  today: 0,
  dateKey: getTodayKey(),
  updatedAt: null
});

let state = loadState();

normalizeTodayState();
render();
attachEvents();
registerServiceWorker();

function attachEvents() {
  counterButton.addEventListener("click", () => {
    normalizeTodayState();

    state.total += 1;
    state.today += 1;
    state.updatedAt = new Date().toISOString();

    saveState();
    render({ animateCup: true, announceTap: true, vibrate: true });
  });
}

function render(options = {}) {
  const label = buildAccessibilityLabel();

  counterButton.setAttribute("aria-label", label);
  counterButton.setAttribute("title", buildTooltipLabel());
  document.title = state.total > 0 ? `Coffee Counter (${state.total})` : "Coffee Counter";

  if (options.announceTap) {
    screenReaderStatus.textContent = `Coffee counted. ${label}`;
  } else {
    screenReaderStatus.textContent = label;
  }

  if (options.animateCup) {
    counterButton.classList.remove("is-counting");
    window.requestAnimationFrame(() => {
      counterButton.classList.add("is-counting");
    });
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

function pluralize(amount) {
  return amount === 1 ? "coffee" : "coffees";
}

function normalizeTodayState() {
  const todayKey = getTodayKey();

  if (state.dateKey === todayKey) {
    return;
  }

  state.today = 0;
  state.dateKey = todayKey;
  saveState();
}

function getTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return createDefaultState();
    }

    const parsed = JSON.parse(raw);

    return {
      ...createDefaultState(),
      ...parsed
    };
  } catch (error) {
    return createDefaultState();
  }
}

function saveState() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    return false;
  }

  return true;
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      return null;
    });
  });
}
