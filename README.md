# Axel Video Extension

Extension Chrome (Manifest V3) pour detecter des flux video et lancer un telechargement MP4 via:

- URL directe (MP4/WebM) quand disponible
- reconstruction locale "best effort" depuis un manifest HLS (`.m3u8`)

> Utilisation uniquement sur des contenus que vous avez le droit d acceder et de telecharger.

---

## Fonctionnalites V2

- Detection media par observation reseau (`webRequest`) et indices DOM
- Liste des medias detectes par onglet dans le popup
- Action **Download MP4** par element detecte
- Support de deux modes de telechargement:
  - `direct`: telechargement natif de l URL source
  - `reconstructed`: reconstruction locale depuis segments HLS puis telechargement
- Parametres utilisateur persistants (options)

---

## Arborescence

```text
axel-video-extension/
|- .cursor/
|  \- rules/
|     \- extension-guidelines.mdc
|- assets/
|  \- icons/
|     \- .gitkeep
|- docs/
|  \- GUIDE_BONNES_PRATIQUES.md
|- src/
|  |- background/
|  |  \- service-worker.js
|  |- content/
|  |  \- content-script.js
|  |- lib/
|  |  |- messages.js
|  |  \- storage.js
|  |- options/
|  |  |- options.css
|  |  |- options.html
|  |  \- options.js
|  \- popup/
|     |- popup.css
|     |- popup.html
|     \- popup.js
|- .gitignore
|- LICENSE
|- manifest.json
\- README.md
```

---

## Architecture rapide

| Zone | Role |
| --- | --- |
| `manifest.json` | Contrat MV3 (permissions, scripts, pages) |
| `src/background/service-worker.js` | Orchestrateur principal: detection, state, telechargement |
| `src/content/content-script.js` | Collecte des indices video depuis la page |
| `src/popup/*` | UI de consultation et action de telechargement |
| `src/options/*` | Preferences utilisateur persistantes |
| `src/lib/messages.js` | Contrats de messages inter-modules |
| `src/lib/storage.js` | Wrapper `chrome.storage.local` |

---

## Installation locale

1. Ouvrir `chrome://extensions`
2. Activer **Developer mode**
3. Cliquer **Load unpacked**
4. Selectionner le dossier `axel-video-extension`

---

## Tests (batterie renforcee)

### JavaScript (Vitest + coverage)

- Installer deps: `npm install`
- Lancer tous les tests: `npm run test`
- Coverage HTML: `coverage/index.html`

### Python (Pytest dans venv)

- Creation du venv + installation:
  - PowerShell: `.\scripts\setup_venv.ps1`
- Lancer les tests Python:
  - `.\.venv\Scripts\python.exe -m pytest tests/python -q`

### Tout lancer en une commande

- `.\scripts\run_all_tests.ps1`

---

## Limites actuelles

- La reconstruction HLS en MP4 est **best effort**:
  - fonctionne mieux sur des playlists/segments compatibles MP4 fragmentes
  - peut echouer selon DRM, CORS, tokens expires, ou format de segment non compatible
- Pas de transcodage avance (pas de ffmpeg integre dans cette version)
- En contexte service worker, `URL.createObjectURL` n est pas disponible. La V2 utilise un fallback Data URL pour finaliser le telechargement reconstruit.

---

## Conformite et publication

- Respecter les [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies/)
- Respecter les droits d auteur, les CGU des plateformes et la legislation locale
- Expliquer chaque permission dans la fiche de publication

---

## Roadmap proposee

- Parser HLS plus robuste (master playlists, audio/video tracks)
- Gestion fine des noms de fichiers et metadonnees
- Support de strategie fallback quand reconstruction locale impossible
- Tests unitaires sur parser et logique de deduplication

---

## Licence

MIT - voir `LICENSE`.
