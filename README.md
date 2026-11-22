# GymLog – Workout-Tracker fürs iPhone (PWA)

Workouts tracken, Routinen verwalten und ausführliche Statistiken zu Kraft, Volumen und
Trainingstagen sehen. Die App läuft komplett offline, ohne App Store und ohne Apple-Developer-Lizenz.
Alle Daten bleiben lokal auf dem Gerät (IndexedDB).

## Funktionen

- **Workout-Tracking**: Sätze mit Gewicht/Wiederholungen (bzw. Distanz/Zeit), Satztypen
  (Aufwärmen, Drop-Satz, bis Versagen), „Vorher“-Werte der letzten Einheit, Pausentimer mit Ton,
  Notizen, Übungen sortieren/ersetzen. Ein laufendes Workout übersteht das Schließen der App.
- **Routinen**: Vorlagen anlegen, aus vergangenen Workouts erzeugen, mit einem Tipp starten.
- **Vergangene Workouts nachtragen** und bestehende bearbeiten.
- **Statistik**
  - Übersicht: Workouts, Volumen, Sätze, Wiederholungen, Zeit, jeweils im Vergleich zum Vorzeitraum,
    Serien (Wochen in Folge), Volumen und Workouts pro Woche/Monat, Trainingsdauer, Splits
  - Kraft: geschätztes 1RM pro Übung, Trend (kg/Monat, % im Zeitraum) für alle Übungen
  - Volumen: Sätze pro Muskelgruppe und Woche, Verlauf je Muskelgruppe, Volumen pro Übung/Workout-Typ,
    Wiederholungsbereiche, Satztypen
  - Kalender: Heatmap der Trainingstage, Monatstabelle, Wochentage, Tageszeit, Jahresvergleich
  - Rekorde: PR-Verlauf, letzte Rekorde, Bestwerte aller Übungen
- **Übungsdetails**: 1RM/Max-Gewicht/Volumen/Wiederholungen im Verlauf, Wiederholungs-Maxima (1–12),
  persönliche Rekorde, komplette Historie, Muskelgruppe/Typ anpassen, Übungen umbenennen bzw. zusammenführen.
- **Daten**: CSV-Import (mit Duplikaterkennung), CSV-Export, JSON-Backup und -Wiederherstellung.
- **Balance-Analyse**: Push/Pull, horizontal/vertikal, Ober-/Unterkörper, Quadrizeps/Beinbeuger,
  vordere/hintere Schulter, Bizeps/Trizeps (Volumen) sowie Kraftverhältnisse (1RM) und Kraft relativ
  zum Körpergewicht, mit konkreten Empfehlungen. Dazu Muskel-Netzdiagramm und Körperkarte.
- **Weitere Diagramme**: Trainingsbelastung (akut:chronisch), Trainingsdichte, Hauptübungen indexiert,
  Intensitätsverteilung (% vom 1RM), Muskelgruppen gestapelt, Jahresrückblick.
- **Heller und dunkler Modus** (Profil → Darstellung; Hell, Dunkel oder System).
- **Gamification**: eigene Kämpfer-Figur, die mit der Streak in 8 Stufen wächst (Killstreaks: Blutrünstig, Gnadenlos, Skrupellos, Unnachgiebig, Brutal, Nuklear, Unaufhaltsam) (Streak = Wochen mit
  erreichtem Wochenziel), Streak-Warnung, Kampfkraft, Level/XP, Wochen-Aufgaben, Abzeichen.
- **PR-Effekte**: Bei einem neuen Rekord wird die Satzzeile orange-gelb wie Feuer, dazu 3 Sekunden
  Einblendung mit Power-up-Sound (abschaltbar).
- **AI-Mode** (lokaler Algorithmus, abschaltbar): Gewichts- und Wiederholungsvorschläge pro Übung
  (doppelte Progression, gelernte Gewichtsschritte, Deload- und Wiedereinstiegs-Erkennung),
  Stagnationsanalyse mit Tipps, Erholungsmodell pro Muskel und Empfehlung, wann und was du als Nächstes trainierst.
- **Cardio geführt**: Grundlage, 4×4, 30/30, Pyramide, Steigerung, Schwelle, 12-3-30, Regeneration für
  Laufband/Rad/Crosstrainer/Rudergerät. Vollbild mit Geräte-Einstellungen, Zonen, Countdown-Tönen
  und Sprachansage.
