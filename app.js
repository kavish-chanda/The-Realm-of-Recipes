const API = "https://www.themealdb.com/api/json/v1/1/";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const apiCache = new Map();
const api = async (p) => {
  const cacheable = !p.startsWith("random");
  if (cacheable && apiCache.has(p)) return apiCache.get(p);
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(API + p);
      if (!r.ok) throw new Error("bad");
      const d = await r.json();
      if (cacheable) apiCache.set(p, d);
      return d;
    } catch (e) { await new Promise((res) => setTimeout(res, 400)); }
  }
  return {};
};
const COCKTAIL = "https://www.thecocktaildb.com/api/json/v1/1/";
// Drinks are reshaped to look like meals, so cards, recipes, saving and cook mode all just work
const cocktail = async (p) => {
  try {
    const d = await (await fetch(COCKTAIL + p)).json();
    const list = Array.isArray(d.drinks) ? d.drinks : [];
    return { meals: list.map((x) => ({ ...x, idMeal: "d" + x.idDrink, strMeal: x.strDrink, strMealThumb: x.strDrinkThumb, strArea: x.strAlcoholic || "" })) };
  } catch (e) { return { meals: [] }; }
};
const store = {
  get: (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v === null ? d : v; } catch (e) { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};
const show = (id) => document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("show", s.id === id));

// Floating gold sparks
for (let i = 0; i < 30; i++) {
  const s = document.createElement("span");
  s.style.left = Math.random() * 100 + "%";
  s.style.animationDuration = 8 + Math.random() * 10 + "s";
  s.style.animationDelay = -Math.random() * 12 + "s";
  s.style.setProperty("--s", 2 + Math.random() * 3 + "px");
  $("sparks").appendChild(s);
}

// Landing -> book cover opens -> title page -> cookbook
$("enterRealm").onclick = () => { show("bookStage"); setTimeout(() => $("book").classList.add("open"), 900); };
$("openBook").onclick = () => {
  $("book").classList.add("turn");
  setTimeout(() => { show("cookbook"); loadFamous(); loadCategories(); loadAreas(); loadDrinks(); loadPick(); loadTrend(); renderViewed(); openFromHash(); updateCooked(); buildMoods(); renderList(); }, 800);
};

// Tabs
document.querySelectorAll("#tabs button").forEach((b) => (b.onclick = () => {
  document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("on", x === b));
  document.querySelectorAll(".pane").forEach((p) => p.classList.toggle("active", p.id === "pane-" + b.dataset.tab));
  if (b.dataset.tab === "saved") renderSaved();
}));

// Recipe cards
function cards(el, meals, counts) {
  el.innerHTML = "";
  if (!meals || !meals.length) { el.innerHTML = '<p class="empty">Nothing found. Try something else.</p>'; return; }
  meals.forEach((m, i) => {
    const c = document.createElement("button");
    c.className = "card";
    c.style.animationDelay = i * 50 + "ms";
    c.innerHTML = "<img alt=''><span></span>";
    const im = c.querySelector("img");
    im.loading = "lazy";
    im.onload = () => im.classList.add("in");
    im.src = /themealdb/.test(m.strMealThumb) ? m.strMealThumb + "/medium" : m.strMealThumb;
    const n = counts && counts[m.idMeal];
    c.querySelector("span").textContent = m.strMeal + (n > 1 ? " · " + n + " matches" : "");
    c.onclick = () => openRecipe(m.idMeal);
    const hs = document.createElement("span");
    hs.className = "heart";
    hs.setAttribute("role", "button");
    hs.setAttribute("aria-label", "Save recipe");
    const saved = favs().some((x) => x.idMeal === m.idMeal);
    hs.textContent = saved ? "♥" : "♡";
    hs.classList.toggle("on", saved);
    hs.onclick = (e) => { e.stopPropagation(); const on = toggleFav(m); hs.textContent = on ? "♥" : "♡"; hs.classList.toggle("on", on); };
    c.appendChild(hs);
    tilt(c);
    el.appendChild(c);
  });
}

