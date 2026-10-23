---
description: Erzeugt aus der laufenden Session ein nicht-technisches Anleitungs-PDF (Punkte filtern → auswählen → PDF)
argument-hint: [optionaler Titel] [--transcript]
---

Du erzeugst ein **Anleitungs-PDF für Kollegen** aus dem, was in dieser
Session passiert ist. Optionaler Titel-Wunsch: **$ARGUMENTS**

**Zielgruppe:** Menschen, die mit der Software arbeiten — **keine
Entwickler.** Die Leserin will wissen, was sie jetzt anders macht, nicht wie
es gebaut wurde. Anrede durchgehend **„Sie"**.

Der Ablauf ist dreistufig und Du **stoppst zwischen Schritt 2 und 3**.
Erzeuge niemals ein PDF, ohne vorher die Auswahl abgewartet zu haben.

---

## Schritt 1: Hauptpunkte der Session filtern

Gehe diese Session durch und sammle, was für einen **Anwender** relevant ist.

**Was ein Punkt ist:**

- eine neue oder geänderte Funktion, die jemand in der Oberfläche bemerkt
- ein behobener Fehler, der den Arbeitsablauf betraf
- eine geänderte Regel oder ein geänderter Ablauf (z. B. wer was freigeben muss)
- eine neue Einstellung, die jemand pflegen muss
- etwas, das ab jetzt **anders** gemacht werden muss als vorher

**Was kein Punkt ist** — fasse so etwas nicht als eigenen Punkt auf, auch
wenn es in der Session viel Platz eingenommen hat:

- Refactorings, Tests, Linter-Läufe, Migrationen, Deploy-Schritte
- Branch-/PR-/Issue-Nummern, Code-Reviews, Merge-Konflikte
- alles, was für den Anwender unsichtbar bleibt

Wenn eine Session **nur** unsichtbare Arbeit enthielt, sage das offen und
brich ab — ein Handout über ein Refactoring hilft niemandem.

**Quelle:** Standard ist Dein eigener Kontext dieser Session. Wurde
`--transcript` übergeben, lies zusätzlich das Transcript unter
`~/.claude/projects/<slug>/<session-id>.jsonl` (`<slug>` = Projektpfad mit
`/` und `.` durch `-` ersetzt, Datei = die zuletzt geänderte). Nutze das nur
auf Anforderung: der Pfad ist eine Heuristik und das Format undokumentiert,
das kann ohne Vorwarnung brechen. Klappt es nicht, sage es und arbeite mit
Deinem Kontext weiter.

## Schritt 2: Punkte zur Auswahl stellen

Gib eine **numerierte Liste** aus — ein Punkt pro Zeile, Überschrift in
Anwendersprache, dahinter ein Halbsatz zur Einordnung. Keine Dateinamen,
keine Klassennamen, keine Ticketnummern in der Liste.

```
1. Bestellungen lassen sich duplizieren — spart das Neuanlegen wiederkehrender Bestellungen
2. Urlaubsübersicht zeigt jetzt das ganze Jahr — ersetzt die Excel-Liste
3. ...
```

Frage danach in **einer** Zeile, was ins PDF soll, und nenne die möglichen
Antwortformen: Einzelnummern (`1, 3`), Bereiche (`5-7`), `alle`, oder
`alle außer 4`.

**Dann hörst Du auf und wartest.** Kein PDF, keine weiteren Tool-Calls.

## Schritt 3: Auswahl in Erklärungen übersetzen

Schreibe für jeden **ausgewählten** Punkt vier Blöcke. Lass einen Block weg,
wenn Du ihn nicht ehrlich füllen kannst — erfinde nichts dazu.

| Block | Inhalt | Länge |
|---|---|---|
| `was_ist_neu` | Was sich ändert, aus Sicht der Nutzerin | 1–2 Sätze |
| `warum` | Der fachliche Nutzen — warum das besser ist als vorher | 1–2 Sätze |
| `schritte` | Konkreter Klick-Weg, jeder Schritt eine eigene Zeile | 2–6 Schritte |
| `hinweise` | Fallen, Voraussetzungen, Berechtigungen in Alltagssprache | 0–3 Punkte |

**Sprachregeln — das ist der Teil, der am leichtesten schiefgeht:**

