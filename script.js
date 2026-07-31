/* =====================================================
   Little Green Farm — game logic
   Plain JS, no build step. Open index.html to play.
===================================================== */

const SAVE_KEY = "littleGreenFarm.save.v1";

/* ---- Tunable game numbers, all in one place ---- */
const CONFIG = {
  startingCoins: 40,
  startingFeed: 8,
  startingPlots: 3,

  cow: {
    baseCost: 60,
    costStep: 25,
    hungerDecayPerSec: 1.6,
    fillPerSec: 2.2,
    emoji: "🐄",
    name: "Cow",
    product: "milk",
  },
  chicken: {
    baseCost: 30,
    costStep: 15,
    hungerDecayPerSec: 2.4,
    fillPerSec: 4,
    emoji: "🐔",
    name: "Chicken",
    product: "eggs",
  },

  feedPackCost: 10,
  feedPackAmount: 5,

  expandBaseCost: 40,
  expandCostStep: 30,

  creameryCost: 150,
  creameryMilkCost: 5,
  creameryCheeseYield: 5,
  creameryTimeSec: 18,

  prices: { milk: 4, eggs: 3, cheese: 15 },

  tickMs: 1000,
  autosaveMs: 4000,
};

/* ---- State ---- */
let state = null;
let nextPlotId = 1;

function freshState() {
  nextPlotId = 1;
  const plots = [];
  for (let i = 0; i < CONFIG.startingPlots; i++) {
    plots.push({ id: nextPlotId++, animal: null });
  }
  return {
    coins: CONFIG.startingCoins,
    feed: CONFIG.startingFeed,
    milk: 0,
    eggs: 0,
    cheese: 0,
    cowsOwned: 0,
    chickensOwned: 0,
    plotsBought: 0,
    plots,
    creamery: { built: false, converting: false, progress: 0 },
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return freshState();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.plots)) return freshState();
    nextPlotId = Math.max(1, ...parsed.plots.map((p) => p.id + 1));
    return parsed;
  } catch (e) {
    console.warn("Could not read save, starting fresh.", e);
    return freshState();
  }
}

function saveState() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Could not save game.", e);
  }
}

/* ---- Costs that scale with how much you already own ---- */
function cowCost() {
  return CONFIG.cow.baseCost + state.cowsOwned * CONFIG.cow.costStep;
}
function chickenCost() {
  return CONFIG.chicken.baseCost + state.chickensOwned * CONFIG.chicken.costStep;
}
function expandCost() {
  return CONFIG.expandBaseCost + state.plotsBought * CONFIG.expandCostStep;
}

/* ---- Toast ---- */
let toastTimer = null;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 1800);
}

/* ---- Modal ---- */
const backdrop = document.getElementById("modalBackdrop");
const modal = document.getElementById("modal");
function openModal(html) {
  modal.innerHTML = html;
  backdrop.hidden = false;
}
function closeModal() {
  backdrop.hidden = true;
  modal.innerHTML = "";
}
backdrop.addEventListener("click", (e) => {
  if (e.target === backdrop) closeModal();
});

/* ---- Plot interactions ---- */
function findPlot(id) {
  return state.plots.find((p) => p.id === id);
}

function openBuildModal(plotId) {
  const cCost = cowCost();
  const hCost = chickenCost();
  openModal(`
    <h3>What will you build here?</h3>
    <p class="modal-hint">Each animal needs feed to keep producing, so make sure you've got some in stock.</p>
    <div class="modal-row">
      <span>🐄 Cow pen — makes milk</span>
      <button class="btn btn-buy" id="mBuildCow">${cCost} 🪙</button>
    </div>
    <div class="modal-row">
      <span>🐔 Chicken coop — makes eggs, faster but smaller</span>
      <button class="btn btn-buy" id="mBuildChicken">${hCost} 🪙</button>
    </div>
    <button class="btn modal-close" id="mClose">Cancel</button>
  `);
  document.getElementById("mClose").onclick = closeModal;
  document.getElementById("mBuildCow").onclick = () => buildAnimal(plotId, "cow");
  document.getElementById("mBuildChicken").onclick = () => buildAnimal(plotId, "chicken");
}

function buildAnimal(plotId, type) {
  const cost = type === "cow" ? cowCost() : chickenCost();
  if (state.coins < cost) {
    toast("Not enough coins for that yet.");
    return;
  }
  const plot = findPlot(plotId);
  if (!plot || plot.animal) return;
  state.coins -= cost;
  plot.animal = { type, hunger: 100, product: 0 };
  if (type === "cow") state.cowsOwned++;
  else state.chickensOwned++;
  toast(`${CONFIG[type].emoji} New ${CONFIG[type].name.toLowerCase()} settled in!`);
  closeModal();
  renderAll();
}

