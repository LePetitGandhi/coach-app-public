#!/usr/bin/env bash
# Déploiement Cloudflare (Worker + D1) — à lancer depuis coach-app :
#   npm run cf:deploy
# Idempotent : relançable à chaque mise à jour.
set -euo pipefail
cd "$(dirname "$0")/.."

# Version figée : « wrangler@4 » peut pointer vers une version annoncée mais pas encore téléchargeable.
WRANGLER_VERSION="${WRANGLER_VERSION:-4.141.0}"
W="npx --yes wrangler@${WRANGLER_VERSION}"

echo "▶ 1/5 Base D1"
# Connexion Cloudflare expirée ? On s'arrête net avec la marche à suivre.
if $W whoami 2>&1 | grep -qiE "not authenticated|authentication error|\[ERROR\]"; then
  echo "✗ Connexion Cloudflare expirée. Lance :  npx wrangler@${WRANGLER_VERSION} login   puis relance npm run cf:deploy"
  exit 1
fi
if ! LIST=$($W d1 list --json 2>/dev/null); then
  echo "✗ Impossible de lister les bases D1. Lance :  npx wrangler@${WRANGLER_VERSION} login   puis relance."
  exit 1
fi
if ! printf '%s' "$LIST" | node -e 'const l=JSON.parse(require("fs").readFileSync(0,"utf8"));process.exit(l.some(d=>d.name==="coach-aimen-db")?0:1)'; then
  $W d1 create coach-aimen-db
  LIST=$($W d1 list --json)
fi
DB_ID=$(printf '%s' "$LIST" | node -e 'const l=JSON.parse(require("fs").readFileSync(0,"utf8"));const d=l.find(d=>d.name==="coach-aimen-db");process.stdout.write(d.uuid||d.id||"")')
if [ -z "$DB_ID" ]; then echo "✗ Impossible de lire l'identifiant de coach-aimen-db"; exit 1; fi
node -e '
const fs=require("fs");const c=JSON.parse(fs.readFileSync("wrangler.json","utf8"));
c.d1_databases[0].database_id=process.argv[1];fs.writeFileSync("wrangler.json",JSON.stringify(c,null,2)+"\n");' "$DB_ID"
echo "  coach-aimen-db = $DB_ID"

echo "▶ 2/5 Tables"
CI=1 $W d1 migrations apply coach-aimen-db --remote

echo "▶ 3/5 Build (export statique)"
rm -rf out
npm run build

echo "▶ 4/5 Déploiement"
if ! $W deploy; then
  echo "⚠ Échec avec le domaine coach.aimenznaidi.party — nouvel essai sur workers.dev seulement."
  node -e '
const fs=require("fs");const c=JSON.parse(fs.readFileSync("wrangler.json","utf8"));
delete c.routes;fs.writeFileSync(".wrangler-nodomain.json",JSON.stringify(c,null,2));'
  $W deploy --config .wrangler-nodomain.json
fi

echo "▶ 5/5 Code de synchronisation"
if $W secret list 2>/dev/null | grep -q 'SYNC_TOKEN'; then
  echo "  Déjà configuré."
else
  TOKEN=$(node -e 'process.stdout.write(require("crypto").randomBytes(18).toString("base64url"))')
  printf '%s' "$TOKEN" | $W secret put SYNC_TOKEN
  echo
  echo "════════════════════════════════════════════════"
  echo "  CODE DE SYNCHRO : $TOKEN"
  echo "  Note-le (gestionnaire de mots de passe)."
  echo "  À saisir une fois par appareil : Plus → Réglages → Synchronisation."
  echo "════════════════════════════════════════════════"
fi

echo "✓ Terminé."
