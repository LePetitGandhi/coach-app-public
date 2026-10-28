# -*- coding: utf-8 -*-
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from translate_names import translate_name

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.environ.get("EXERCISES_SRC", "/tmp/exercises-dataset/data/exercises.json")
OUT_DIR = os.path.join(ROOT, "public", "data")
os.makedirs(OUT_DIR, exist_ok=True)

EXCLUDE_EQUIP = {
    "sled machine", "bosu ball", "upper body ergometer", "skierg machine",
    "hammer", "stationary bike", "tire", "elliptical machine", "stepmill machine",
}
HOME_EQUIP = {
    "body weight", "dumbbell", "band", "resistance band", "kettlebell",
    "stability ball", "roller", "wheel roller", "medicine ball", "rope", "weighted",
}
EQUIP_FR = {
    "body weight": "Poids du corps", "dumbbell": "Haltères", "cable": "Poulie",
    "barbell": "Barre", "leverage machine": "Machine guidée", "band": "Élastique",
    "smith machine": "Smith machine", "kettlebell": "Kettlebell", "weighted": "Lesté",
    "stability ball": "Swiss ball", "ez barbell": "Barre EZ", "assisted": "Machine assistée",
    "medicine ball": "Medicine ball", "rope": "Corde", "roller": "Rouleau",
    "resistance band": "Élastique", "olympic barbell": "Barre olympique",
    "wheel roller": "Roue abdo", "trap bar": "Trap bar",
}
CAT_FR = {
    "upper arms": "Bras", "upper legs": "Cuisses", "back": "Dos", "waist": "Abdos & gainage",
    "chest": "Pectoraux", "shoulders": "Épaules", "lower legs": "Mollets",
    "lower arms": "Avant-bras", "cardio": "Cardio", "neck": "Cou",
}
MUSCLE_FR = {
    "abductors": "abducteurs", "abs": "abdominaux", "adductors": "adducteurs",
    "biceps": "biceps", "calves": "mollets", "cardiovascular system": "cardio",
    "delts": "deltoïdes", "forearms": "avant-bras", "glutes": "fessiers",
    "hamstrings": "ischio-jambiers", "lats": "grand dorsal",
    "levator scapulae": "élévateur de la scapula", "pectorals": "pectoraux",
    "quads": "quadriceps", "serratus anterior": "grand dentelé", "spine": "érecteurs du rachis",
    "traps": "trapèzes", "triceps": "triceps", "upper back": "haut du dos",
    "shoulders": "épaules", "lower back": "bas du dos", "hip flexors": "fléchisseurs de hanche",
    "core": "gainage", "chest": "pectoraux", "back": "dos", "legs": "jambes", "arms": "bras",
    "obliques": "obliques", "hips": "hanches", "wrist extensors": "extenseurs du poignet",
    "wrist flexors": "fléchisseurs du poignet", "rhomboids": "rhomboïdes",
    "deltoids": "deltoïdes", "quadriceps": "quadriceps", "gluteus maximus": "grand fessier",
    "erector spinae": "érecteurs du rachis", "rotator cuff": "coiffe des rotateurs",
    "serratus": "grand dentelé", "neck": "cou", "abdominals": "abdominaux",
    "sternocleidomastoid": "sterno-cléido-mastoïdien", "trapezius": "trapèzes",
    "latissimus dorsi": "grand dorsal", "pectoralis major": "grand pectoral",
    "soleus": "soléaire", "gastrocnemius": "gastrocnémiens", "brachialis": "brachial",
    "brachioradialis": "brachio-radial", "hip abductors": "abducteurs de hanche",
    "hip adductors": "adducteurs de hanche", "iliopsoas": "ilio-psoas",
    "gluteus medius": "moyen fessier", "gluteus minimus": "petit fessier",
    "infraspinatus": "infra-épineux", "teres major": "grand rond", "teres minor": "petit rond",
}
def fr_muscle(m):
    return MUSCLE_FR.get(m.strip().lower(), m.strip())

data = json.load(open(SRC, encoding="utf-8"))
out = []
for e in data:
    if e["equipment"] in EXCLUDE_EQUIP:
        continue
    steps = e.get("instruction_steps", {}).get("fr") or []
    if not steps:
        steps = [p.strip() for p in e.get("instructions", {}).get("fr", "").split(". ") if p.strip()]
    out.append({
        "id": e["id"],
        "n": translate_name(e["name"], e["equipment"]),
        "en": e["name"],
        "c": e["category"],
        "q": e["equipment"],
        "t": e["target"],
        "s": sorted({fr_muscle(m) for m in e.get("secondary_muscles", []) if m.strip()}),
        "p": steps,
        "m": e["media_id"],
        "h": 1 if e["equipment"] in HOME_EQUIP else 0,
    })

out.sort(key=lambda x: (x["c"], x["n"]))
json.dump(out, open(f"{OUT_DIR}/exercises.json", "w", encoding="utf-8"),
          ensure_ascii=False, separators=(",", ":"))

meta = {
    "source": "hasaneyldrm/exercises-dataset (MIT) — médias © Gym visual (https://gymvisual.com/)",
    "cdn": "https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@main",
    "count": len(out),
    "home": sum(x["h"] for x in out),
    "categories": {c: CAT_FR[c] for c in sorted({x["c"] for x in out})},
    "equipment": {q: EQUIP_FR.get(q, q) for q in sorted({x["q"] for x in out})},
    "targets": {t: fr_muscle(t) for t in sorted({x["t"] for x in out})},
}
json.dump(meta, open(f"{OUT_DIR}/exercises.meta.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=2)
print("count", len(out), "home", meta["home"])
print("size MB", round(os.path.getsize(f"{OUT_DIR}/exercises.json") / 1e6, 2))