function openManageModal(plotId) {
  const plot = findPlot(plotId);
  if (!plot || !plot.animal) return;
  const def = CONFIG[plot.animal.type];
  const hunger = Math.round(plot.animal.hunger);
  const product = Math.round(plot.animal.product);
  const productLabel = def.product === "milk" ? "Trough" : "Nest";

  openModal(`
    <h3>${def.emoji} ${def.name}</h3>
    <p class="modal-hint">Hunger: ${hunger}/100 ${hunger === 0 ? "— stopped producing, feed me!" : ""}</p>
    <div class="progress-bar"><div class="progress-fill" style="width:${hunger}%; background:${hunger === 0 ? "#c1443a" : "#e6a93c"}"></div></div>

    <p class="modal-hint" style="margin-top:12px">${productLabel}: ${product}/100</p>
    <div class="progress-bar"><div class="progress-fill" style="width:${product}%"></div></div>

    <div class="modal-row" style="margin-top:16px">
      <button class="btn btn-buy" id="mFeed" ${state.feed <= 0 || hunger >= 100 ? "disabled" : ""}>
        🌽 Feed (uses 1 feed)
      </button>
      <button class="btn btn-sell" id="mCollect" ${product < 100 ? "disabled" : ""}>
        ${def.product === "milk" ? "🥛 Collect milk" : "🥚 Collect eggs"}
      </button>
    </div>
    <button class="btn modal-close" id="mClose">Close</button>
  `);
  document.getElementById("mClose").onclick = closeModal;
  document.getElementById("mFeed").onclick = () => feedAnimal(plotId);
  document.getElementById("mCollect").onclick = () => collectAnimal(plotId);
}

function feedAnimal(plotId) {
  const plot = findPlot(plotId);
  if (!plot || !plot.animal || state.feed <= 0) return;
  state.feed -= 1;
  plot.animal.hunger = 100;
  toast("Fed! Back to work.");
  openManageModal(plotId);
  renderAll();
}

function collectAnimal(plotId) {
  const plot = findPlot(plotId);
  if (!plot || !plot.animal || plot.animal.product < 100) return;
  const def = CONFIG[plot.animal.type];
  if (def.product === "milk") state.milk += 5;
  else state.eggs += 5;
  plot.animal.product = 0;
  toast(def.product === "milk" ? "🥛 Collected 5 milk!" : "🥚 Collected 5 eggs!");
  openManageModal(plotId);
  renderAll();
}

/* ---- Expand land ---- */
document.getElementById("expandBtn").addEventListener("click", () => {
  const cost = expandCost();
  if (state.coins < cost) {
    toast("Not enough coins to clear more land.");
    return;
  }
  state.coins -= cost;
  state.plotsBought++;
  state.plots.push({ id: nextPlotId++, animal: null });
  toast("🪓 New land cleared — go build on it!");
  renderAll();
});

/* ---- Shop: feed ---- */
document.getElementById("buyFeedBtn").addEventListener("click", () => {
  if (state.coins < CONFIG.feedPackCost) {
    toast("Not enough coins for feed.");
    return;
  }
  state.coins -= CONFIG.feedPackCost;
  state.feed += CONFIG.feedPackAmount;
  toast(`🌽 Bought ${CONFIG.feedPackAmount} feed.`);
  renderAll();
});

/* ---- Creamery ---- */
document.getElementById("buildCreameryBtn").addEventListener("click", () => {
  if (state.coins < CONFIG.creameryCost) {
    toast("Not enough coins to build the Creamery yet.");
    return;
  }
  state.coins -= CONFIG.creameryCost;
  state.creamery.built = true;
  toast("🧀 Creamery built! Now you can age milk into cheese.");
  renderAll();
});

document.getElementById("convertBtn").addEventListener("click", () => {
  if (state.creamery.converting) {
    toast("Already aging a batch — check back soon.");
    return;
  }
  if (state.milk < CONFIG.creameryMilkCost) {
    toast(`Need ${CONFIG.creameryMilkCost} milk to start a batch.`);
    return;
  }
  state.milk -= CONFIG.creameryMilkCost;
  state.creamery.converting = true;
  state.creamery.progress = 0;
  toast("🧀 Batch started — it'll be ready soon.");
  renderAll();
});

/* ---- Market ---- */
function sellAll(resourceKey, priceKey, label) {
  const amount = state[resourceKey];
  if (amount <= 0) {
    toast(`No ${label} to sell yet.`);
    return;
  }
  const earned = amount * CONFIG.prices[priceKey];
  state.coins += earned;
  state[resourceKey] = 0;
  toast(`🪙 Sold ${amount} ${label} for ${earned} coins!`);
  renderAll();
}
document.getElementById("sellMilkBtn").addEventListener("click", () => sellAll("milk", "milk", "milk"));
document.getElementById("sellEggsBtn").addEventListener("click", () => sellAll("eggs", "eggs", "eggs"));
document.getElementById("sellCheeseBtn").addEventListener("click", () => sellAll("cheese", "cheese", "cheese"));

