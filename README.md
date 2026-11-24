# Arket XS watcher

Co 10 minut sprawdza, czy rozmiar XS kurtki
[Upcycled Down Puffer Jacket (brown)](https://www.arket.com/pl-pl/product/upcycled-down-puffer-jacket-brown-1306442004/)
jest dostępny. Jeśli jest, wysyła wiadomość na Telegram i sam się wyłącza.

## Uruchomienie

1. Utwórz nowe repo na GitHubie (np. `arket-xs-watch`) i wrzuć do niego te pliki
   (`check_xs.py`, `.github/workflows/arket-xs.yml`).
2. **Settings → Secrets and variables → Actions → New repository secret**:
   - `TELEGRAM_BOT_TOKEN` – token Twojego bota
   - `TELEGRAM_CHAT_ID` – Twoje chat ID (to samo co w Garmin Run Coach)
3. **Actions → Arket XS watcher → Run workflow** z zaznaczonym „Wyślij tylko wiadomość testową”.
   Powinna przyjść wiadomość „✅ Test…”.
4. Uruchom jeszcze raz **bez** zaznaczenia i otwórz log kroku „Sprawdź rozmiar”.
   Powinno być `Niedostępny.` (albo wiadomość, jeśli XS akurat jest).
   W artefakcie `debug-screenshot` zobaczysz, jak strona wyglądała.

Od tej chwili harmonogram działa sam.

## Uwagi

- **Minuty Actions:** w repo **publicznym** są bez limitu. W prywatnym limit darmowy to
  2000 min/mies., a 144 uruchomienia dziennie go przekroczą, więc zrób repo publiczne
  (sekrety i tak są niewidoczne) albo zmień cron na `*/30`.
- Po znalezieniu XS workflow się wyłącza, żeby nie spamować. Żeby pilnować znowu:
  Actions → Arket XS watcher → **Enable workflow**.
- Jeśli Arket zmieni wygląd strony, skrypt zakończy się błędem, a GitHub wyśle Ci maila o nieudanym uruchomieniu.
- Inny rozmiar lub produkt: zmień `SIZE` w workflow albo dodaj `PRODUCT_URL` w `env`.

## Wersja w Chrome (działa – Arket blokuje serwery, ale nie Twoją przeglądarkę)

Folder `chrome-extension/`: rozszerzenie, które co 10 minut otwiera stronę w zminimalizowanym oknie,
sprawdza rozmiar i wysyła wiadomość na Telegram. Instalacja: `chrome://extensions` → Tryb dewelopera →
„Załaduj rozpakowane” → wskaż folder. Kliknij ikonę rozszerzenia, wpisz token i chat ID, zaznacz
„Pilnuj automatycznie”, Zapisz.
