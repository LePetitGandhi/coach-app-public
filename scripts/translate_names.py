# -*- coding: utf-8 -*-
"""Traduction FR des noms d'exercices : mouvement + matériel + position + prise."""
import re

EQUIP_PHRASE = {
    "dumbbell": "aux haltères", "barbell": "à la barre", "ez barbell": "à la barre EZ",
    "olympic barbell": "à la barre olympique", "trap bar": "à la trap bar",
    "cable": "à la poulie", "kettlebell": "au kettlebell", "band": "à l'élastique",
    "resistance band": "à l'élastique", "leverage machine": "à la machine",
    "smith machine": "à la Smith machine", "body weight": "", "weighted": "lesté",
    "assisted": "assisté", "stability ball": "au swiss ball",
    "medicine ball": "au medicine ball", "rope": "à la corde", "roller": "au rouleau",
    "wheel roller": "à la roue abdo",
}

POSITION = {
    "seated": "assis", "sitted": "assis", "standing": "debout", "lying": "allongé",
    "kneeling": "à genoux", "prone": "à plat ventre", "supine": "sur le dos",
    "hanging": "suspendu", "suspended": "suspendu", "incline": "incliné",
    "decline": "décliné", "flat": "à plat", "floor": "au sol", "wall": "au mur",
    "chair": "sur chaise", "bench": "sur banc", "supported": "avec appui",
}
GRIP = {
    "closegrip": "prise serrée", "widegrip": "prise large", "neutralgrip": "prise neutre",
    "reversegrip": "prise inversée", "underhandgrip": "prise supination",
    "overhandgrip": "prise pronation",
}
LATERAL = {
    "one arm": "un bras", "single arm": "un bras", "two arm": "deux bras",
    "one leg": "une jambe", "single leg": "unilatéral", "alternate": "alterné",
    "alternating": "alterné",
}

# Expressions composées → jeton unique (appliqué avant le découpage)
PRE = [
    ("behind the neck", "behindhead"), ("behind head", "behindhead"),
    ("close grip", "closegrip"), ("narrow grip", "closegrip"), ("wide grip", "widegrip"),
    ("neutral grip", "neutralgrip"), ("parallel grip", "neutralgrip"),
    ("reverse grip", "reversegrip"), ("underhand grip", "underhandgrip"),
    ("overhand grip", "overhandgrip"),
    ("exercise ball", ""), ("stability ball", ""), ("medicine ball", ""), ("swiss ball", ""),
    ("bench press", "benchpress"), ("chest press", "chestpress"),
    ("shoulder press", "shoulderpress"), ("military press", "militarypress"),
    ("overhead press", "overheadpress"), ("leg press", "legpress"),
    ("calf press", "calfpress"), ("push press", "pushpress"),
    ("french press", "frenchpress"), ("hammer press", "hammerpress"),
    ("arnold press", "arnoldpress"), ("pallof press", "pallofpress"),
    ("cuban press", "cubanpress"), ("jm press", "jmpress"),
    ("wheel rollerout", "rollerout"), ("ab wheel", "rollerout"),
    ("good morning", "goodmorning"), ("russian twist", "russiantwist"),
    ("split squat", "splitsquat"), ("jump squat", "jumpsquat"),
    ("hack squat", "hacksquat"), ("goblet squat", "gobletsquat"),
    ("sissy squat", "sissysquat"), ("full squat", "fullsquat"),
    ("zercher squat", "zerchersquat"), ("potty squat", "deepsquat"),
    ("walking lunge", "walkinglunge"), ("step up", "stepup"),
    ("sit up", "situp"), ("pull up", "pullup"), ("chin up", "chinup"),
    ("push up", "pushup"), ("muscle up", "muscleup"), ("v up", "vup"),
    ("upright row", "uprightrow"), ("inverted row", "invertedrow"),
    ("lateral raise", "lateralraise"), ("front raise", "frontraise"),
    ("calf raise", "calfraise"), ("hip raise", "hipraise"),
    ("lateral pulldown", "lateralpulldown"),
    ("preacher curl", "preachercurl"), ("hammer curl", "hammercurl"),
    ("concentration curl", "concentrationcurl"), ("spider curl", "spidercurl"),
    ("wrist curl", "wristcurl"), ("leg curl", "legcurl"), ("drag curl", "dragcurl"),
    ("biceps curl", "bicepscurl"), ("bicep curl", "bicepscurl"),
    ("zottman curl", "zottmancurl"),
    ("triceps extension", "tricepsextension"), ("tricep extension", "tricepsextension"),
    ("leg extension", "legextension"), ("hip extension", "hipextension"),
    ("back extension", "hyperextension"), ("hyper extension", "hyperextension"),
    ("romanian deadlift", "romaniandeadlift"), ("stiff leg deadlift", "stiffdeadlift"),
    ("straight leg deadlift", "stiffdeadlift"), ("stiff deadlift", "stiffdeadlift"),
    ("sumo deadlift", "sumodeadlift"),
    ("glute bridge", "glutebridge"), ("hip thrust", "hipthrust"),
    ("chest fly", "chestfly"), ("reverse fly", "reversefly"),
    ("chest dip", "chestdip"), ("triceps dip", "tricepsdip"), ("tricep dip", "tricepsdip"),
    ("hang clean", "hangclean"), ("toe touch", "toetouch"), ("toe touchers", "toetouch"),
    ("pull through", "pullthrough"), ("side plank", "sideplank"),
    ("mountain climber", "mountainclimber"), ("jumping jack", "jumpingjack"),
    ("box jump", "boxjump"), ("hip adduction", "hipadduction"),
    ("hip abduction", "hipabduction"), ("pelvic tilt", "pelvictilt"),
    ("air bike", "airbike"), ("skull crusher", "frenchpress"),
    ("lat pulldown", "lateralpulldown"),
    ("bent over", "bentover"), ("bent knee", ""), ("cross body", "crossbody"),
    ("skull crushers", "frenchpress"), ("lying triceps extension", "frenchpress"),
    ("straight bar", ""), ("ring dips", "ringdips"), ("clap push up", "clappushup"),
    ("front lever", "frontlever"), ("back lever", "backlever"),
]

