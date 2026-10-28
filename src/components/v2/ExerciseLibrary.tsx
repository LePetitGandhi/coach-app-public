"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Dumbbell, Home, Plus, Search, Settings2, Sparkles, Star, X } from "lucide-react";
import {
  EMPTY_FILTERS,
  EQUIPMENT_GROUPS,
  EQUIPMENT_PROFILE_KEY,
  EXERCISES_ATTRIBUTION,
  filterByEquipment,
  filterExercises,
  loadExerciseLibrary,
  nextSession,
  sessionForDay,
  suggestForFocus,
  type EquipmentProfile,
  type Exercise,
  type ExerciseFilters,
  type ExerciseLibrary as Library,
} from "@/lib/v2/exercises";
import { TRAINING_SPLIT } from "@/lib/v2/coachPlan";

const PAGE_SIZE = 24;

const DAY_NAMES = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"] as const;
const WEEK_ORDER = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"] as const;

function readEquipmentProfile(): EquipmentProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(EQUIPMENT_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as EquipmentProfile) : null;
  } catch {
    return null;
  }
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function ChipRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ id: string; label: string }>;
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  return (
    <div className="chip-row">
      <span className="chip-row__label">{label}</span>
      <div className="chip-row__items">
        <button type="button" className={cx("chip", value === null && "is-active")} onClick={() => onChange(null)}>
          Tous
        </button>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={cx("chip", value === option.id && "is-active")}
            onClick={() => onChange(value === option.id ? null : option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ExerciseCard({
  exercise,
  onOpen,
  favorite,
}: {
  exercise: Exercise;
  onOpen: () => void;
  favorite?: boolean;
}) {
  return (
    <button type="button" className="exercise-card" onClick={onOpen}>
      <span className="exercise-card__media">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={exercise.thumbUrl} alt="" loading="lazy" decoding="async" width={180} height={180} />
        {exercise.home ? (
          <em className="exercise-card__badge" title="Faisable à la maison">
            <Home aria-hidden="true" />
          </em>
        ) : null}
        {favorite ? (
          <em className="exercise-card__badge exercise-card__badge--fav" title="Favori">
            <Star aria-hidden="true" />
          </em>
        ) : null}
      </span>
      <span className="exercise-card__body">
        <strong>{exercise.name}</strong>
        <span className="exercise-card__meta">
          {exercise.targetLabel} · {exercise.equipmentLabel}
        </span>
      </span>
    </button>
  );
}

function ExerciseSheet({
  exercise,
  onClose,
  onAddToWorkout,
  favorite,
  onToggleFavorite,
}: {
  exercise: Exercise;
  onClose: () => void;
  onAddToWorkout?: (name: string, exerciseId: string) => void;
  favorite: boolean;
  onToggleFavorite: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label={exercise.name} onClick={onClose}>
      <div className="sheet" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="sheet__close" onClick={onClose} aria-label="Fermer">
          <X aria-hidden="true" />
        </button>
        <div className="sheet__head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={exercise.gifUrl} alt={exercise.name} width={180} height={180} />
          <div>
            <h3>{exercise.name}</h3>
            <p className="sheet__en">{exercise.nameEn}</p>
            <div className="tag-row">
              <span className="tag tag--accent">{exercise.targetLabel}</span>
              <span className="tag">{exercise.equipmentLabel}</span>
              <span className="tag">{exercise.categoryLabel}</span>
              {exercise.home ? <span className="tag tag--home">Maison</span> : null}
            </div>
          </div>
        </div>
        {exercise.secondary.length ? (
          <p className="sheet__secondary">
            <strong>Muscles secondaires :</strong> {exercise.secondary.join(", ")}
          </p>
        ) : null}
        <ol className="sheet__steps">
          {exercise.steps.map((step, index) => (
            <li key={index}>{step}</li>
          ))}
        </ol>
        <div className="button-row sheet__actions">
          {onAddToWorkout ? (
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                onAddToWorkout(exercise.name, exercise.id);
                onClose();
              }}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Ajouter à la séance
            </button>
          ) : null}
          <button type="button" className="secondary-button" onClick={onToggleFavorite}>
            <Star className="h-4 w-4" aria-hidden="true" />
            {favorite ? "Retirer des favoris" : "Mettre en favori"}
          </button>
        </div>
        <p className="sheet__credit">{EXERCISES_ATTRIBUTION}</p>
      </div>
    </div>
  );
}

/**
 * Déclaration du matériel.
 *
 * Écran d'accueil tant que rien n'est choisi : sans cette information, la
 * bibliothèque affiche 1299 exercices dont la plupart supposent une salle
 * complète.
 */
function EquipmentPicker({
  profile,
  onToggle,
  onDone,
  compact,
}: {
  profile: EquipmentProfile;
  onToggle: (id: string) => void;
  onDone: () => void;
  compact?: boolean;
}) {
  return (
    <section className="panel panel--lead">
      <div className="panel__title">
        <div>
          <span className="eyebrow">Matériel</span>
          <h2>{compact ? "Modifier le matériel" : "De quoi disposes-tu ?"}</h2>
        </div>
        <Settings2 className="panel-icon" aria-hidden="true" />
      </div>
      <p className="muted">
        Le poids du corps est toujours inclus. Coche ce que tu as réellement sous la main — tout le
        reste disparaît de la bibliothèque, et tu ne le reverras plus.
      </p>
      <div className="equipment-grid">
        {EQUIPMENT_GROUPS.map((group) => {
          const active = profile.includes(group.id);
          return (
            <button
              key={group.id}
              type="button"
              className={cx("equipment-tile", active && "is-active")}
              aria-pressed={active}
              onClick={() => onToggle(group.id)}
            >
              <span className="equipment-tile__check">{active ? <Check aria-hidden="true" /> : null}</span>
              <strong>{group.label}</strong>
              <em>{group.hint}</em>
            </button>
          );
        })}
      </div>
      <button type="button" className="primary-button" onClick={onDone}>
        <Check className="h-4 w-4" aria-hidden="true" />
        {profile.length ? "Valider" : "Continuer au poids du corps"}
      </button>
    </section>
  );
}

const FAVORITES_KEY = "coach.v2.favorites";

function readFavorites(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

export function ExerciseLibrary({
  onAddToWorkout,
}: {
  onAddToWorkout?: (name: string, exerciseId: string) => void;
}) {
  const [library, setLibrary] = useState<Library | null>(null);
  const [error, setError] = useState(false);
  const [filters, setFilters] = useState<ExerciseFilters>(EMPTY_FILTERS);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<Exercise | null>(null);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  // `null` = profil pas encore lu ; `[]` = lu, aucun matériel déclaré.
  const [profile, setProfile] = useState<EquipmentProfile | null>(null);
  const [editingEquipment, setEditingEquipment] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [dayIndex, setDayIndex] = useState(() => WEEK_ORDER.indexOf(DAY_NAMES[new Date().getDay()]));

  useEffect(() => {
    loadExerciseLibrary().then(setLibrary).catch(() => setError(true));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFavorites(readFavorites());
    setProfile(readEquipmentProfile());
  }, []);

  function toggleEquipment(id: string) {
    setProfile((current) => {
      const base = current ?? [];
      const next = base.includes(id) ? base.filter((item) => item !== id) : [...base, id];
      try {
        localStorage.setItem(EQUIPMENT_PROFILE_KEY, JSON.stringify(next));
      } catch {
        /* quota : on garde au moins l'état en mémoire */
      }
      return next;
    });
  }

  function confirmEquipment() {
    try {
      localStorage.setItem(EQUIPMENT_PROFILE_KEY, JSON.stringify(profile ?? []));
    } catch {
      /* quota */
    }
    setProfile(profile ?? []);
    setEditingEquipment(false);
  }

  function toggleFavorite(id: string) {
    setFavorites((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      } catch {
        /* quota : on garde au moins l'état en mémoire */
      }
      return next;
    });
  }

  // Toute la bibliothèque passe d'abord par le filtre matériel : c'est lui qui
  // fait tomber le catalogue de 1299 à quelques centaines d'exercices utiles.
  const available = useMemo(
    () => (library ? filterByEquipment(library.exercises, profile ?? []) : []),
    [library, profile],
  );

  const results = useMemo(() => filterExercises(available, filters), [available, filters]);

  // Réinitialise la pagination quand les filtres changent (ajustement d'état
  // pendant le rendu — motif recommandé par React plutôt qu'un effet).
  const [appliedFilters, setAppliedFilters] = useState(filters);
  if (appliedFilters !== filters) {
    setAppliedFilters(filters);
    setVisible(PAGE_SIZE);
  }

  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible((current) => Math.min(current + PAGE_SIZE, results.length));
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [results.length]);

  const selectedDay = WEEK_ORDER[dayIndex] ?? WEEK_ORDER[0];

  /** Séance du jour sélectionné, ou la prochaine si c'est un jour de repos. */
  const todaySession = useMemo(() => {
    const planned = sessionForDay(TRAINING_SPLIT, selectedDay);
    if (planned) return { session: planned, rest: false };
    const upcoming = nextSession(TRAINING_SPLIT, selectedDay, WEEK_ORDER);
    return upcoming ? { session: upcoming, rest: true } : null;
  }, [selectedDay]);

  const sessionExercises = useMemo(() => {
    if (!library || !todaySession) return [];
    return suggestForFocus(library.exercises, todaySession.session.title, filters.homeOnly, 6, profile ?? []);
  }, [library, todaySession, filters.homeOnly, profile]);

  function patch(next: Partial<ExerciseFilters>) {
    setFilters((current) => ({ ...current, ...next }));
  }

  if (error) {
    return (
      <div className="tab-grid">
        <section className="panel">
          <p className="muted">
            Bibliothèque indisponible : le fichier <code>public/data/exercises.json</code> n&apos;a pas pu être chargé.
          </p>
        </section>
      </div>
    );
  }

  if (!library) {
    return (
      <div className="tab-grid">
        <section className="panel">
          <div className="skeleton-lines">
            <span />
            <span />
            <span />
          </div>
        </section>
      </div>
    );
  }

  // Premier passage : on demande le matériel avant d'afficher quoi que ce soit.
  if (profile === null || editingEquipment) {
    return (
      <div className="tab-grid">
        <EquipmentPicker
          profile={profile ?? []}
          onToggle={toggleEquipment}
          onDone={confirmEquipment}
          compact={editingEquipment}
        />
        {selected ? (
          <ExerciseSheet
            exercise={selected}
            onClose={() => setSelected(null)}
            onAddToWorkout={onAddToWorkout}
            favorite={favorites.includes(selected.id)}
            onToggleFavorite={() => toggleFavorite(selected.id)}
          />
        ) : null}
      </div>
    );
  }

  const favoriteExercises = available.filter((exercise) => favorites.includes(exercise.id));
  const categories = Object.entries(library.meta.categories).map(([id, label]) => ({ id, label }));
  const targets = Object.entries(library.meta.targets).map(([id, label]) => ({
    id,
    label: label.charAt(0).toUpperCase() + label.slice(1),
  }));

  return (
    <div className="tab-grid">
      {/* Séance du jour : l'écran d'entrée, sans scroll ni recherche. */}
      {todaySession ? (
        <section className="panel panel--lead">
          <div className="panel__title">
            <div>
              <span className="eyebrow">
                {todaySession.rest ? `${selectedDay} · repos — prochaine séance` : `${selectedDay} · séance du jour`}
              </span>
              <h2>{todaySession.session.title}</h2>
            </div>
            <Sparkles className="panel-icon" aria-hidden="true" />
          </div>

          <p className="muted">{todaySession.session.focus}</p>

          <div className="chip-row__items">
            {WEEK_ORDER.map((day, index) => (
              <button
                key={day}
                type="button"
                className={cx("chip", index === dayIndex && "is-active", !sessionForDay(TRAINING_SPLIT, day) && "chip--rest")}
                onClick={() => setDayIndex(index)}
              >
                {day.slice(0, 3)}
              </button>
            ))}
          </div>

          <ul className="rule-list rule-list--tight">
            {todaySession.session.rules.map((rule) => (
              <li key={rule}>
                <Check className="h-4 w-4" aria-hidden="true" />
                <span>{rule}</span>
              </li>
            ))}
          </ul>

          <h3 className="section-title">Exercices proposés</h3>
          <div className="exercise-grid exercise-grid--compact">
            {sessionExercises.map((exercise) => (
              <ExerciseCard
                key={exercise.id}
                exercise={exercise}
                favorite={favorites.includes(exercise.id)}
                onOpen={() => setSelected(exercise)}
              />
            ))}
          </div>
          {!sessionExercises.length ? (
            <p className="muted">
              Aucun exercice ne correspond à ton matériel pour cette séance. Ajoute du matériel ou
              désactive le filtre « chez moi ».
            </p>
          ) : null}

          <div className="button-row">
            <button type="button" className="secondary-button" onClick={() => setBrowsing((current) => !current)}>
              <Search className="h-4 w-4" aria-hidden="true" />
              {browsing ? "Masquer la recherche" : "Chercher un autre exercice"}
            </button>
            <button type="button" className="secondary-button" onClick={() => setEditingEquipment(true)}>
              <Settings2 className="h-4 w-4" aria-hidden="true" />
              Matériel
            </button>
          </div>
        </section>
      ) : null}

      {favoriteExercises.length ? (
        <section className="panel">
          <div className="panel__title">
            <div>
              <span className="eyebrow">Favoris</span>
              <h2>{favoriteExercises.length} exercice{favoriteExercises.length > 1 ? "s" : ""}</h2>
            </div>
            <Star className="panel-icon" aria-hidden="true" />
          </div>
          <div className="exercise-grid exercise-grid--compact">
            {favoriteExercises.map((exercise) => (
              <ExerciseCard key={exercise.id} exercise={exercise} favorite onOpen={() => setSelected(exercise)} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Recherche : mode secondaire, ouvert à la demande. */}
      {browsing ? (
        <section className="panel">
          <div className="panel__title">
            <div>
              <span className="eyebrow">Recherche</span>
              <h2>{available.length} exercices disponibles</h2>
            </div>
            <Dumbbell className="panel-icon" aria-hidden="true" />
          </div>

          <div className="search-bar">
            <Search aria-hidden="true" />
            <input
              type="search"
              value={filters.query}
              placeholder="Développé, traction, fessiers…"
              onChange={(event) => patch({ query: event.target.value })}
            />
            <button
              type="button"
              className={cx("chip chip--toggle", filters.homeOnly && "is-active")}
              onClick={() => patch({ homeOnly: !filters.homeOnly })}
            >
              <Home aria-hidden="true" />
              Chez moi
            </button>
          </div>

          <div className="filters">
            <ChipRow label="Zone" options={categories} value={filters.category} onChange={(category) => patch({ category })} />
            <ChipRow label="Muscle" options={targets} value={filters.target} onChange={(target) => patch({ target })} />
          </div>

          <p className="result-count">
            {results.length} résultat{results.length > 1 ? "s" : ""}
            {filters.homeOnly ? " réalisables à la maison" : ""}
          </p>

          <div className="exercise-grid">
            {results.slice(0, visible).map((exercise) => (
              <ExerciseCard
                key={exercise.id}
                exercise={exercise}
                favorite={favorites.includes(exercise.id)}
                onOpen={() => setSelected(exercise)}
              />
            ))}
          </div>
          {visible < results.length ? <div ref={sentinel} className="sentinel" aria-hidden="true" /> : null}
          {!results.length ? <p className="muted">Aucun exercice ne correspond. Élargis les filtres.</p> : null}
        </section>
      ) : null}

      {selected ? (
        <ExerciseSheet
          exercise={selected}
          onClose={() => setSelected(null)}
          onAddToWorkout={onAddToWorkout}
          favorite={favorites.includes(selected.id)}
          onToggleFavorite={() => toggleFavorite(selected.id)}
        />
      ) : null}
    </div>
  );
}
