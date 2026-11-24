# Gym – Workout-Tracker fürs iPhone (PWA)

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
- **AI-Coach** (DEMO, getrennt für Workouts und Cardio in den Einstellungen): fragt nach Ziel (1RM, Körpergewicht,
  Muskelaufbau, stärker werden bzw. Sportart + Distanz + Zielzeit), Einheiten pro Woche, Stand und Zeitraum, ordnet
  das Ziel ein (realistisch / ambitioniert) mit Gegenvorschlag zum Übernehmen und erstellt einen flexiblen Wochenplan
  (Split nach Wunsch, Übungen tauschbar, verschieben/auslassen). Der Plan passt sich automatisch an Pausen, Krankheit
  und Fortschritt an. Auf der Startseite: Plan pro Wochentag und Ernährungs-Richtwerte (kcal & Makros).
- **Strava**: läuft komplett auf dem Handy. Eigene Strava-API-App (Client-ID + Secret) unter Profil → Verbindungen;
  Secret, Zugang und Aktivitäten bleiben auf dem Gerät. Der Server reicht bei der Anmeldung nur den einmaligen
  Freigabe-Code weiter. In die Arena geht nur die EP-Grundlage (Start + Dauer) von Aktivitäten ab der Verbindung.
- **Ein Punktesystem** (`js/xp.js`) für Level, Arena und Streak: EP pro Workout, Trainingsminute, Rekord, Wochenziel
  und Challenge-Sieg. Es zählt nur, was in der App getrackt oder nachgetragen wurde – Importe und Strava von vor der
  Verbindung erscheinen nur in der privaten Statistik. Rekorde zählen neu ab dem ersten zählenden Workout.
- **Mobility-Coach** (wie Cardio): Fokusbereiche, Wunschziel (z. B. Spagat, tiefe Hocke), Einheiten passend zum
  Training im Wochenplan (Hüfte nach dem Beintag, Schultern nach Push/Pull), sanfte Steigerung, eigene Routinen im
  Baukasten, „Anpassen“ für jedes Programm, frei eintragen.
- **Ernährung** (optional, Einstellungen → App personalisieren): Tagebuch mit Mahlzeiten, Suche in Open Food Facts
  (über den Server, zwischengespeichert), eigener Barcode-Scanner (EAN/UPC, ohne fremde Bibliothek), Favoriten,
  eigene Produkte und Gerichte, alle Nährwerte; Ziel und Verbrauch aus Körperdaten, Training und Coach. Nur privat.
- **Live-Arena**: Wer gerade trainiert, steht in der Arena und macht seine Übung, alle anderen sitzen auf der Tribüne.
  Nur in Gruppen, in denen „Live zeigen“ an ist (Status nur im Arbeitsspeicher des Servers, nach 90 s ohne Meldung weg).
- **Mitteilung „Pause vorbei“** per Web-Push vom eigenen Server (VAPID + RFC 8291, ohne Fremdbibliothek; iPhone nur mit
  Gym auf dem Home-Bildschirm). Optional **Workout auf dem Sperrbildschirm** (Media Session; pausiert dafür Musik).
- **Schritte aus Apple Health** über einen iOS-Kurzbefehl mit eigenem Schlüssel, der nur Schritte melden kann
  (Profil → Verbindungen → Schritte). Fließen in den Kalorienverbrauch ein, bleiben privat.
- **Events**: Weihnachten, Advent, Nikolaus, Silvester, Neujahr, Valentinstag, Fasching, Ostern, 1. Mai, Oktoberfest,
  Tag der Deutschen Einheit, Halloween, St. Martin – mit Deko, Begrüßung und passenden Mützen (aus im Simple Mode).
- **Abzeichen** (über 100, mit Medaillen-Stufen) schalten **Objekte für den Kämpfer** frei (Hüte, Brillen, Hanteln …).
- **Cardio geführt**: Grundlage, 4×4, 30/30, Pyramide, Steigerung, Schwelle, 12-3-30, Regeneration für
  Laufband/Rad/Crosstrainer/Rudergerät. Vollbild mit Geräte-Einstellungen, Zonen, Countdown-Tönen
  und Sprachansage.
- **Mobility geführt**: 6 Routinen mit automatischem Timer, Seitenwechsel und Atem-Animation.
- **Eigener Kämpfer**: männlich oder weiblich, Haarfarbe, Kleidung (4 Stile, 8 Farben) und 3 Gesichter
  wählbar (Profil → Anpassen). Höhere Stufen verwandeln die Figur automatisch; auch die Übungsdemos nutzen deinen Look.