CORE = {
    "press": "Développé", "benchpress": "Développé couché", "chestpress": "Développé couché",
    "shoulderpress": "Développé épaules", "militarypress": "Développé militaire",
    "overheadpress": "Développé au-dessus de la tête", "pushpress": "Développé avec impulsion",
    "arnoldpress": "Arnold press", "frenchpress": "Barre au front",
    "hammerpress": "Développé prise marteau", "jmpress": "JM press",
    "cubanpress": "Cuban press", "pallofpress": "Pallof press",
    "legpress": "Presse à cuisses", "calfpress": "Presse à mollets",
    "row": "Rowing", "uprightrow": "Rowing menton", "invertedrow": "Rowing inversé",
    "delt row": "Rowing deltoïde postérieur", "t row": "Rowing en T",
    "curl": "Curl", "bicepscurl": "Curl biceps", "hammercurl": "Curl marteau",
    "preachercurl": "Curl pupitre", "concentrationcurl": "Curl concentration",
    "spidercurl": "Curl spider", "dragcurl": "Drag curl", "zottmancurl": "Curl Zottman",
    "wristcurl": "Curl poignets", "legcurl": "Leg curl (ischios)",
    "inverse curl": "Curl inversé", "overhead curl": "Curl au-dessus de la tête",
    "bicepscurl blaster": "Curl avec bloc-coudes",
    "fly": "Écarté", "chestfly": "Écarté pectoraux", "reversefly": "Écarté inversé",
    "raise": "Élévation", "lateralraise": "Élévations latérales",
    "frontraise": "Élévations frontales", "calfraise": "Extension mollets",
    "hipraise": "Relevé de bassin", "y raise": "Élévation en Y",
    "shoulder raise": "Élévation épaules", "delt raise": "Élévation deltoïdes",
    "extension": "Extension", "tricepsextension": "Extension triceps",
    "hipextension": "Extension de hanche", "legextension": "Leg extension (quadriceps)",
    "hyperextension": "Extension lombaire",
    "pulldown": "Tirage vertical", "lateralpulldown": "Tirage vertical prise large",
    "pushdown": "Extension triceps à la poulie", "pull": "Tirage",
    "pullthrough": "Pull-through", "pullover": "Pull-over",
    "pullup": "Traction", "chinup": "Traction en supination", "muscleup": "Muscle-up",
    "pushup": "Pompes",
    "squat": "Squat", "splitsquat": "Fente bulgare", "jumpsquat": "Squat sauté",
    "hacksquat": "Hack squat", "zerchersquat": "Squat Zercher",
    "gobletsquat": "Goblet squat", "sissysquat": "Sissy squat",
    "fullsquat": "Squat complet", "deepsquat": "Squat profond",
    "lunge": "Fente", "walkinglunge": "Fente marchée", "stepup": "Montée sur banc",
    "deadlift": "Soulevé de terre", "romaniandeadlift": "Soulevé de terre roumain",
    "stiffdeadlift": "Soulevé de terre jambes tendues", "sumodeadlift": "Soulevé de terre sumo",
    "goodmorning": "Good morning", "hipthrust": "Hip thrust",
    "crunch": "Crunch", "situp": "Relevé de buste", "vup": "V-up",
    "twist": "Rotation du buste", "russiantwist": "Russian twist",
    "plank": "Gainage", "sideplank": "Gainage latéral", "bridge": "Pont",
    "glutebridge": "Pont fessier",
    "shrug": "Haussements d'épaules", "dip": "Dips", "chestdip": "Dips pectoraux",
    "tricepsdip": "Dips triceps", "kickback": "Kickback", "rollerout": "Extension à la roue",
    "stretch": "Étirement", "clean": "Épaulé", "hangclean": "Épaulé suspendu",
    "snatch": "Arraché", "jerk": "Jeté", "thruster": "Thruster", "burpee": "Burpee",
    "inchworm": "Chenille", "windmill": "Moulin à vent", "run": "Course",
    "bend": "Flexion latérale", "hipadduction": "Adduction de hanche",
    "hipabduction": "Abduction de hanche", "pronation": "Pronation avant-bras",
    "supination": "Supination avant-bras", "pelvictilt": "Bascule du bassin",
    "toetouch": "Toucher les orteils", "airbike": "Vélo (abdos)",
    "mountainclimber": "Mountain climber", "jumpingjack": "Jumping jack",
    "boxjump": "Saut sur box", "bentover": "Buste penché", "crossbody": "Bras croisé",
    "ringdips": "Dips aux anneaux", "clappushup": "Pompes claquées",
    "frontlever": "Front lever", "backlever": "Back lever", "planche": "Planche", "hyperextension v2": "Extension lombaire v2",
}

