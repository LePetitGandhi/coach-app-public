# Régénérer la bibliothèque d'exercices

`public/data/exercises.json` est un dérivé filtré et traduit de
[hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset)
(licence MIT pour les données ; **médias © [Gym visual](https://gymvisual.com/)**).

## Ce que fait le build

| Étape | Effet |
| --- | --- |
| Filtrage | Retire les machines de salle exotiques (sled, SkiErg, tapis, elliptique…) → 1 299 exercices sur 1 324 |
| Langue | Ne garde que les instructions françaises (les 9 autres langues font ~90 % du poids) |
| Traduction | Recompose un nom français lisible : `cable one arm lateral raise` → `Élévations latérales à la poulie, un bras` |
| Marquage | `h: 1` sur les exercices réalisables à la maison (poids du corps, haltères, élastiques, kettlebell…) → 818 exercices |
| Médias | Aucun fichier copié : les GIF et vignettes sont référencés sur le CDN jsDelivr |

Résultat : **~0,9 Mo** dans `public/`, chargé à la demande, hors bundle JS.

## Commande

```bash
# 1. Récupérer la source (sparse checkout : on ne clone que le dossier data/)
git clone --depth 1 --filter=blob:none --no-checkout \
  https://github.com/hasaneyldrm/exercises-dataset.git /tmp/exercises-dataset
cd /tmp/exercises-dataset && git sparse-checkout set data && git checkout main

# 2. Régénérer
cd ~/Desktop/"Coach perso nutritionniste"/coach-app
python3 scripts/build_exercises.py
```

Sortie : `public/data/exercises.json` + `public/data/exercises.meta.json`.

## Améliorer une traduction

Tout se joue dans `scripts/translate_names.py` :

- `PRE` — expressions composées fusionnées en un jeton avant découpage
  (`"bench press"` → `benchpress`). À compléter en premier.
- `CORE` — jeton → nom du mouvement en français. C'est le dictionnaire principal.
- `WORD` — traduction mot à mot, filet de sécurité pour la longue traîne.
- `EQUIP_PHRASE`, `POSITION`, `GRIP`, `LATERAL` — compléments accolés au nom.

Vérifier un échantillon après modification :

```bash
python3 -c "
import sys, json, random; sys.path.insert(0, 'scripts')
from translate_names import translate_name
d = json.load(open('/tmp/exercises-dataset/data/exercises.json'))
random.seed(0)
for e in random.sample(d, 40):
    print(f\"{e['name'][:44]:46s} | {translate_name(e['name'], e['equipment'])}\")
"
```

## Attribution

Le crédit `© Gym visual — gymvisual.com` est affiché dans chaque fiche exercice
(`ExerciseLibrary.tsx`). Il est exigé par la licence média : ne pas le retirer.
Pour un usage au-delà du perso, prendre une licence sur gymvisual.com.
