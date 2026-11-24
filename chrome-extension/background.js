const DEFAULTS = {
  url: "https://www.arket.com/pl-pl/product/upcycled-down-puffer-jacket-brown-1306442004/",
  size: "XS",
  minutes: 10,
  token: "",
  chatId: "",
  active: false,
  found: false,
};
const ALARM = "arket-check";

async function settings() {
  return { ...DEFAULTS, ...(await chrome.storage.local.get(null)) };
}

async function telegram(text) {
  const s = await settings();
  if (!s.token || !s.chatId) throw new Error("Brak tokenu lub chat ID");
  const r = await fetch(`https://api.telegram.org/bot${s.token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: s.chatId, text }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error("Telegram: " + (j.description || r.status));
}

// Funkcja wstrzykiwana do strony produktu – musi być samowystarczalna.
function inspectPage(size) {
  if (/access denied/i.test(document.title)) return { state: "blocked" };
  const bad = /powiadom|wyprzedan|niedostępn|brak|sold.?out|out.?of.?stock|notify|unavailable|disabled|inactive/i;
  const leaves = [...document.querySelectorAll("body *")].filter(
    (e) => e.children.length === 0 && (e.textContent || "").trim().toUpperCase() === size.toUpperCase()
  );
  for (const leaf of leaves) {
    const el = leaf.closest("button, label, li, a, [role=radio], [role=option], [role=button]") || leaf;
    if (!el.offsetParent && getComputedStyle(el).position !== "fixed") continue; // niewidoczny
    const input = el.querySelector("input") || (el.htmlFor && document.getElementById(el.htmlFor));
    const blob = [
      typeof el.className === "string" ? el.className : "",
      leaf.className || "",
      el.getAttribute("aria-label") || "",
      el.getAttribute("title") || "",
      el.innerText || "",
    ].join(" ");
    const unavailable =
      el.disabled === true ||
      el.getAttribute("aria-disabled") === "true" ||
      (input && (input.disabled || input.getAttribute("aria-disabled") === "true")) ||
      getComputedStyle(leaf).textDecorationLine.includes("line-through") ||
      getComputedStyle(el).textDecorationLine.includes("line-through") ||
      bad.test(blob);
    return { state: unavailable ? "unavailable" : "available", html: el.outerHTML.slice(0, 500) };
  }
  return { state: "notfound" };
}

async function checkOnce({ manual = false } = {}) {
  const s = await settings();
  const win = await chrome.windows.create({ url: s.url, focused: false, state: "minimized" });
  const tabId = win.tabs[0].id;
  let result;
  try {
    await new Promise((resolve) => {
      const t = setTimeout(resolve, 30000);
      chrome.tabs.onUpdated.addListener(function l(id, info) {
        if (id === tabId && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(l);
          clearTimeout(t);
          resolve();
        }
      });
    });
    await new Promise((r) => setTimeout(r, 5000)); // czas na doładowanie rozmiarów
    const [{ result: res }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: inspectPage,
      args: [s.size],
    });
    result = res;
  } catch (e) {
    result = { state: "error", html: String(e) };
  } finally {
    chrome.windows.remove(win.id).catch(() => {});
  }

  await chrome.storage.local.set({ last: { ...result, at: new Date().toLocaleString("pl-PL") } });

  if (result.state === "available") {
    await telegram(`🟢 Rozmiar ${s.size} jest dostępny w Arket!\n${s.url}`);
    if (!manual) {
      await chrome.storage.local.set({ found: true, active: false });
      await chrome.alarms.clear(ALARM);
    }
  } else if (["notfound", "blocked", "error"].includes(result.state) && !s.warned) {
    // jednorazowe ostrzeżenie, gdyby strona zmieniła wygląd
    await telegram(`⚠️ Strażnik Arket: nie udało się odczytać rozmiaru ${s.size} (${result.state}). Sprawdź rozszerzenie.`).catch(() => {});
    await chrome.storage.local.set({ warned: true });
  }
  return result;
}

async function schedule() {
  const s = await settings();
  await chrome.alarms.clear(ALARM);
  if (s.active && !s.found) chrome.alarms.create(ALARM, { periodInMinutes: Number(s.minutes) || 10, delayInMinutes: 0.1 });
}

chrome.alarms.onAlarm.addListener((a) => { if (a.name === ALARM) checkOnce(); });
chrome.runtime.onStartup.addListener(schedule);
chrome.runtime.onInstalled.addListener(schedule);

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  (async () => {
    try {
      if (msg.type === "test") { await telegram("✅ Test: strażnik Arket działa."); reply({ ok: true }); }
      else if (msg.type === "check") { reply({ ok: true, result: await checkOnce({ manual: true }) }); }
      else if (msg.type === "schedule") { await schedule(); reply({ ok: true }); }
    } catch (e) { reply({ ok: false, error: String(e.message || e) }); }
  })();
  return true;
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