// Related words, so "pasta" also finds spaghetti, lasagne, carbonara and more
const SYN = {
  pasta: ["spaghetti", "penne", "lasagne", "carbonara", "linguine", "macaroni", "ravioli", "gnocchi", "fettuccine", "rigatoni", "tagliatelle", "fusilli", "noodle"],
  noodles: ["noodle", "ramen", "pad thai", "udon", "lo mein", "pho", "spaghetti"],
  chicken: ["chicken", "tikka", "korma", "teriyaki", "fajita", "wings", "katsu", "tandoori", "nuggets"],
  beef: ["beef", "steak", "burger", "brisket", "meatball", "bolognese", "wellington", "stroganoff"],
  pork: ["pork", "bacon", "sausage", "ham", "ribs"],
  lamb: ["lamb", "kofta", "moussaka", "tagine"],
  fish: ["fish", "salmon", "cod", "tuna", "prawn", "shrimp", "mackerel", "haddock"],
  seafood: ["fish", "salmon", "prawn", "shrimp", "squid", "mussel", "crab", "tuna"],
  rice: ["rice", "risotto", "biryani", "paella", "pilaf", "fried rice", "sushi"],
  soup: ["soup", "stew", "broth", "chowder", "ramen", "bisque"],
  dessert: ["cake", "pie", "tart", "pudding", "cookie", "brownie", "pancake", "chocolate", "cheesecake", "crumble", "ice cream"],
  cake: ["cake", "cheesecake", "brownie", "sponge", "cupcake", "muffin"],
  curry: ["curry", "masala", "korma", "tikka", "dal", "vindaloo", "jalfrezi"],
  vegetarian: ["vegetable", "lentil", "bean", "tofu", "paneer", "mushroom", "chickpea"],
  egg: ["egg", "omelette", "shakshuka", "frittata", "quiche"],
  potato: ["potato", "chips", "gnocchi", "fries", "mash", "gratin"],
  salad: ["salad", "slaw", "tabbouleh", "caesar"],
  bread: ["bread", "pizza", "focaccia", "naan", "toast", "flatbread"],
};

async function doSearch() {
  const q = $("q").value.trim();
  if (!q) return;
  $("sMsg").textContent = "Searching...";
  const key = q.toLowerCase();
  const terms = [...new Set([q, ...(SYN[key] || [])])].slice(0, 14);
  const jobs = [];
  terms.forEach((t) => {
    jobs.push(api("search.php?s=" + encodeURIComponent(t)));
    jobs.push(api("filter.php?i=" + encodeURIComponent(t.replace(/\s+/g, "_"))));
  });
  const res = await Promise.all(jobs);
  const seen = new Set(), meals = [];
  res.forEach((r) => (r.meals || []).forEach((m) => { if (!seen.has(m.idMeal)) { seen.add(m.idMeal); meals.push(m); } }));
  $("sMsg").textContent = meals.length ? meals.length + " recipes found" : "";
  cards($("sRes"), meals);
}
$("sGo").onclick = doSearch;
$("q").addEventListener("keydown", (e) => { if (e.key === "Enter") { $("ac").hidden = true; doSearch(); } });

let famousLoaded = false;
async function loadFamous() {
  if (famousLoaded) return;
  famousLoaded = true;
  const names = ["Lasagne","Beef Wellington","Sushi","Spaghetti Bolognese","Kung Pao","Tandoori","Poutine","Shakshuka","Big Mac","Margherita","Brisket","Pad Thai","Ramen","Tacos","Paella","Pancakes","Alfredo","Moussaka","Pho","Tiramisu","Cheesecake","Fish pie","Biryani","Katsu","Burrito","Ratatouille","Pie","Stew","Chocolate","Salmon"];
  const res = await Promise.all(names.map((n) => api("search.php?s=" + encodeURIComponent(n))));
  const seen = new Set(), meals = [];
  res.forEach((r) => (r.meals || []).slice(0, 2).forEach((m) => { if (!seen.has(m.idMeal)) { seen.add(m.idMeal); meals.push(m); } }));
  cards($("fRes"), meals);
}