- Nenne Menüpunkte so, wie sie in der Oberfläche stehen („Menü *Lager* →
  *Bestellungen*"), nicht als Route oder URL.
- **Verboten im Fließtext:** Dateipfade, Klassen-/Methodennamen,
  Permission-Keys, Tabellen- oder Spaltennamen, Branch-/PR-/Issue-Nummern,
  Migrationen, Queue/Job, Tenant/Scope, Framework-Namen, Englisch für Dinge,
  die eine deutsche Entsprechung in der Oberfläche haben.
- Statt „Du brauchst die Permission `lager.orders.create`" schreibe „Dafür
  brauchen Sie die Berechtigung, Bestellungen anzulegen — falls der
  Menüpunkt fehlt, wenden Sie sich an die Verwaltung."
- Taucht ein Fachbegriff auf, der sich nicht vermeiden lässt, nimm ihn ins
  `glossar` auf, statt ihn im Text zu erklären.
- Benutze deutsche Anführungszeichen als Paar: `„Kopie anlegen“`, nicht
  `„Kopie anlegen"`. Im PDF fällt ein gerades Schlusszeichen sofort auf.

**Datenschutz:** keine Klarnamen, Kürzel, E-Mail-Adressen, IP-Adressen oder
Geldbeträge aus echten Daten ins PDF. Beispiele erfindest Du neutral
(„Musterkunde"), statt echte Datensätze abzuschreiben, die in dieser Session
aufgetaucht sind. Hat das Projekt eine eigene Regel dazu, gilt die.

Schreibe das Ergebnis als JSON in den Scratchpad, z. B.
`<scratchpad>/anleitung.json`:

```json
{
  "titel": "Neuerungen im Lager-Modul",
  "untertitel": "Was sich für Sie ab dem 23.10.2026 ändert",
  "datum": "2026-10-23",
  "einleitung": "Zwei bis drei Sätze: worum es geht und für wen das Blatt ist.",
  "punkte": [
    {
      "titel": "Bestellungen lassen sich duplizieren",
      "was_ist_neu": "...",
      "warum": "...",
      "schritte": ["Menü Lager öffnen", "..."],
      "hinweise": ["..."]
    }
  ],
  "glossar": [{ "begriff": "Tarif", "erklaerung": "..." }]
}
```

Nur `punkte[].titel` ist Pflicht; `datum` fehlt → heute. Ein Titel-Wunsch aus
`$ARGUMENTS` gewinnt gegen Deinen eigenen Vorschlag.

**Optional, fürs Aussehen:** `"akzentfarbe": "#EB4137"` setzt die Linien- und
Überschriftenfarbe, `"logo": "<absoluter Pfad>"` setzt ein Logo oben rechts.
Das Logo muss ein **JPEG** sein — PNG kann der Renderer nicht. Hat das
Projekt eine Hausfarbe oder ein Logo, nimm sie; sonst lass beides weg.

## Schritt 4: PDF rendern

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/render.mjs" --json=<scratchpad>/anleitung.json
```

Ist `$CLAUDE_PLUGIN_ROOT` leer, liegt das Skript neben dieser Datei unter
`../scripts/render.mjs` — suche es dort, statt aufzugeben.

Ohne `--out` landet das PDF unter `anleitungen/` im aktuellen
Arbeitsverzeichnis. Liegt dort ein Repository, wähle mit `--out` besser den
Scratchpad oder ein ignoriertes Verzeichnis, damit das Handout nicht
versehentlich eingecheckt wird. Gib dem User den **vollen Pfad** aus und
fasse in einer Zeile zusammen, welche Punkte drin sind.

Schlägt der Aufruf fehl, lies die Fehlermeldung — sie nennt das Problem
(fehlende Datei, kaputtes JSON, kein Punkt mit `titel`). Repariere die JSON
und rufe erneut auf; schreibe das PDF **nicht** von Hand und bastle keine
HTML-Datei als Notlösung.

---

## Grenzen, die Du kennen und bei Bedarf nennen solltest

- **Keine Screenshots.** Das PDF ist Text, Linien und ein optionales
  JPEG-Logo.
- **Helvetica statt Hausschrift.** Der Renderer nutzt die Standard-Schriften,
  die in jedem PDF-Betrachter stecken — der Preis dafür, dass der Mod ohne
  Installation in jedem Projekt läuft.
- **Zeichensatz WinAnsi:** Umlaute, deutsche Anführungszeichen, Gedankenstrich
  und Euro sind da. Emoji und nichtlateinische Schriften nicht — die werden
  zu `?`.
- Das Blatt ist eine **Anleitung**, kein Änderungsprotokoll für
  Stakeholder. Will der User Letzteres, sag das und frag nach, statt den
  Tonfall stillschweigend zu wechseln.
