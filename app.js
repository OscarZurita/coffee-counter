const STORAGE_KEY = "coffee-counter-state-v2";
const LEGACY_STORAGE_KEYS = ["coffee-counter-state-v1"];
const DEFAULT_BACKGROUND = "#f37d9b";
const IMAGE_PRESETS = {
  reference: "assets/my_coffee_cup1.png",
  minimal: "assets/coffee-cup.svg"
};
const TAP_SOUND_SRC = "./sounds/749860__etheraudio__satisfying-click.wav";

const body = document.body;
const themeColorMeta = document.querySelector('meta[name="theme-color"]');
const counterScreen = document.getElementById("counterScreen");
const settingsScreen = document.getElementById("settingsScreen");
const settingsButton = document.getElementById("settingsButton");
const closeSettingsButton = document.getElementById("closeSettingsButton");
const counterButton = document.getElementById("counterButton");
const cupArt = document.getElementById("cupArt");
const totalCount = document.getElementById("totalCount");
const plusOne = document.getElementById("plusOne");
const screenReaderStatus = document.getElementById("screenReaderStatus");
const backgroundColorInput = document.getElementById("backgroundColorInput");
const backgroundColorValue = document.getElementById("backgroundColorValue");
const uploadButton = document.getElementById("uploadButton");
const customImageInput = document.getElementById("customImageInput");
const customImageCard = document.getElementById("customImageCard");
const customImageRadio = document.getElementById("customImageRadio");
const customPreview = document.getElementById("customPreview");
const customImageLabel = document.getElementById("customImageLabel");
const resetCounterButton = document.getElementById("resetCounterButton");
const imageRadios = Array.from(document.querySelectorAll('input[name="cupImage"]'));

const createDefaultState = () => ({
  total: 0,
  today: 0,
  dateKey: getTodayKey(),
  updatedAt: null,
  settings: {
    backgroundColor: DEFAULT_BACKGROUND,
    imageKey: "reference",
    customImageData: ""
  }
});

let state = loadState();
const tapSoundTemplate = typeof Audio === "function" ? new Audio(TAP_SOUND_SRC) : null;
let settingsOpen = false;

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
    if (settingsOpen || event.button > 0) {
      return;
    }

    const pointerState = getCounterPointerState(event.clientX, event.clientY);

    if (event.pointerType === "mouse") {
      applyCounterHoverPose(pointerState);
    }

    applyCounterPressPose(pointerState);
  });

  counterButton.addEventListener("click", async (event) => {
    if (settingsOpen) {
      return;
    }

    if (event.detail > 0) {
      applyCounterPressPose(getCounterPointerState(event.clientX, event.clientY));
    } else {
      applyCounterPressPose();
      resetCounterHoverPose();
    }

    normalizeTodayState();
    state.total += 1;
    state.today += 1;
    state.updatedAt = new Date().toISOString();

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

      if (radio.value === "custom" && !state.settings.customImageData) {
        customImageInput.click();
        return;
      }

      state.settings.imageKey = radio.value;
      persistState();
      render({ announcement: "Image updated." });
    });
  });

  customImageInput.addEventListener("change", async () => {
    const [file] = customImageInput.files || [];

    if (!file) {
      return;
    }

    const previousSettings = {
      ...state.settings
    };

    try {
      const fileData = await readFileAsDataURL(file);

      state.settings.customImageData = fileData;
      state.settings.imageKey = "custom";

      if (!persistState()) {
        state.settings = previousSettings;
        persistState();
        window.alert("That image was too large to save locally. Try a smaller file.");
        render({ announcement: "Custom image could not be saved." });
        return;
      }

      render({ announcement: "Custom image updated." });
    } catch (error) {
      render({ announcement: "Unable to load that image." });
    } finally {
      customImageInput.value = "";
    }
  });

  customImageCard.addEventListener("click", (event) => {
    if (!customImageRadio.disabled) {
      return;
    }

    event.preventDefault();
    customImageInput.click();
  });

  resetCounterButton.addEventListener("click", () => {
    if (state.total === 0) {
      return;
    }

    const confirmed = window.confirm("Reset the counter back to zero?");

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
    if (event.key === "Escape" && settingsOpen) {
      closeSettings();
    }
  });
}

function handleCounterPointerMove(event) {
  if (settingsOpen || event.pointerType !== "mouse") {
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
  const hasCustomImage = Boolean(state.settings.customImageData);

  totalCount.textContent = state.total.toLocaleString();
  cupArt.src = activeImage;
  cupArt.alt = "";
  counterButton.setAttribute("aria-label", label);
  counterButton.setAttribute("title", buildTooltipLabel());
  document.title = state.total > 0 ? `Coffee Counter (${state.total})` : "Coffee Counter";

  body.classList.toggle("is-settings-open", settingsOpen);
  counterScreen.setAttribute("aria-hidden", String(settingsOpen));
  settingsScreen.setAttribute("aria-hidden", String(!settingsOpen));

  document.documentElement.style.setProperty("--app-bg", state.settings.backgroundColor);
  themeColorMeta.setAttribute("content", state.settings.backgroundColor);
  backgroundColorInput.value = state.settings.backgroundColor;
  backgroundColorValue.textContent = state.settings.backgroundColor.toUpperCase();

  customPreview.src = hasCustomImage ? state.settings.customImageData : IMAGE_PRESETS.reference;
  customImageLabel.textContent = hasCustomImage ? "Custom" : "Upload first";
  uploadButton.textContent = hasCustomImage ? "Replace" : "Upload";
  customImageRadio.disabled = !hasCustomImage;
  customImageCard.classList.toggle("is-disabled", !hasCustomImage);

  imageRadios.forEach((radio) => {
    radio.checked = radio.value === state.settings.imageKey;
  });

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

function getActiveImageSource() {
  if (state.settings.imageKey === "custom" && state.settings.customImageData) {
    return state.settings.customImageData;
  }

  return IMAGE_PRESETS[state.settings.imageKey] || IMAGE_PRESETS.reference;
}

function openSettings() {
  settingsOpen = true;
  render({ announcement: "Settings opened." });
  closeSettingsButton.focus();
}

function closeSettings() {
  settingsOpen = false;
  render({ announcement: "Settings closed." });
  settingsButton.focus();
}

function pluralize(amount) {
  return amount === 1 ? "coffee" : "coffees";
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
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
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
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
  const nextState = {
    ...base,
    ...candidate,
    settings: {
      ...base.settings,
      ...(candidate.settings || {})
    }
  };

  nextState.settings.backgroundColor = normalizeHexColor(nextState.settings.backgroundColor);

  if (
    nextState.settings.imageKey !== "custom" &&
    !Object.prototype.hasOwnProperty.call(IMAGE_PRESETS, nextState.settings.imageKey)
  ) {
    nextState.settings.imageKey = "reference";
  }

  if (nextState.settings.imageKey === "custom" && !nextState.settings.customImageData) {
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

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => {
      resolve(String(reader.result));
    });

    reader.addEventListener("error", () => {
      reject(reader.error);
    });

    reader.readAsDataURL(file);
  });
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

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      return null;
    });
  });
}