async function loadCategories() {
  const d = await api("categories.php");
  const el = $("catList");
  el.innerHTML = "";
  (d.categories || []).forEach((c) => {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = c.strCategory;
    b.onclick = async () => {
      document.querySelectorAll("#catList .chip").forEach((x) => x.classList.toggle("on", x === b));
      const r = await api("filter.php?c=" + encodeURIComponent(c.strCategory));
      cards($("cRes"), r.meals);
    };
    el.appendChild(b);
  });
}

// Fridge: best matches first
async function doFridge() {
  const items = $("fi").value.split(",").map((s) => s.trim().replace(/\s+/g, "_")).filter(Boolean);
  if (!items.length) return;
  $("fMsg").textContent = "Looking through your fridge...";
  const lists = await Promise.all(items.map((i) => api("filter.php?i=" + encodeURIComponent(i))));
  const count = {}, byId = {};
  lists.forEach((l) => (l.meals || []).forEach((m) => { count[m.idMeal] = (count[m.idMeal] || 0) + 1; byId[m.idMeal] = m; }));
  const ids = Object.keys(count).sort((a, b) => count[b] - count[a]).slice(0, 24);
  $("fMsg").textContent = ids.length ? "Best matches first" : "";
  cards($("fgRes"), ids.map((i) => byId[i]), count);
}
$("fGo").onclick = doFridge;
$("fi").addEventListener("keydown", (e) => { if (e.key === "Enter") doFridge(); });

// Recipe sheet
let cur = null, serv = 4;

function splitSteps(t) {
  let s = t.split(/\r?\n+/).map((x) => x.trim()).filter((x) => x.length > 2 && !/^step\s*\d+$/i.test(x) && !/^\d+\.?$/.test(x));
  if (s.length < 4) s = t.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).filter((x) => x.length > 2);
  return s.map((x) => x.replace(/^step\s*\d+[:.)]?\s*/i, ""));
}

function scale(q, f) {
  const m = q.match(/^(\d+\s+\d\/\d|\d+\/\d+|\d*\.?\d+)(.*)$/);
  if (!m) return q;
  const n = m[1].trim();
  let v;
  if (n.includes("/")) {
    const p = n.split(/\s+/), fr = p.pop().split("/");
    v = (p.length ? +p[0] : 0) + fr[0] / fr[1];
  } else v = +n;
  v *= f;
  const r = Math.round(v * 4) / 4;
  return (r === 0 ? v.toFixed(2) : String(r)) + m[2];
}

async function openRecipe(id) {
  const isDrink = String(id).startsWith("d");
  const d = isDrink ? await cocktail("lookup.php?i=" + String(id).slice(1)) : await api("lookup.php?i=" + id);
  const m = d.meals && d.meals[0];
  if (!m) return;
  const ing = [];
  for (let i = 1; i <= 20; i++) {
    const n = (m["strIngredient" + i] || "").trim();
    if (n) ing.push({ n, q: (m["strMeasure" + i] || "").trim() });
  }
  cur = { m, ing, steps: splitSteps(m.strInstructions || ""), base: isDrink ? 1 : 4, drink: isDrink };
  serv = cur.base;
  pushViewed(m);
  renderRecipe();
  $("recipe").hidden = false;
  $("recipe").scrollTop = 0;
}

