# Coach Aïmen — cockpit fitness quotidien

PWA de recomposition corporelle que j'utilise tous les jours : musculation, nutrition (budget courses, sans porc), sommeil, pas et discipline. Un seul écran, le cockpit `CoachV2App`, avec 6 onglets : **Jour, Repas, Exos, Progrès, Plan, Bilan**.

En ligne : [coach.aimenznaidi.party](https://coach.aimenznaidi.party) (les données sont protégées par un code de synchronisation).

## Points clés

- **Local d'abord, synchronisé ensuite** : les données vivent dans `localStorage`, puis se synchronisent avec une base Cloudflare D1 via un Worker. La synchro fusionne les états (union des jours, repas et séances) pour ne rien perdre entre deux appareils.
- **Logique métier pure** dans `src/lib/v2/`, sans dépendance à React, couverte par des tests Vitest.
- **Règle de progression** automatique (« +1 rep avant +2,5 kg »), rattrapage des séances manquées, jours de repos.
- **Nutrition** : recettes, menu de la semaine, liste de courses chiffrée, frigo, suivi des tickets de caisse sur des périodes de 4 semaines.
- **Saisie depuis une conversation** : un mécanisme d'import idempotent (`withSeeded…` dans `history.ts` et `purchases.ts`) applique une seule fois les repas, pesées, séances ou tickets dictés, sans jamais écraser une saisie faite dans l'app ni faire revenir une donnée supprimée.

## Données personnelles

Ce dépôt est la version publique du projet. Mes données réelles (repas, pesées, sommeil, séances, dépenses) ne sont pas publiées : les listes d'import sont vides ici, et les tests utilisent des jeux de données fictifs.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript strict
- CSS maison (`globals.css`), variables CSS, mode sombre automatique — pas de Tailwind
- lucide-react pour les icônes
- Vitest pour les tests (`src/lib/v2/__tests__/`)

## Structure active

```
src/
  app/                 Routes : / (cockpit), /checkin, /progression, /musculation, /nutrition
  components/v2/       CoachV2App.tsx (cockpit), WorkoutLogger.tsx (journal de séance),
                       NutritionTab.tsx (repas + courses), ExerciseLibrary.tsx (bibliothèque),
                       DataPanel.tsx (sauvegarde + rappels)
  lib/v2/              Logique métier pure (portable iOS) :
                       coachPlan.ts (profil + cibles sourcées OMS/ACSM/ISSN),
                       metrics.ts (score /100, streak, bilan hebdo),
                       body.ts (masse maigre/grasse, Navy, tendances),
                       training.ts (volume, 1RM estimé, progression, records),
                       nutrition.ts (aliments, recettes, menu, liste de courses),
                       backup.ts (instantanés quotidiens), reminders.ts (notifications),
                       exercises.ts (chargement + filtres bibliothèque),
                       storage.ts (localStorage), types.ts
public/data/           exercises.json (1 299 exercices FR, ~0,9 Mo) + foods.json (aliments)
worker/                Worker Cloudflare : fichiers statiques + API de synchronisation (D1)
migrations/            Schéma D1
public/sw.js           Service worker : cache hors-ligne
scripts/               Régénération de la bibliothèque (voir build-exercises.md)
```

## Bibliothèque d'exercices

1 299 exercices en français, filtrables par zone, muscle, matériel, et par
« Chez moi » (818 réalisables sans salle). Chaque fiche donne le GIF d'exécution
et les étapes détaillées.

- **Données** : [hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset), licence MIT.
- **Médias** : © [Gym visual](https://gymvisual.com/), chargés à la demande depuis le CDN jsDelivr — rien n'est copié dans le dépôt. L'attribution affichée dans chaque fiche est exigée par la licence.
- **Régénération** : `scripts/build-exercises.md`.

## Composition corporelle

Onglet **Jour** pour saisir (poids, tour de taille, cou, poitrine, épaules, bras,
cuisse, % de masse grasse mesuré), onglet **Progrès** pour lire la tendance :
masse maigre et masse grasse en kg, courbes d'évolution, variations à 30 et
90 jours.

Sans balance à impédance, le taux de gras est estimé par la formule US Navy à
partir du tour de taille, du tour de cou et de la hauteur (±3 à 4 points en
absolu, mais fiable en tendance). Un pourcentage mesuré, s'il est saisi, prend
le dessus. Une mesure par semaine suffit — même jour, le matin à jeun.

## Journal de séance

Chaque séance se logue exercice par exercice : séries, répétitions, charge, RIR.
L'app calcule le tonnage, les séries dures, le 1RM estimé (Epley) et les records.

À chaque exercice, elle rappelle ce que tu avais fait la fois précédente et
applique la règle de progression du plan : monter en répétitions jusqu'à 12, puis
+2,5 kg et retour à 8. Sans cet historique, « +1 rep avant +2,5 kg » est
inapplicable.

## Repas et courses

Onglet **Repas** : 16 recettes (toutes en 20 minutes maximum, sans porc) à logger
en un clic, ou n'importe quel aliment à la portion — les macros se calculent
seules. Le menu de la semaine tient 2542 kcal et 157 g de protéines en moyenne,
et génère la liste de courses avec les prix Match ou Auchan, arrondie au
conditionnement.

Prix issus de la base V1 : indicatifs, à confirmer en rayon.

## Sauvegarde

Instantané automatique chaque jour (anneau de 14), restauration en un clic,
export et import de fichier. Un rappel apparaît si aucun export n'a été fait
depuis 7 jours — les instantanés vivent dans le navigateur et ne survivent pas à
un vidage de profil.

## Accès mobile

Voir [`DEPLOIEMENT.md`](DEPLOIEMENT.md). L'app est une PWA installable, avec
service worker : la coquille, les données et les GIF consultés fonctionnent
hors-ligne. La synchronisation entre appareils passe par le Worker Cloudflare
(secret `SYNC_TOKEN`).

## Cibles quotidiennes (sourcées)

2250 kcal (sèche légère) · 140 g protéines · 4 séances/semaine · 8000 pas · 7h30 sommeil · 2,2 L eau

## Commandes

```bash
npm run dev        # développement
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm test           # vitest
npm run build      # build production
```
