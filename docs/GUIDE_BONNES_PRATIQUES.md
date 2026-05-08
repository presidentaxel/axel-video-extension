# Guide de bonnes pratiques - Axel Video Extension

Document interne pour garder un projet d extension Chrome lisible, maintenable et publable sur le Chrome Web Store.

Ce guide prime sur les habitudes legacy. Si un ancien fichier n est pas aligne, le remettre au propre progressivement dans les prochaines PR.

---

## 1. Carte du projet

| Zone               | Role principal |
| ------------------ | -------------- |
| `manifest.json`    | Contrat MV3 (permissions, scripts, pages, host access) |
| `src/background/`  | Orchestrateur principal (listeners reseau, etat, messaging) |
| `src/content/`     | Collecte contextuelle depuis la page active (DOM media hints) |
| `src/popup/`       | UI utilisateur rapide (liste media detectes, actions) |
| `src/options/`     | Configuration persistante de l extension |
| `src/lib/`         | Contrats partages (messages, storage helpers) |
| `assets/icons/`    | Ressources visuelles pour toolbar/store |
| `.cursor/rules/`   | Rappels de standards agent et qualite |
| `docs/`            | Documentation technique, process, checklist |

Avant de coder, identifier ou vit la regle (service worker, content script, popup, options) pour eviter les duplications.

---

## 2. Principes d architecture Chrome MV3

- Manifest V3 uniquement: pas de code MV2, pas de pages background persistantes.
- Le service worker est la source de verite runtime pour la detection media.
- Les UIs (`popup`, `options`) sont fines: elles affichent et envoient des commandes, sans logique metier lourde.
- Les content scripts ne doivent pas executer de logique sensible; ils collectent des indices de page.
- Toute communication inter-module passe par des types de messages centralises (`src/lib/messages.js`).

---

## 3. Permissions et securite

- Principe de moindre privilege: n ajouter une permission que si elle est justifiee.
- Eviter `host_permissions` trop larges si une liste cible de domaines suffit.
- Ne jamais stocker de secret en clair dans le code extension.
- Toute action de telechargement doit etre explicite et initiable par l utilisateur.
- Ne pas contourner DRM, protections techniques ou restrictions de plateforme.
- Journalisation minimale: pas de token, pas de donnees privees inutiles.

---

## 4. Qualite de code

- JavaScript clair, fonctions courtes, noms explicites.
- Fichiers petits et specialises (single responsibility).
- Pas de constantes magiques: extraire dans des constantes nommees.
- Gestions d erreurs explicites (retour `ok/error`, message exploitable).
- Garder la compatibilite Chrome stable (APIs supportees MV3).

### 4.1 Style

- Eviter les commentaires triviaux; commenter seulement les zones non evidentes.
- Preferer les modules utilitaires (`src/lib/`) aux duplications.
- Eviter la logique inline dans le HTML; utiliser des modules JS dedies.

### 4.2 Messaging

- Les messages doivent etre versionnables et predicitibles.
- Toujours valider le `type` de message avant traitement.
- Repondre avec une forme stable: `{ ok: true, data }` ou `{ ok: false, error }`.

---

## 5. UX et ergonomie extension

- Le popup doit rester rapide (ouverture instantanee).
- Afficher des statuts clairs: loading, vide, erreur, succes.
- Eviter les actions irreversibles sans confirmation.
- Les options doivent etre simples, persistantes, et faciles a reinitialiser.

---

## 6. Cadre legal et publication Google

- Le projet doit respecter les [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies/).
- N afficher/proposer que des usages conformes aux droits de l utilisateur.
- Le README et la fiche store doivent decrire les permissions avec transparence.
- Ajouter une politique de confidentialite si des donnees utilisateur sont traitees.
- Ne pas promettre des fonctionnalites qui contournent les protections de contenu.

---

## 7. Git, PR et revue

- Une PR = une intention principale (feature, fix, refactor, docs).
- Conventional commits recommandes (`feat:`, `fix:`, `docs:`, `chore:`).
- Toujours decrire le pourquoi dans la PR, pas juste le quoi.
- Si une permission est ajoutee/modifiee, expliquer le besoin exact en PR.
- Avant merge: verification manuelle extension chargee dans Chrome.

### 7.1 Checklist PR rapide

1. Changement cible, sans refacto hors scope.
2. Pas de secret dans le diff.
3. Permissions manifest minimales et justifiees.
4. Flux popup/options verifies sur un cas reel.
5. Gestion d erreur testee (reseau, tab absente, message inconnu).
6. Documentation mise a jour (`README.md`, `docs/`).

---

## 8. Evolutivite

- Toute nouvelle feature doit preciser son module principal (background/content/popup/options).
- Si une logique est complexe, creer un dossier dedie sous `src/` plutot que grossir un fichier unique.
- Ajouter un court paragraphe d architecture dans `README.md` pour les gros changements.
- Ajouter/mettre a jour des tests JS (Vitest) et, pour les verifications de structure/projet, des tests Python executes dans le venv.

---

## 9. En cas de doute

- Prioriser lisibilite, securite, et conformite Chrome Web Store.
- Aligner le style avec les fichiers proches deja valides.
- Si un arbitrage est ambigu, documenter la decision dans la PR.

---

*Derniere mise a jour: guide aligne sur le projet Axel Video Extension (Chrome MV3).*