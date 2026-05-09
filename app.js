const STORAGE_KEY = "coffee-counter-state-v1";

const counterButton = document.getElementById("counterButton");
const totalCount = document.getElementById("totalCount");
const plusOne = document.getElementById("plusOne");
const screenReaderStatus = document.getElementById("screenReaderStatus");

const AudioContextClass = window.AudioContext || window.webkitAudioContext;

const createDefaultState = () => ({
  total: 0,
  today: 0,
  dateKey: getTodayKey(),
  updatedAt: null
});

let state = loadState();
let audioContext = null;

normalizeTodayState();
render();
attachEvents();
registerServiceWorker();

function attachEvents() {
  counterButton.addEventListener("click", async () => {
    normalizeTodayState();

    state.total += 1;
    state.today += 1;
    state.updatedAt = new Date().toISOString();

    saveState();
    render({ animateCup: true, announceTap: true, vibrate: true });
    await playTapSound();
  });

  plusOne.addEventListener("animationend", () => {
    plusOne.textContent = "+1";
  });
}

function render(options = {}) {
  const label = buildAccessibilityLabel();

  totalCount.textContent = state.total.toLocaleString();
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
    void counterButton.offsetWidth;
    counterButton.classList.add("is-counting");
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

async function playTapSound() {
  if (!AudioContextClass) {
    return;
  }

  if (!audioContext) {
    audioContext = new AudioContextClass();
  }

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  const now = audioContext.currentTime;
  const masterGain = audioContext.createGain();
  masterGain.gain.setValueAtTime(0.0001, now);
  masterGain.gain.exponentialRampToValueAtTime(0.17, now + 0.012);
  masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
  masterGain.connect(audioContext.destination);

  const bodyTone = audioContext.createOscillator();
  bodyTone.type = "triangle";
  bodyTone.frequency.setValueAtTime(920, now);
  bodyTone.frequency.exponentialRampToValueAtTime(640, now + 0.2);
  bodyTone.connect(masterGain);

  const sparkleTone = audioContext.createOscillator();
  const sparkleGain = audioContext.createGain();
  sparkleTone.type = "sine";
  sparkleTone.frequency.setValueAtTime(1480, now);
  sparkleTone.frequency.exponentialRampToValueAtTime(1100, now + 0.12);
  sparkleGain.gain.setValueAtTime(0.0001, now);
  sparkleGain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
  sparkleGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
  sparkleTone.connect(sparkleGain);
  sparkleGain.connect(audioContext.destination);

  const thumpTone = audioContext.createOscillator();
  const thumpGain = audioContext.createGain();
  thumpTone.type = "sine";
  thumpTone.frequency.setValueAtTime(220, now);
  thumpTone.frequency.exponentialRampToValueAtTime(140, now + 0.08);
  thumpGain.gain.setValueAtTime(0.0001, now);
  thumpGain.gain.exponentialRampToValueAtTime(0.03, now + 0.01);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
  thumpTone.connect(thumpGain);
  thumpGain.connect(audioContext.destination);

  bodyTone.start(now);
  sparkleTone.start(now);
  thumpTone.start(now);

  bodyTone.stop(now + 0.26);
  sparkleTone.stop(now + 0.13);
  thumpTone.stop(now + 0.11);
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