/* ---- Hints toggle ---- */
document.getElementById("hintToggle").addEventListener("click", () => {
  const panel = document.getElementById("hintsPanel");
  panel.hidden = !panel.hidden;
});

/* ---- Game tick: hunger decay + production ---- */
function tick() {
  const dtSec = CONFIG.tickMs / 1000;
  for (const plot of state.plots) {
    const a = plot.animal;
    if (!a) continue;
    const def = CONFIG[a.type];
    if (a.hunger > 0) {
      a.hunger = Math.max(0, a.hunger - def.hungerDecayPerSec * dtSec);
      a.product = Math.min(100, a.product + def.fillPerSec * dtSec);
    }
  }
  if (state.creamery.converting) {
    state.creamery.progress += (100 / CONFIG.creameryTimeSec) * dtSec;
    if (state.creamery.progress >= 100) {
      state.creamery.progress = 0;
      state.creamery.converting = false;
      state.cheese += CONFIG.creameryCheeseYield;
      toast(`🧀 ${CONFIG.creameryCheeseYield} cheese is ready!`);
    }
  }
  renderAll();
}

/* ---- Rendering ---- */
function renderStats() {
  document.getElementById("stat-coins").textContent = Math.floor(state.coins);
  document.getElementById("stat-feed").textContent = state.feed;
  document.getElementById("stat-milk").textContent = state.milk;
  document.getElementById("stat-eggs").textContent = state.eggs;
  document.getElementById("stat-cheese").textContent = state.cheese;
}

function renderGrid() {
  const grid = document.getElementById("farmGrid");
  grid.innerHTML = "";
  for (const plot of state.plots) {
    const el = document.createElement("div");
    if (!plot.animal) {
      el.className = "plot";
      el.innerHTML = `<span class="plus-icon">➕</span><span class="plot-name">Empty plot</span>`;
      el.title = "Build a cow pen or chicken coop here";
      el.addEventListener("click", () => openBuildModal(plot.id));
    } else {
      const def = CONFIG[plot.animal.type];
      const hungry = plot.animal.hunger <= 0;
      const ready = plot.animal.product >= 100;
      el.className = "plot occupied" + (hungry ? " hungry" : "") + (ready ? " ready" : "");
      el.innerHTML = `
        <span class="animal-emoji">${def.emoji}</span>
        <span class="plot-name">${def.name}</span>
        <div class="mini-bar"><div class="mini-bar-fill" style="width:${plot.animal.hunger}%"></div></div>
      `;
      el.title = hungry ? "Hungry — needs feed" : ready ? "Ready to collect!" : "Growing...";
      el.addEventListener("click", () => openManageModal(plot.id));
    }
    grid.appendChild(el);
  }
}

function renderShopAndExpand() {
  document.getElementById("expandCost").textContent = expandCost();
  document.getElementById("feedCost").textContent = CONFIG.feedPackCost;
  document.getElementById("buyFeedBtn").disabled = state.coins < CONFIG.feedPackCost;
  document.getElementById("expandBtn").disabled = state.coins < expandCost();
}

function renderCreamery() {
  const locked = document.getElementById("creameryLocked");
  const active = document.getElementById("creameryActive");
  const hint = document.getElementById("creameryHint");
  if (!state.creamery.built) {
    locked.hidden = false;
    active.hidden = true;
    document.getElementById("creameryCost").textContent = CONFIG.creameryCost;
    document.getElementById("buildCreameryBtn").disabled = state.coins < CONFIG.creameryCost;
    hint.textContent = "Build it once to start turning milk into higher-value cheese.";
  } else {
    locked.hidden = true;
    active.hidden = false;
    document.getElementById("creameryFill").style.width = state.creamery.progress + "%";
    const btn = document.getElementById("convertBtn");
    if (state.creamery.converting) {
      btn.disabled = true;
      btn.textContent = `Aging batch... ${Math.round(state.creamery.progress)}%`;
      hint.textContent = "A batch is aging — check back in a bit.";
    } else {
      btn.disabled = state.milk < CONFIG.creameryMilkCost;
      btn.textContent = `Age ${CONFIG.creameryMilkCost} milk → ${CONFIG.creameryCheeseYield} cheese`;
      hint.textContent = "Ages milk into cheese over time. Cheese sells for much more.";
    }
  }
}

function renderMarket() {
  document.getElementById("sellMilkBtn").disabled = state.milk <= 0;
  document.getElementById("sellEggsBtn").disabled = state.eggs <= 0;
  document.getElementById("sellCheeseBtn").disabled = state.cheese <= 0;
}

function renderAll() {
  renderStats();
  renderGrid();
  renderShopAndExpand();
  renderCreamery();
  renderMarket();
}

/* ---- Boot ---- */
state = loadState();
renderAll();
setInterval(tick, CONFIG.tickMs);
setInterval(saveState, CONFIG.autosaveMs);
window.addEventListener("beforeunload", saveState);



// Runs every CONFIG.tickMs — advances hunger decay and production fill for all animals
