# Klangfeld

Ein spielbarer Sound-Generator mit visueller Oberfläche, gemacht fürs Handy.
Man spielt mit den Fingern auf einer Fläche, und jeder Klang hat seinen eigenen Look.

## Bedienung

- **Links nach rechts:** Tonhöhe (zwei Oktaven ab A2)
- **Unten nach oben:** Klangfarbe (dumpf bis hell, bei Robotik Vokal "u" bis "i")
- **Mehrere Finger:** mehrere Töne gleichzeitig (bis zu 6)
- **Tonleiter / Frei:** einrasten auf die Moll-Pentatonik oder stufenlos gleiten

## Klangfarben

| Name | Inspiriert von | Klang | Look |
|---|---|---|---|
| Robotik | Kraftwerk | Formant-Filter, roboterhaft "sprechend" | Raster, Fadenkreuz, digitale Wellenform |
| Psychedelik | Tame Impala | Schwebende Flächen, Phaser, Chorus, viel Hall | Fliessende Farben, wirbelnde Partikel |
| Industrial | Rammstein | Verzerrter Power-Chord (Grundton, Quinte, Unteroktave) | Rot-schwarz, Funken, Erschütterung |
| Lo-Fi Dub | Gorillaz | Leiernder Vintage-Klang, Dub-Echo, Bandrauschen | Filmkorn, VHS-Farbversatz, Echo-Ringe |

Alle Klänge werden live mit der Web Audio API erzeugt. Es gibt keine Samples und damit keine Lizenzfragen.

## Lokal starten

Ein einfacher Webserver genügt (Module funktionieren nicht über `file://`):

```sh
python3 -m http.server 8000
```

Dann `http://localhost:8000` öffnen. Zum Testen auf dem Handy im selben WLAN die IP des Computers verwenden.
Hinweis: Die Installation als App (PWA) und der Offline-Modus funktionieren nur über HTTPS oder `localhost`.

## Bekannte Einschränkungen

- **iPhone:** Der Stummschalter kann Web-Audio stummschalten. Ab Safari 17 versucht die App das zu umgehen; bei älteren Versionen hilft nur, den Schalter umzulegen.
- Die Klänge sind von den genannten Acts inspiriert, sie kopieren sie nicht. Besonders Industrial kann eine echte Gitarrenwand nur andeuten.

## Aufbau

- `js/engine.js` – Klangmaschine und die vier Klangfarben
- `js/visuals.js` – Visualisierung, ein Theme pro Klangfarbe
- `js/app.js` – Bedienung, Multitouch, Einstellungen
- `sw.js` – Offline-Cache (bei Änderungen `VERSION` erhöhen)

## Nächste Schritte (geplant)

1. ~~Berühren und Visualisierung~~
2. Formen platzieren, die von selbst Klänge auslösen
3. Regler bzw. Module für den Klang