WORD = {
    "press": "développé", "row": "rowing", "curl": "curl", "raise": "élévation",
    "extension": "extension", "fly": "écarté", "squat": "squat", "lunge": "fente",
    "crunch": "crunch", "twist": "rotation", "stretch": "étirement", "dip": "dips",
    "shrug": "haussements d'épaules", "pullover": "pull-over", "deadlift": "soulevé de terre",
    "pulldown": "tirage vertical", "pushdown": "extension à la poulie", "kickback": "kickback",
    "kickbacks": "kickbacks", "bridge": "pont", "plank": "gainage", "jump": "saut",
    "jumps": "sauts", "run": "course", "walk": "marche", "hold": "maintien",
    "hang": "suspension", "throw": "lancer", "touch": "toucher", "reach": "extension",
    "triceps": "triceps", "tricep": "triceps", "biceps": "biceps", "bicep": "biceps",
    "chest": "pectoraux", "shoulder": "épaules", "shoulders": "épaules", "calf": "mollets",
    "calves": "mollets", "quads": "quadriceps", "quad": "quadriceps",
    "hamstring": "ischio-jambiers", "hamstrings": "ischio-jambiers",
    "glute": "fessiers", "glutes": "fessiers", "gluteus": "fessiers",
    "neck": "cou", "wrist": "poignet", "forearm": "avant-bras", "hip": "hanche",
    "hips": "hanches", "knee": "genou", "knees": "genoux", "abs": "abdos",
    "oblique": "obliques", "obliques": "obliques", "lat": "grand dorsal",
    "lats": "grand dorsal", "traps": "trapèzes", "delt": "deltoïde", "delts": "deltoïdes",
    "spine": "colonne", "ankle": "cheville", "adductor": "adducteurs",
    "abductor": "abducteurs", "flexor": "fléchisseurs", "flexors": "fléchisseurs",
    "extensor": "extenseurs", "pectoralis": "pectoraux", "major": "", "minor": "",
    "lateral": "latéral", "side": "latéral", "front": "avant", "rear": "arrière",
    "overhead": "au-dessus de la tête", "behindhead": "derrière la nuque",
    "reverse": "inversé", "inverted": "inversé", "inverse": "inversé",
    "twisting": "avec rotation", "rotational": "avec rotation", "rotation": "rotation",
    "circles": "cercles", "circular": "circulaire", "straight": "tendu", "bent": "fléchi",
    "cross": "croisé", "high": "haut", "low": "bas", "full": "complet", "half": "demi",
    "wide": "large", "close": "serré", "narrow": "serré", "single": "unilatéral",
    "double": "bilatéral", "left": "gauche", "right": "droit", "leg": "jambe",
    "legs": "jambes", "arm": "bras", "arms": "bras", "back": "dos", "and": "et",
    "up": "", "down": "", "out": "", "in": "", "on": "", "to": "", "the": "",
    "of": "", "with": "", "a": "", "an": "", "for": "", "male": "", "female": "",
    "pov": "", "exercise": "",
}

