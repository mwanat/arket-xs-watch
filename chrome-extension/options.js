const FIELDS = ["url", "size", "minutes", "token", "chatId"];
const DEFAULTS = {
  url: "https://www.arket.com/pl-pl/product/upcycled-down-puffer-jacket-brown-1306442004/",
  size: "XS",
  minutes: 10,
};
const $ = (id) => document.getElementById(id);
const status = (t) => ($("status").textContent = t);

const LABELS = {
  available: "🟢 DOSTĘPNY",
  unavailable: "🔴 niedostępny",
  notfound: "⚠️ nie znaleziono przycisku rozmiaru",
  blocked: "⚠️ strona zablokowała dostęp",
  error: "⚠️ błąd",
};

function describe(last) {
  if (!last) return "Jeszcze nie sprawdzano.";
  return `Ostatnie sprawdzenie: ${last.at}\nWynik: ${LABELS[last.state] || last.state}` +
    (last.html ? `\n\nElement: ${last.html}` : "");
}

async function load() {
  const s = { ...DEFAULTS, ...(await chrome.storage.local.get(null)) };
  FIELDS.forEach((f) => ($(f).value = s[f] ?? ""));
  $("active").checked = !!s.active;
  status((s.found ? "Rozmiar został znaleziony – pilnowanie wyłączone.\n" : "") + describe(s.last));
}

$("save").onclick = async () => {
  const data = Object.fromEntries(FIELDS.map((f) => [f, $(f).value.trim()]));
  data.active = $("active").checked;
  if (data.active) Object.assign(data, { found: false, warned: false });
  await chrome.storage.local.set(data);
  await chrome.runtime.sendMessage({ type: "schedule" });
  status(data.active ? `Zapisano. Sprawdzam co ${data.minutes} min.` : "Zapisano. Pilnowanie wyłączone.");
};

$("test").onclick = async () => {
  status("Wysyłam…");
  const r = await chrome.runtime.sendMessage({ type: "test" });
  status(r.ok ? "Wysłano – sprawdź Telegram." : "Błąd: " + r.error);
};

$("check").onclick = async () => {
  status("Sprawdzam (ok. 10 s)…");
  const r = await chrome.runtime.sendMessage({ type: "check" });
  if (!r.ok) return status("Błąd: " + r.error);
  const { last } = await chrome.storage.local.get("last");
  status(describe(last));
};

load();