function renderRecipe() {
  const { m, ing, steps } = cur, f = serv / (cur.base || 4);
  $("rBody").innerHTML =
    `<img class="hero" src="${esc(m.strMealThumb)}${/themealdb/.test(m.strMealThumb) ? "/large" : ""}" alt=""><h2>${esc(m.strMeal)}</h2>` +
    `<p class="meta">${esc(m.strArea || "")} · ${esc(m.strCategory || "")}${cookTime(steps)}</p>` +
    `<div class="serv"><button id="sm" class="chip">−</button><span>Serves ${serv}</span><button id="sp" class="chip">+</button></div>` +
    `<h3>Ingredients</h3><ul class="ing">${ing.map((i, n) => `<li style="animation-delay:${n * 40}ms"><b>${esc(scale(i.q, f))}</b> ${esc(i.n)}</li>`).join("")}</ul>` +
    `<div class="row"><button id="addList" class="gold">Add to shopping list</button><button id="cookBtn" class="gold">Start cooking</button><button id="favR" class="chip">♡ Save</button><button id="printR" class="chip">Print</button><button id="shareR" class="chip">Share</button></div>` +
    `<h3>Method</h3><ol class="steps">${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`;
  document.querySelectorAll("#rBody .ing li").forEach((li) => (li.onclick = () => li.classList.toggle("got")));
  $("sm").onclick = () => { serv = Math.max(1, serv - 1); renderRecipe(); };
  $("sp").onclick = () => { serv = Math.min(24, serv + 1); renderRecipe(); };
  $("addList").onclick = () => {
    const l = store.get("rr_list", []);
    ing.forEach((i) => l.push({ t: (scale(i.q, f) + " " + i.n).trim(), done: false }));
    store.set("rr_list", l);
    renderList();
    $("addList").textContent = "Added ✓";
  };
  $("cookBtn").onclick = startCook;
  $("favR").textContent = favs().some((x) => x.idMeal === m.idMeal) ? "♥ Saved" : "♡ Save";
  $("favR").onclick = () => { $("favR").textContent = toggleFav(m) ? "♥ Saved" : "♡ Save"; };
  $("printR").onclick = () => window.print();
  $("shareR").onclick = () => {
    const link = location.href.split("#")[0] + "#r=" + m.idMeal;
    if (navigator.clipboard) navigator.clipboard.writeText(link);
    $("shareR").textContent = "Link copied ✓";
  };
  const me = cur;
  if (me.more) addMore();
  else if (!me.fetching) {
    me.fetching = true;
    (me.drink ? cocktail : api)("filter.php?c=" + encodeURIComponent(m.strCategory || "")).then((r) => {
      me.more = (r.meals || []).filter((x) => x.idMeal !== m.idMeal).sort(() => Math.random() - 0.5).slice(0, 4);
      if (cur === me) addMore();
    });
  }
}

function addMore() {
  if (!cur.more || !cur.more.length) return;
  const h = document.createElement("h3");
  h.textContent = "You might also like";
  const g = document.createElement("div");
  g.className = "grid";
  $("rBody").append(h, g);
  cards(g, cur.more);
}

// Shopping list
function renderList() {
  const l = store.get("rr_list", []), ul = $("shop");
  ul.innerHTML = "";
  $("lMsg").textContent = l.length ? "Tap an item to tick it off." : "Your list is empty. Open a recipe and add its ingredients.";
  l.forEach((x, i) => {
    const li = document.createElement("li");
    if (x.done) li.className = "done";
    const t = document.createElement("span");
    t.textContent = x.t;
    const rm = document.createElement("button");
    rm.className = "chip";
    rm.textContent = "×";
    li.onclick = () => { l[i].done = !l[i].done; store.set("rr_list", l); renderList(); };
    rm.onclick = (e) => { e.stopPropagation(); l.splice(i, 1); store.set("rr_list", l); renderList(); };
    li.append(t, rm);
    ul.appendChild(li);
  });
}
$("clearList").onclick = () => { store.set("rr_list", []); renderList(); };

// Cook mode with timers
let ci = 0, tLeft = 0, tId = null;

