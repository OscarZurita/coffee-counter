const STORAGE_KEY = "coffee-counter-state-v1";

const counterButton = document.getElementById("counterButton");
const undoButton = document.getElementById("undoButton");
const resetButton = document.getElementById("resetButton");
const totalCount = document.getElementById("totalCount");
const todayCount = document.getElementById("todayCount");
const statusLine = document.getElementById("statusLine");
const lastSaved = document.getElementById("lastSaved");

const createDefaultState = () => ({
  total: 0,
  today: 0,
  dateKey: getTodayKey(),
  previous: null,
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

    state.previous = snapshotState();
    state.total += 1;
    state.today += 1;
    state.updatedAt = new Date().toISOString();

    saveState();
    render({ animateCount: true, vibrate: true });
  });

  undoButton.addEventListener("click", () => {
    if (!state.previous) {
      return;
    }

    state = {
      ...state,
      ...state.previous,
      previous: null,
      updatedAt: new Date().toISOString()
    };

    saveState();
    render();
  });

  resetButton.addEventListener("click", () => {
    if (state.total === 0 && state.today === 0) {
      return;
    }

    const confirmed = window.confirm(
      "Reset the coffee counter back to zero?"
    );

    if (!confirmed) {
      return;
    }

    state.previous = snapshotState();
    state.total = 0;
    state.today = 0;
    state.dateKey = getTodayKey();
    state.updatedAt = new Date().toISOString();

    saveState();
    render();
  });
}

function render(options = {}) {
  totalCount.textContent = state.total.toLocaleString();
  todayCount.textContent = `${state.today} ${state.today === 1 ? "cup" : "cups"}`;
  statusLine.textContent = buildStatusLine();
  lastSaved.textContent = formatSavedAt(state.updatedAt);
  undoButton.disabled = !state.previous;
  resetButton.disabled = state.total === 0 && state.today === 0;

  if (options.animateCount) {
    totalCount.classList.remove("bump");
    window.requestAnimationFrame(() => {
      totalCount.classList.add("bump");
    });
  }

  if (options.vibrate && "vibrate" in navigator) {
    navigator.vibrate(12);
  }
}

function buildStatusLine() {
  if (state.total === 0) {
    return "No coffees yet today.";
  }

  if (state.today === 0) {
    return `You are at ${state.total} ${pluralize(state.total)} overall.`;
  }

  if (state.today === 1) {
    return "One coffee today. Cozy start.";
  }

  return `${state.today} coffees today, ${state.total} in total.`;
}

function pluralize(amount) {
  return amount === 1 ? "coffee" : "coffees";
}

function snapshotState() {
  return {
    total: state.total,
    today: state.today,
    dateKey: state.dateKey
  };
}

function normalizeTodayState() {
  const todayKey = getTodayKey();

  if (state.dateKey === todayKey) {
    return;
  }

  state.today = 0;
  state.dateKey = todayKey;
  state.previous = null;
  saveState();
}

function getTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatSavedAt(value) {
  if (!value) {
    return "not saved yet";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "saved locally";
  }

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
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
