# Roadmap V3 iPhone native

## Direction recommandée

Expo + React Native est le meilleur chemin : même langage, composants réutilisables conceptuellement, migration progressive de la logique `src/lib/v2`.

## Étape 1 - Stabiliser la V2 web

- Utiliser l'app 2 à 4 semaines.
- Ajuster les cibles réelles : calories, protéines, volume séance, sommeil.
- Ajouter export/import V2 complet.
- Nettoyer ou archiver les composants legacy offloadés.
- Remettre un `npm install` propre hors iCloud si possible.

## Étape 2 - Extraire un package métier partagé

- Déplacer `src/lib/v2` vers `packages/coach-core`.
- Ajouter tests unitaires indépendants du framework.
- Remplacer `localStorage` par une interface `CoachRepository`.
- Implémentations :
  - Web : `localStorage`.
  - iOS : `AsyncStorage` ou SQLite.

## Étape 3 - Créer l'app Expo

- `apps/mobile` avec Expo.
- Navigation : Today, Plan, Progress, Check-in.
- UI native : sliders, toggles, segmented controls, haptics légers.
- Stockage local chiffrable plus tard si données sensibles.

## Étape 4 - Expérience iPhone

- Widgets iOS : score du jour, protéine restante, prochaine séance.
- Notifications locales : poids matin, protéines midi, séance soir, check nuit.
- Raccourcis iOS : "Log repas", "Minimum day".
- Apple Health plus tard : poids, pas, sommeil, entraînements.

## Étape 5 - Sync et robustesse

- Choisir Supabase ou iCloud/CloudKit.
- Modèle offline-first.
- Résolution de conflit par date et `updatedAt`.
- Export complet en JSON.

## Étape 6 - Coach intelligent

- Génération locale de feedback par règles.
- IA optionnelle seulement si clé configurée.
- Garde-fous : pas de déficit extrême, pas de volume excessif, pas de recommandations médicales.