function startCook() {
  ci = 0;
  $("cook").hidden = false;
  if (navigator.wakeLock) navigator.wakeLock.request("screen").catch(() => {});
  renderCook();
}

function renderCook() {
  const s = cur.steps;
  $("cStep").textContent = `Step ${ci + 1} of ${s.length}`;
  const t = $("cText");
  t.textContent = s[ci];
  t.style.animation = "none"; void t.offsetWidth; t.style.animation = "";
  $("cBar").style.width = ((ci + 1) / s.length) * 100 + "%";
  $("cPrev").disabled = ci === 0;
  $("cNext").textContent = ci === s.length - 1 ? "Finish" : "Next";
  const m = s[ci].match(/(\d+)(?:\s*(?:-|to)\s*\d+)?\s*(minutes?|mins?|hours?|hrs?)/i);
  $("cSuggest").hidden = !m;
  if (m) {
    const mins = +m[1] * (/^h/i.test(m[2]) ? 60 : 1);
    $("cSuggest").textContent = `Set ${mins} min timer`;
    $("cSuggest").onclick = () => setTimer(mins * 60);
  }
}

const fmt = (s) => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");

function ding() {
  try {
    const a = new AudioContext(), o = a.createOscillator(), g = a.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.3, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 1.2);
    o.connect(g); g.connect(a.destination);
    o.start(); o.stop(a.currentTime + 1.2);
  } catch (e) {}
  if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
}

function runTimer() {
  clearInterval(tId);
  $("tToggle").textContent = "Stop";
  tId = setInterval(() => {
    tLeft--;
    $("tDisp").textContent = fmt(Math.max(0, tLeft));
    if (tLeft <= 0) { clearInterval(tId); tId = null; $("tToggle").textContent = "Start"; $("tDisp").classList.add("ring"); ding(); }
  }, 1000);
}
function stopTimer() { clearInterval(tId); tId = null; $("tDisp").classList.remove("ring"); $("tToggle").textContent = "Start"; }
function setTimer(sec) { stopTimer(); tLeft = sec; $("tDisp").textContent = fmt(tLeft); runTimer(); }

$("tToggle").onclick = () => { if (tId) stopTimer(); else if (tLeft > 0) runTimer(); };
document.querySelectorAll("[data-t]").forEach((b) => (b.onclick = () => setTimer(+b.dataset.t * 60)));
$("cPrev").onclick = () => { if (ci > 0) { ci--; renderCook(); } };
$("cNext").onclick = () => { if (ci < cur.steps.length - 1) { ci++; renderCook(); } else { $("cook").hidden = true; stopTimer(); confetti(); bumpCooked(); } };
$("cClose").onclick = () => { $("cook").hidden = true; stopTimer(); };
$("rClose").onclick = () => { $("recipe").hidden = true; };
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { $("cook").hidden = true; $("recipe").hidden = true; stopTimer(); }
  if (!$("cook").hidden && e.key === "ArrowRight") $("cNext").click();
  if (!$("cook").hidden && e.key === "ArrowLeft") $("cPrev").click();
});

// ---------- Search extras: suggestions, autocomplete, A-Z, today's pick, cuisines ----------
["chicken", "pasta", "curry", "beef", "dessert", "vegetarian", "seafood", "soup", "cake", "rice", "pork", "lamb"].forEach((w) => {
  const b = document.createElement("button");
  b.className = "chip";
  b.textContent = w;
  b.onclick = () => { $("q").value = w; doSearch(); };
  $("sugg").appendChild(b);
});

"abcdefghijklmnopqrstuvwxyz".split("").forEach((l) => {
  const b = document.createElement("button");
  b.className = "chip";
  b.textContent = l.toUpperCase();
  b.onclick = async () => {
    document.querySelectorAll("#az .chip").forEach((x) => x.classList.toggle("on", x === b));
    $("sMsg").textContent = "Recipes starting with " + l.toUpperCase();
    const d = await api("search.php?f=" + l);
    cards($("sRes"), d.meals);
  };
  $("az").appendChild(b);
});