- **Mobility geführt**: 6 Routinen mit automatischem Timer, Seitenwechsel und Atem-Animation.
- **Eigener Kämpfer**: männlich oder weiblich, Haarfarbe, Kleidung (4 Stile, 8 Farben) und 3 Gesichter
  wählbar (Profil → Anpassen). Höhere Stufen verwandeln die Figur automatisch; auch die Übungsdemos nutzen deinen Look.
- **Körpergewicht-Verlauf** (Profil → Körpergewicht) und Umschalter **kg / × KG**: Kraft absolut oder relativ
  zum damaligen Körpergewicht (Übungsdetails, Statistik → Kraft, Rekorde).

## Arena (Demo)

Der Tab **Arena** zeigt den Gruppen-Modus: Saison-Wertung (Punkte für Fleiß), Ewige Tabelle (Workouts, Volumen,
Trainingszeit, Cardio, Streak, Maximalkraft absolut und pro Körpergewicht), Challenges und animierte
5-Sekunden-Kämpfe der Kämpfer – wer im gewählten Wert besser ist, gewinnt.

Ohne Server läuft die Arena als **Demo mit zwei NPCs** (Kai und Mia), deren Workouts lokal passend zu deinen
eigenen Werten erzeugt werden. Demo-Challenges werden nur auf dem Gerät gespeichert. Abschaltbar unter
Profil → „Arena-Demo mit 2 NPCs“. Für echte Gruppen mit Freunden gibt es den Server im Branch `distribution`.

## Auf GitHub Pages veröffentlichen

> **Wichtig:** `workout_data.csv` steht in der `.gitignore` und wird **nicht** hochgeladen.
> GitHub Pages ist öffentlich. Deine Trainingsdaten importierst du stattdessen direkt auf dem iPhone.

1. Dateien committen und pushen:
   ```bash
   git add .
   git commit -m "GymLog PWA"
   git push
   ```
2. Auf GitHub im Repository: **Settings → Pages → Build and deployment**
   - Source: **Deploy from a branch**
   - Branch: **main**, Ordner **/ (root)** → **Save**
3. Nach 1–2 Minuten ist die App erreichbar unter
   `https://<dein-github-name>.github.io/<repo-name>/`

> Hinweis: Bei einem kostenlosen GitHub-Account muss das Repository für GitHub Pages **öffentlich** sein.
> Das ist unproblematisch, weil nur der App-Code darin liegt, nicht deine Daten.

## Auf dem iPhone installieren

1. Die GitHub-Pages-URL in **Safari** öffnen (nicht in Chrome, sonst fehlt „Zum Home-Bildschirm“ als Web-App).
2. Unten auf **Teilen** (Quadrat mit Pfeil) tippen, dann **„Zum Home-Bildschirm“** und **Hinzufügen**.
3. GymLog vom Home-Bildschirm starten: Die App läuft im Vollbild und funktioniert danach auch offline.

## Alte Workouts importieren

1. Die `workout_data.csv` aufs iPhone bringen, z. B. per **AirDrop** in die Dateien-App oder über **iCloud Drive**.
2. In GymLog: **Profil → CSV importieren** (oder beim ersten Start „CSV importieren“) und die Datei auswählen.
3. Auf Wunsch werden automatisch Routinen aus deinen letzten Workouts erstellt.

Tipp: Unter **Profil → Körpergewicht** dein Gewicht eintragen. Dann werden Klimmzüge, Dips usw.
korrekt ins 1RM und Volumen eingerechnet.

## Backups

Die Daten liegen nur in der App auf diesem iPhone. Wenn du die App vom Home-Bildschirm löschst,
sind sie weg. Erstelle deshalb regelmäßig unter **Profil → Backup erstellen** eine Sicherung
und speichere sie in iCloud Drive. Die App erinnert dich nach 14 Tagen ohne Backup.

## Updates veröffentlichen

Nach Code-Änderungen in `sw.js` den Wert `CACHE` erhöhen (z. B. `gymlog-v1.0.1`) und `js/version.js`
anpassen, dann pushen. Die App lädt die neue Version im Hintergrund und nutzt sie ab dem nächsten Start.
Deine Daten bleiben dabei erhalten.

## Lokal testen

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

## Technik

Vanilla JavaScript (ES-Module) ohne Build-Schritt, eigene SVG-Charts, IndexedDB als Speicher,
Service Worker für den Offline-Betrieb.