- **Körpergewicht-Verlauf** (Profil → Körpergewicht) und Umschalter **kg / × KG**: Kraft absolut oder relativ
  zum damaligen Körpergewicht (Übungsdetails, Statistik → Kraft, Rekorde).

## Arena (Demo)

Der Tab **Arena** zeigt den Gruppen-Modus: Jahres-Saison mit Monatssiegern, Könige (Workout, Cardio, Mobility),
Ewige Tabelle, Übungs-Vergleich, Challenges und animierte 5-Sekunden-Kämpfe – wer im gewählten Wert besser ist, gewinnt.

Ohne Server läuft die Arena als **Demo mit zwei NPCs** (Kai und Mia), deren Workouts lokal passend zu deinen
eigenen Werten erzeugt werden. Abschaltbar unter Profil → „Arena-Demo mit 2 NPCs“.

## Gruppen-Server (Arena, Challenges, Konten)

Im Ordner `server/` liegt zusätzlich ein kleiner Server, den jede Freundesgruppe selbst betreiben kann –
am einfachsten auf einem Raspberry Pi daheim. Der Server liefert die App selbst aus – **privat**: ohne Anmeldung
gibt es nur die Login-Seite, der App-Code kommt erst nach dem Login (Cookie). Daten der Gruppe in SQLite (wenige MB).

- **Umzug von GitHub Pages**: Die alte App zeigt „Gym zieht um“. Ein Tipp sichert alles (Workouts, Routinen,
  Einstellungen, eigene Übungen) und öffnet die neue App mit einem Einmal-Link – ohne Passwort.
- **Privates Repo auf dem Pi**: `bash deploy/private-repo.sh` richtet einen Lese-Schlüssel (Deploy Key) ein.
- **Schutz**: Bremsen pro IP, Gerät und Benutzername, gefälschte `X-Forwarded-For` werden ignoriert,
  kleine Anfragen außer beim Abgleich.

- **Konten mit Benutzername und Passwort**, die der Admin festlegt. Keine offene Registrierung.
  Jedes Gerät meldet sich einmal an und bleibt angemeldet.
- **Offline-first-Sync** zwischen Handy und Server, auch über mehrere Geräte.
- **Arena**, **Challenges**, **Tickets** (Wünsche & Fehler) für die ganze Gruppe.
- **Mehrere Gruppen** (Freundeskreise): gründen, mit Code beitreten, Freunde einladen, austreten. Jede Gruppe hat ihre
  eigene Arena und eigene Challenges. **Pro Gruppe** stellt jede Person ein, was sie teilt (komplette Workouts,
  Übersicht oder nur Zahlen; Körpergewicht; Live-Status).
- **Freunde** finden und annehmen – nur unter den Konten auf dem eigenen Server.
- **Admin-Dashboard** unter `/admin` (nur für Admins, getrennt von der App): Nutzer, Gruppen, EP-Balance mit Vorschau,
  Übungen (inkl. eigener Übungen für alle), Tickets, Funktionen.
- Technik: Node.js ≥ 22.13 mit eingebautem SQLite, keine weiteren Pakete. HTTPS z. B. kostenlos über Tailscale Funnel.

Schritt-für-Schritt-Anleitung: [selfhost.html](selfhost.html). Kurzfassung für einen Pi mit Ubuntu 24.04:

```bash
git clone https://github.com/maxrci/gymapp.git ~/gym && cd ~/gym
bash deploy/pi-setup.sh                      # Node.js 24 + Dienst „gym“
sudo tailscale funnel --bg 8080              # öffentliche https://…ts.net-Adresse (nach tailscale up)
sudo nano /etc/gym.env                       # PUBLIC_URL eintragen, dann: sudo systemctl restart gym
bash deploy/cli.sh admin "Dein Name" deinname
```

## Auf GitHub Pages veröffentlichen (veraltet – die App läuft jetzt privat vom eigenen Server)

> **Wichtig:** `workout_data.csv` steht in der `.gitignore` und wird **nicht** hochgeladen.
> GitHub Pages ist öffentlich. Deine Trainingsdaten importierst du stattdessen direkt auf dem iPhone.

1. Dateien committen und pushen:
   ```bash
   git add .
   git commit -m "Gym PWA"
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
3. Gym vom Home-Bildschirm starten: Die App läuft im Vollbild und funktioniert danach auch offline.

## Alte Workouts importieren

1. Die `workout_data.csv` aufs iPhone bringen, z. B. per **AirDrop** in die Dateien-App oder über **iCloud Drive**.
2. In Gym: **Profil → CSV importieren** (oder beim ersten Start „CSV importieren“) und die Datei auswählen.
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