let acTimer;
$("q").addEventListener("input", () => {
  clearTimeout(acTimer);
  const v = $("q").value.trim();
  if (v.length < 2) { $("ac").hidden = true; return; }
  acTimer = setTimeout(async () => {
    const d = await api("search.php?s=" + encodeURIComponent(v));
    const ms = (d.meals || []).slice(0, 6);
    const ac = $("ac");
    ac.innerHTML = "";
    ac.hidden = !ms.length;
    ms.forEach((m) => {
      const b = document.createElement("button");
      b.textContent = m.strMeal;
      b.onclick = () => { ac.hidden = true; openRecipe(m.idMeal); };
      ac.appendChild(b);
    });
  }, 250);
});
document.addEventListener("click", (e) => { if (!e.target.closest(".searchbox")) $("ac").hidden = true; });

$("rand").onclick = async () => {
  const d = await api("random.php");
  if (d.meals && d.meals[0]) openRecipe(d.meals[0].idMeal);
};

async function loadPick() {
  const d = await api("random.php");
  const m = d.meals && d.meals[0];
  if (!m) return;
  const el = $("pick");
  el.style.backgroundImage = `linear-gradient(90deg,rgba(15,42,28,.9),rgba(15,42,28,.15)),url("${m.strMealThumb}")`;
  const tag = document.createElement("div");
  tag.className = "eyebrow";
  tag.textContent = "Today's pick";
  const h = document.createElement("h3");
  h.textContent = m.strMeal;
  const b = document.createElement("button");
  b.className = "gold";
  b.textContent = "Open recipe";
  b.onclick = () => openRecipe(m.idMeal);
  el.append(tag, h, b);
}

async function loadAreas() {
  const el = $("areaList");
  el.innerHTML = '<p class="msg">Loading cuisines...</p>';
  const d = await api("list.php?a=list");
  const areas = (d.meals || []).map((a) => a.strArea);
  const lists = await Promise.all(areas.map((a) => api("filter.php?a=" + encodeURIComponent(a))));
  el.innerHTML = "";
  let first = null;
  areas.forEach((a, i) => {
    const ms = lists[i].meals || [];
    if (!ms.length) return; // only show cuisines that really have recipes
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = a + " (" + ms.length + ")";
    b.onclick = () => {
      document.querySelectorAll("#areaList .chip").forEach((x) => x.classList.toggle("on", x === b));
      cards($("aRes"), ms);
    };
    el.appendChild(b);
    first = first || b;
  });
  if (first) first.click(); else el.textContent = "Couldn't load cuisines. Check your connection and refresh.";
}