FILLER = {
    "grip", "reps", "v", "vbar", "bar", "bars", "strap", "stance", "male", "female",
    "pov", "exercise", "the", "a", "an", "of", "for", "on", "in", "with", "to", "version",
}
EQUIP_TOKENS = {
    "dumbbell", "dumbbells", "barbell", "cable", "cables", "kettlebell", "kettlebells",
    "band", "bands", "lever", "leverage", "smith", "ez", "olympic", "machine", "weighted",
    "bodyweight", "assisted", "resistance", "stability", "medicine", "bosu", "trap",
    "sled", "wheel", "roller", "rope", "ball", "trainer", "cage", "pulley", "landmine",
    "body", "weight", "gym", "suspension", "suspended",
}

_PAREN = re.compile(r"\([^)]*\)")

def _norm(name: str) -> str:
    s = name.lower().replace("в°", "°").replace("-", " ").replace("/", " ").replace(".", " ")
    s = _PAREN.sub(" ", s)
    s = re.sub(r"\bv\s*([234])\b", r"v\1", s)
    s = re.sub(r"[^a-zà-ÿ0-9°\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    for en, tok in PRE:
        s = re.sub(r"(?<![a-zà-ÿ])" + re.escape(en) + r"(?![a-zà-ÿ])", " " + tok + " ", s)
    return re.sub(r"\s+", " ", s).strip()


def translate_name(name: str, equipment: str = "") -> str:
    s = _norm(name)

    laterality = []
    for en, fr in LATERAL.items():
        if re.search(r"(?<![a-z])" + en + r"(?![a-z])", s):
            s = re.sub(r"(?<![a-z])" + en + r"(?![a-z])", " ", s)
            if fr not in laterality:
                laterality.append(fr)

    positions, grips, core_tokens = [], [], []
    for t in s.split():
        if t in POSITION:
            positions.append(POSITION[t])
        elif t in GRIP:
            grips.append(GRIP[t])
        elif t in EQUIP_TOKENS or t in FILLER:
            continue
        else:
            core_tokens.append(t)

    seen_core = False
    deduped = []
    for t in core_tokens:
        if t in CORE:
            if seen_core:
                continue
            seen_core = True
        deduped.append(t)
    core_tokens = deduped
    core = " ".join(core_tokens).strip()

    if core in CORE:
        movement = CORE[core]
    else:
        parts = core.split()
        movement = None
        for i in range(len(parts)):
            tail = " ".join(parts[i:])
            if tail in CORE:
                head = " ".join(w for w in (WORD.get(p, p) for p in parts[:i]) if w).strip()
                movement = CORE[tail] + (f" {head}" if head else "")
                break
        if movement is None:
            for i in range(len(parts), 0, -1):
                head_key = " ".join(parts[:i])
                if head_key in CORE:
                    tail = " ".join(w for w in (WORD.get(p, p) for p in parts[i:]) if w).strip()
                    movement = CORE[head_key] + (f" {tail}" if tail else "")
                    break
        if movement is None:
            words = [WORD.get(p, p) for p in parts]
            movement = " ".join(w for w in words if w).strip()
    if not movement:
        movement = name

    bits = [movement]
    eq = EQUIP_PHRASE.get(equipment, "")
    if eq:
        bits.append(eq)
    label = " ".join(bits)
    extras = list(dict.fromkeys(laterality + positions + grips))
    if extras:
        label += ", " + ", ".join(extras)
    label = re.sub(r"\s+", " ", label).strip(" ,")
    return label[:1].upper() + label[1:] if label else name
