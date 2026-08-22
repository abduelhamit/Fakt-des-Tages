# Fakt des Tages

Eine kleine Kalender-Webseite: Sie zeigt den Fakt des heutigen Tages und einen Kalender, über den
sich die Fakten anderer Tage aufrufen lassen. Statische Seite, gehostet auf GitHub Pages, komplett
auf Deutsch.

Nach dem ersten Deploy erreichbar unter <https://abduelhamit.github.io/Fakt-des-Tages/>.

## Einen Fakt hinzufügen

Alle Fakten stehen in **einer** Datei: [`static/fakten.yaml`](static/fakten.yaml). Sie lässt sich
direkt im GitHub-Webeditor bearbeiten — eine lokale Entwicklungsumgebung ist dafür nicht nötig.

```yaml
2026-08-22: Ein kurzer Fakt passt einzeilig.

2026-08-23: |
  Ein längerer Fakt mit **fettem** und *kursivem* Text sowie einem
  [Link](https://example.com).

  Ein zweiter Absatz ist ebenfalls möglich:

  - erster Punkt
  - zweiter Punkt
```

Regeln:

- **Der Schlüssel ist immer ein exaktes Datum** im Format `JJJJ-MM-TT`. Ein Eintrag für
  `2026-03-15` gilt nur für diesen einen Tag, nicht für jeden 15. März.
- Der Wert ist **CommonMark**. Überschriften, Listen, Links und Hervorhebungen werden gestaltet.
- Mehrzeilige Fakten brauchen einen `|`-Block, dessen Zeilen alle **gleich weit eingerückt** sind.
  Das ist die häufigste Fehlerquelle beim Bearbeiten im Browser.
- Tage ohne Eintrag sind im Kalender sichtbar, aber nicht anklickbar. Lücken sind also in Ordnung.

Bitte beachten:

- **Ein fehlerhafter Eintrag legt die gesamte Datei lahm.** Statt der Fakten erscheint dann eine
  Fehlermeldung, die den betroffenen Schlüssel nennt. Lieber einmal mehr prüfen.
- **Jedes Datum darf nur einmal vorkommen.** Ein doppelter Schlüssel ist ein Fehler.
- **Niemals eine `%YAML 1.1`-Zeile ergänzen.** Die Datumsschlüssel würden dadurch zu Datumsobjekten,
  und es würde stillschweigend kein einziger Fakt mehr gefunden.

Nach einem Push auf `main` baut GitHub Actions die Seite neu und veröffentlicht sie (etwa eine
Minute). Die Fakten werden dabei nicht in den Code eingebaut, sondern zur Laufzeit im Browser
geladen — deshalb genügt zum Pflegen der Inhalte der Webeditor.

## Entwicklung

Voraussetzungen: Node ≥ 20 und pnpm (die Version ist in `package.json` unter `packageManager`
festgelegt).

```sh
pnpm install
pnpm dev        # http://localhost:5173/Fakt-des-Tages
```

Die Seite läuft auch lokal unter dem Unterpfad `/Fakt-des-Tages`, weil sie auf GitHub Pages in einem
Projektverzeichnis liegt. Wer `http://localhost:5173/` aufruft, wird automatisch dorthin
weitergeleitet.

| Befehl         | Zweck                                 |
| -------------- | ------------------------------------- |
| `pnpm dev`     | Entwicklungsserver                    |
| `pnpm build`   | Produktions-Build nach `build/`       |
| `pnpm preview` | Den gebauten Stand lokal ausliefern   |
| `pnpm check`   | Typprüfung, auch in `.svelte`-Dateien |
| `pnpm lint`    | Prettier- und ESLint-Prüfung          |
| `pnpm format`  | Formatierung schreiben                |
| `pnpm test`    | Alle Tests einmalig ausführen         |

Es gibt zwei Testebenen: schnelle Node-Tests (`*.spec.ts`) und Playwright-Tests im echten Browser
(`*.e2e.ts`). `pnpm test` führt beide aus, `pnpm test:unit -- --run` nur die schnellen.

```sh
pnpm vitest run                         # nur die Node-Tests
pnpm test:e2e                           # nur die Browser-Tests
```

Für die Browser-Tests muss einmalig `pnpm exec playwright install chromium` ausgeführt werden.
Die Node-Tests prüfen unter anderem, ob `static/fakten.yaml` fehlerfrei ist — sie laufen bei jedem
Deploy und stoppen ihn bei einem Tippfehler.

## Deployment

Ein Push auf `main` startet [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml):
`check` → `lint` → `build`, anschließend die Veröffentlichung auf GitHub Pages. Pages wird beim
ersten erfolgreichen Durchlauf automatisch aktiviert.

## Technisches

Aufbau, Konventionen und die Fallstricke des Projekts sind in [CLAUDE.md](CLAUDE.md) dokumentiert —
unter anderem, warum es keine `svelte.config.js` gibt und warum die Fakten zur Laufzeit geladen
werden.