// ---------- Tilt, confetti, saved, viewed, trending, moods ----------
function tilt(el) {
  el.addEventListener("pointermove", (e) => {
    const r = el.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(700px) rotateY(${px * 14}deg) rotateX(${-py * 14}deg) translateY(-8px) scale(1.02)`;
    el.style.setProperty("--mx", (px + 0.5) * 100 + "%");
    el.style.setProperty("--my", (py + 0.5) * 100 + "%");
  });
  el.addEventListener("pointerleave", () => { el.style.transform = ""; });
}

function confetti() {
  const c = document.createElement("canvas");
  c.className = "confetti";
  c.width = innerWidth; c.height = innerHeight;
  document.body.appendChild(c);
  const x = c.getContext("2d"), cols = ["#d9b45a", "#f0d58a", "#b87333", "#f7f0de", "#2f7d4f"];
  const p = Array.from({ length: 120 }, () => ({
    x: Math.random() * c.width, y: -20 - Math.random() * c.height * 0.5,
    vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 4, r: 4 + Math.random() * 5,
    c: cols[Math.floor(Math.random() * cols.length)], a: Math.random() * 6,
  }));
  let t = 0;
  (function f() {
    x.clearRect(0, 0, c.width, c.height);
    p.forEach((q) => {
      q.x += q.vx; q.y += q.vy; q.a += 0.2;
      x.save(); x.translate(q.x, q.y); x.rotate(q.a); x.fillStyle = q.c; x.fillRect(-q.r, -q.r / 2, q.r * 2, q.r); x.restore();
    });
    if (++t < 150) requestAnimationFrame(f); else c.remove();
  })();
}

const favs = () => store.get("rr_favs", []);
function toggleFav(m) {
  const f = favs(), i = f.findIndex((x) => x.idMeal === m.idMeal);
  if (i >= 0) f.splice(i, 1);
  else f.unshift({ idMeal: m.idMeal, strMeal: m.strMeal, strMealThumb: m.strMealThumb });
  store.set("rr_favs", f);
  return i < 0;
}
function renderSaved() {
  const f = favs();
  $("svMsg").textContent = f.length ? "" : "Nothing saved yet. Open a recipe and tap Save.";
  if (f.length) cards($("svRes"), f); else $("svRes").innerHTML = "";
}

function pushViewed(m) {
  const v = store.get("rr_viewed", []).filter((x) => x.idMeal !== m.idMeal);
  v.unshift({ idMeal: m.idMeal, strMeal: m.strMeal, strMealThumb: m.strMealThumb });
  store.set("rr_viewed", v.slice(0, 8));
  renderViewed();
}
function renderViewed() {
  const v = store.get("rr_viewed", []);
  $("rvh").hidden = !v.length;
  if (v.length) cards($("rv"), v); else $("rv").innerHTML = "";
}

async function loadTrend() {
  const rs = await Promise.all(Array.from({ length: 8 }, () => api("random.php")));
  const seen = new Set(), ms = [];
  rs.forEach((r) => { const m = r.meals && r.meals[0]; if (m && !seen.has(m.idMeal)) { seen.add(m.idMeal); ms.push(m); } });
  cards($("trend"), ms);
}

function buildMoods() {
  if ($("moods").children.length) return;
  [["Comfort food", "stew"], ["Date night", "steak"], ["Sweet tooth", "cake"], ["Light & fresh", "salad"],
   ["Spicy", "chilli"], ["Brunch", "egg"], ["Cozy soup", "soup"], ["Crowd pleaser", "chicken"]].forEach(([label, term]) => {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = label;
    b.onclick = () => { $("q").value = term; doSearch(); };
    $("moods").appendChild(b);
  });
}

$("copyList").onclick = () => {
  const text = store.get("rr_list", []).map((x) => "- " + x.t).join("\n");
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => { $("copyList").textContent = "Copied ✓"; setTimeout(() => ($("copyList").textContent = "Copy list"), 1500); });
};

// ---------- Drinks tab ----------
const enc = encodeURIComponent;

async function dSearch() {
  const q = $("dq").value.trim();
  if (!q) return;
  $("dMsg").textContent = "Searching...";
  const d = await cocktail("search.php?s=" + enc(q));
  $("dMsg").textContent = d.meals.length ? d.meals.length + " drinks found" : "";
  cards($("dRes"), d.meals);
}
$("dGo").onclick = dSearch;
$("dq").addEventListener("keydown", (e) => { if (e.key === "Enter") dSearch(); });
$("dRand").onclick = async () => {
  const d = await cocktail("random.php");
  if (d.meals[0]) openRecipe(d.meals[0].idMeal);
};

async function loadDrinks() {
  const box = $("dCats");
  box.innerHTML = "";
  const pick = (label, path) => {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = label;
    b.onclick = async () => {
      document.querySelectorAll("#dCats .chip").forEach((x) => x.classList.toggle("on", x === b));
      $("dMsg").textContent = "";
      cards($("dRes"), (await cocktail(path)).meals);
    };
    box.appendChild(b);
    return b;
  };
  const first = pick("Non alcoholic", "filter.php?a=Non_Alcoholic");
  try {
    const cats = await (await fetch(COCKTAIL + "list.php?c=list")).json();
    (cats.drinks || []).forEach((c) => pick(c.strCategory, "filter.php?c=" + enc(c.strCategory)));
  } catch (e) {}
  first.click();
}

// ---------- Extras ----------
function cookTime(steps) {
  let mins = 0;
  steps.forEach((t) => {
    const m = t.match(/(\d+)(?:\s*(?:-|to)\s*\d+)?\s*(minutes?|mins?|hours?|hrs?)/i);
    if (m) mins += +m[1] * (/^h/i.test(m[2]) ? 60 : 1);
  });
  return mins ? " · about " + mins + " min of cooking" : "";
}

function updateCooked() {
  const n = store.get("rr_cooked", 0);
  $("cooked").hidden = !n;
  $("cooked").textContent = "★ " + n + (n === 1 ? " meal cooked" : " meals cooked");
}
function bumpCooked() { store.set("rr_cooked", store.get("rr_cooked", 0) + 1); updateCooked(); }

function openFromHash() {
  const m = location.hash.match(/^#r=(d?\w+)/);
  if (m) openRecipe(m[1]);
}

$("cSpeak").onclick = () => {
  try { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(cur.steps[ci])); } catch (e) {}
};
$("cClose").addEventListener("click", () => { try { speechSynthesis.cancel(); } catch (e) {} });

// Keyboard shortcuts
const tabBtns = [...document.querySelectorAll("#tabs button")];
function toggleHelp() {
  let h = $("help");
  if (h) { h.remove(); return; }
  h = document.createElement("div");
  h.id = "help";
  h.className = "overlay";
  h.innerHTML = '<div class="sheet"><button class="x" aria-label="Close">×</button><h2>Shortcuts</h2><ul class="keys"><li><b>/</b> Search</li><li><b>r</b> Random recipe</li><li><b>1-9</b> Jump to a tab</li><li><b>← →</b> Cook mode steps</li><li><b>Esc</b> Close</li><li><b>?</b> This list</li></ul></div>';
  h.onclick = (e) => { if (e.target === h || e.target.className === "x") h.remove(); };
  document.body.appendChild(h);
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("help")) $("help").remove();
  if (!$("cookbook").classList.contains("show") || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.metaKey || e.ctrlKey) return;
  if (e.key === "/") { e.preventDefault(); tabBtns[0].click(); $("q").focus(); }
  else if (e.key === "r") $("rand").click();
  else if (e.key === "?") toggleHelp();
  else if (/^[1-9]$/.test(e.key) && tabBtns[+e.key - 1]) tabBtns[+e.key - 1].click();
});

// Sparkle trail
if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
  let last = 0;
  document.addEventListener("pointermove", (e) => {
    if (!$("cookbook").classList.contains("show") || e.pointerType === "touch") return;
    const t = Date.now();
    if (t - last < 45) return;
    last = t;
    const s = document.createElement("span");
    s.className = "spark";
    s.style.left = e.clientX + "px";
    s.style.top = e.clientY + "px";
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 700);
  });
}

// Scroll progress and back to top
const progress = document.createElement("div");
progress.className = "progress";
document.body.appendChild(progress);
const toTop = document.createElement("button");
toTop.className = "totop";
toTop.textContent = "↑";
toTop.hidden = true;
toTop.setAttribute("aria-label", "Back to top");
toTop.onclick = () => $("cookbook").scrollTo({ top: 0, behavior: "smooth" });
document.body.appendChild(toTop);
$("cookbook").addEventListener("scroll", () => {
  const c = $("cookbook"), max = c.scrollHeight - c.clientHeight;
  progress.style.width = (max > 0 ? (c.scrollTop / max) * 100 : 0) + "%";
  toTop.hidden = c.scrollTop < 500;
});