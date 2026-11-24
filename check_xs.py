"""Sprawdza, czy na stronie produktu Arket jest dostępny dany rozmiar,
i jeśli tak, wysyła wiadomość na Telegram.

Zmienne środowiskowe:
  TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID  – wymagane
  PRODUCT_URL  – adres produktu (domyślnie kurtka puchowa Arket)
  SIZE         – rozmiar do pilnowania (domyślnie XS)
  TEST_MESSAGE – "1" = tylko wyślij wiadomość testową i zakończ

Kody wyjścia: 0 = sprawdzono (wynik w pliku result.txt: available / unavailable),
              1 = błąd (np. nie znaleziono przycisku rozmiaru – zmienił się wygląd strony).
"""

import os
import re
import sys
import json
import urllib.parse
import urllib.request

from playwright.sync_api import sync_playwright

URL = os.environ.get(
    "PRODUCT_URL",
    "https://www.arket.com/pl-pl/product/upcycled-down-puffer-jacket-brown-1306442004/",
)
SIZE = os.environ.get("SIZE", "XS").strip()
TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
CHAT_ID = os.environ["TELEGRAM_CHAT_ID"]

UNAVAILABLE_WORDS = re.compile(
    r"powiadom|wyprzedan|niedostępn|brak|sold.?out|out.?of.?stock|notify|unavailable",
    re.I,
)


def telegram(text: str) -> None:
    data = urllib.parse.urlencode(
        {"chat_id": CHAT_ID, "text": text, "disable_web_page_preview": "false"}
    ).encode()
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{TOKEN}/sendMessage", data=data
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        r.read()


def accept_cookies(page) -> None:
    for label in ("Akceptuj wszystkie", "Zaakceptuj wszystkie", "Akceptuj", "Accept all"):
        btn = page.get_by_role("button", name=re.compile(label, re.I))
        if btn.count():
            try:
                btn.first.click(timeout=3000)
                page.wait_for_timeout(800)
                return
            except Exception:
                pass


def find_size_element(page):
    """Szuka klikalnego elementu, którego tekst to dokładnie rozmiar (np. 'XS')."""
    candidates = page.locator(
        "button, label, li, [role=radio], [role=option], [role=button], a"
    ).filter(has_text=re.compile(rf"^\s*{re.escape(SIZE)}\b", re.I))
    for i in range(candidates.count()):
        el = candidates.nth(i)
        try:
            txt = el.inner_text(timeout=1000).strip()
        except Exception:
            continue
        first_word = txt.split()[0] if txt else ""
        if first_word.upper() == SIZE.upper() and el.is_visible():
            return el
    return None


def element_says_unavailable(el) -> tuple[bool, str]:
    info = el.evaluate(
        """e => {
            const s = getComputedStyle(e);
            return {
              disabled: e.disabled === true || e.getAttribute('aria-disabled') === 'true',
              cls: (e.className && e.className.baseVal !== undefined) ? e.className.baseVal : (e.className || ''),
              text: e.innerText || '',
              aria: e.getAttribute('aria-label') || '',
              title: e.getAttribute('title') || '',
              strike: s.textDecorationLine.includes('line-through'),
              html: e.outerHTML.slice(0, 400)
            };
        }"""
    )
    blob = " ".join([info["cls"], info["text"], info["aria"], info["title"]])
    unavailable = (
        info["disabled"]
        or info["strike"]
        or bool(UNAVAILABLE_WORDS.search(blob))
        or bool(re.search(r"disabled|inactive", info["cls"], re.I))
    )
    return unavailable, info["html"]


def add_to_cart_enabled(page) -> bool | None:
    btn = page.get_by_role("button", name=re.compile(r"dodaj do koszyka|add to bag", re.I))
    if not btn.count():
        return None
    b = btn.first
    try:
        return b.is_visible() and b.is_enabled()
    except Exception:
        return None


def notify_visible(page) -> bool:
    btn = page.get_by_role("button", name=re.compile(r"powiadom|notify", re.I))
    try:
        return btn.count() > 0 and btn.first.is_visible()
    except Exception:
        return False


def main() -> int:
    if os.environ.get("TEST_MESSAGE") == "1":
        telegram(f"✅ Test: watcher Arket działa. Pilnuję rozmiaru {SIZE}.\n{URL}")
        return 0

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(
            locale="pl-PL",
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/131.0 Safari/537.36"
            ),
            viewport={"width": 1366, "height": 900},
        )
        page.goto(URL, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(4000)
        accept_cookies(page)

        el = find_size_element(page)
        if el is None:
            page.screenshot(path="debug.png", full_page=True)
            print(f"Nie znaleziono przycisku rozmiaru {SIZE} – sprawdź debug.png")
            browser.close()
            return 1

        marked_unavailable, html = element_says_unavailable(el)
        print("Element rozmiaru:", html)

        # Drugi sygnał: kliknij rozmiar i zobacz, czy da się dodać do koszyka.
        try:
            el.click(timeout=5000)
            page.wait_for_timeout(1500)
        except Exception as e:
            print("Klik w rozmiar nie zadziałał:", e)
        cart_ok = add_to_cart_enabled(page)
        notify = notify_visible(page)
        page.screenshot(path="debug.png", full_page=False)
        browser.close()

    print(json.dumps({"marked_unavailable": marked_unavailable,
                      "add_to_cart_enabled": cart_ok,
                      "notify_button": notify}))

    available = (not marked_unavailable) and (not notify) and (cart_ok is not False)
    with open("result.txt", "w") as f:
        f.write("available" if available else "unavailable")

    if available:
        telegram(
            f"🟢 Rozmiar {SIZE} jest dostępny w Arket!\n"
            f"Kurtka: Upcycled Down Puffer Jacket (brown)\n{URL}"
        )
        print("DOSTĘPNY – wysłano wiadomość.")
    else:
        print("Niedostępny.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
