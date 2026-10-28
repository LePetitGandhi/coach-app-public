# Déploiement — accéder à l'app depuis le téléphone

Tant que l'app tourne en `localhost` sur le Mac, tu ne peux rien logger depuis
ton téléphone. C'est le vrai frein à l'adoption : personne n'ouvre un ordinateur
pour saisir un repas. Cette page règle ça.

L'app est hébergée sur Cloudflare (Worker + fichiers statiques + base D1) à
l'adresse **https://coach.aimenznaidi.party** (repli : l'URL `*.workers.dev`
affichée par le déploiement).

## Déployer

```bash
cd ~/Desktop/"Coach perso nutritionniste"/coach-app
npx wrangler login     # une seule fois
npm run cf:deploy      # crée la base si besoin, build, déploie
```

Arrête `npm run dev` avant (le build et le serveur de dev partagent `.next`).
Au premier déploiement, le script affiche le **code de synchronisation** :
note-le, il ne sera plus affiché. Pour en changer :
`npx wrangler secret put SYNC_TOKEN`.

## Déploiement automatique (recommandé)

Cloudflare peut construire et publier l'app à chaque `git push` :

1. dash.cloudflare.com → **Workers & Pages** → **coach-aimen** → **Settings** →
   **Builds** → **Connect** → GitHub → dépôt `LePetitGandhi/coach-app`, branche `main`.
2. Build command : `npm run build` · Deploy command : `npx wrangler deploy`.
3. Enregistrer. Chaque push sur `main` redéploie ; les logs sont dans l'onglet
   **Deployments**.

Le secret `SYNC_TOKEN` et la base D1 ne bougent pas. Seule une nouvelle
migration SQL (`migrations/`) demande encore `npm run cf:deploy` en local.

## Synchroniser téléphone et Mac

Sur chaque appareil, dans la version en ligne : Plus → Réglages → Synchronisation →
colle le code. Si le serveur a déjà des données, elles remplacent celles de
l'appareil qu'on connecte. Ensuite tout est automatique : les saisies partent
quelques secondes après, et l'app récupère la dernière version à l'ouverture.
Hors-ligne, les saisies restent sur l'appareil et partent au retour du réseau.

Conflit (deux appareils modifiés hors-ligne) : la modification la plus récente
gagne. Le serveur garde une copie par heure (60 dernières) dans
`app_state_history` en cas de pépin.

## Installer sur l'écran d'accueil

**iPhone (Safari uniquement — Chrome iOS ne sait pas installer de PWA)**

1. Ouvre l'URL dans Safari
2. Bouton Partager → *Sur l'écran d'accueil*
3. L'icône apparaît, l'app s'ouvre en plein écran sans barre d'adresse

**Android (Chrome)** — une bannière « Installer » apparaît, ou menu ⋮ →
*Installer l'application*.

## Ce qui marche hors-ligne

Le service worker (`public/sw.js`) met en cache :

- la coquille de l'app — elle s'ouvre sans réseau ;
- `data/exercises.json` et `data/foods.json` — les 913 ko d'exercices ne sont
  téléchargés qu'une fois ;
- les GIF d'exercices consultés, jusqu'à 400 fichiers.

Donc en salle, même avec un réseau capricieux, la séance se logue.

## Ce qui ne marche pas hors-ligne

Un GIF jamais ouvert auparavant. Il apparaîtra dès que le réseau revient.

