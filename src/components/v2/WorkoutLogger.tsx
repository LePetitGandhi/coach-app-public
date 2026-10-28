"use client";

import { useMemo, useState } from "react";
import { Check, Dumbbell, Music, Plus, Repeat, Shuffle, SkipForward, Trash2, TrendingUp, Undo2 } from "lucide-react";
import {
  workoutFromTemplate,
  emptyExerciseLog,
  exerciseVolume,
  formatSet,
  countHardSets,
  progressionAdvice,
  workoutVolume,
} from "@/lib/v2/training";
import type { DailyLog, ExerciseLog, Feel, SetLog, WorkoutLog } from "@/lib/v2/types";
import { ALTERNATIVES, GYM, TRAINING_SPLIT } from "@/lib/v2/coachPlan";
import { readRestSeconds, RestTimer, saveRestSeconds } from "./RestTimer";
import { sessionToDo } from "@/lib/v2/schedule";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function toNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

let counter = 0;
function makeId(prefix: string) {
  counter += 1;
  return `${prefix}-${counter}-${Math.random().toString(36).slice(2, 8)}`;
}

const FEELS: { id: Feel; label: string }[] = [
  { id: "facile", label: "Facile" },
  { id: "ok", label: "Parfait" },
  { id: "dur", label: "Dur" },
  { id: "douleur", label: "Douleur" },
];

function FeelPicker({ value, onChange, label }: { value?: Feel; onChange: (feel?: Feel) => void; label: string }) {
  return (
    <div className="feel-row" role="group" aria-label={label}>
      {FEELS.map((feel) => (
        <button
          key={feel.id}
          type="button"
          className={cx("chip", `feel--${feel.id}`, value === feel.id && "is-active")}
          aria-pressed={value === feel.id}
          onClick={() => onChange(value === feel.id ? undefined : feel.id)}
        >
          {feel.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Charge avec décimales (12,5 kg). Le texte tapé est gardé tel quel pendant la
 * saisie : sans ça, « 12, » redevenait « 12 » à chaque frappe et la virgule
 * disparaissait avant qu'on puisse taper le 5.
 */
function KgInput({ value, onChange }: { value: number | undefined; onChange: (next: number | undefined) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value == null ? "" : String(value).replace(".", ","));
  return (
    <input
      inputMode="decimal"
      placeholder="PdC"
      value={shown}
      onChange={(event) => {
        setDraft(event.target.value);
        onChange(toNumber(event.target.value));
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

/** Saisie d'une série : reps, charge, RIR. */
function SetRow({
  index,
  set,
  onChange,
  onRemove,
}: {
  index: number;
  set: SetLog;
  onChange: (next: SetLog) => void;
  onRemove: () => void;
}) {
  return (
    <div className="set-row">
      <span className="set-row__index">{index + 1}</span>
      <label className="set-field">
        <span>Reps</span>
        <input
          inputMode="numeric"
          value={set.reps || ""}
          onChange={(event) => onChange({ ...set, reps: toNumber(event.target.value) ?? 0 })}
        />
      </label>
      <label className="set-field">
        <span>kg</span>
        <KgInput value={set.weightKg} onChange={(weightKg) => onChange({ ...set, weightKg })} />
      </label>
      <label className="set-field">
        <span>RIR</span>
        <input
          inputMode="numeric"
          placeholder="—"
          value={set.rir ?? ""}
          onChange={(event) => onChange({ ...set, rir: toNumber(event.target.value) })}
        />
      </label>
      <button type="button" className="icon-button" onClick={onRemove} aria-label={`Supprimer la série ${index + 1}`}>
        <Trash2 aria-hidden="true" />
      </button>
    </div>
  );
}

function ExerciseBlock({
  exercise,
  logs,
  date,
  onChange,
  onRemove,
  onSetAdded,
}: {
  exercise: ExerciseLog;
  logs: DailyLog[];
  date: string;
  onChange: (next: ExerciseLog) => void;
  onRemove: () => void;
  onSetAdded?: () => void;
}) {
  const advice = useMemo(
    () => progressionAdvice(logs, exercise.exerciseId ?? exercise.name, date, exercise.repRange),
    [logs, exercise.exerciseId, exercise.name, date, exercise.repRange],
  );

  function addSet() {
    const last = exercise.sets[exercise.sets.length - 1];
    const next: SetLog = last
      ? { ...last }
      : { reps: advice.suggestedReps ?? exercise.repRange?.[0] ?? 10, weightKg: advice.suggestedKg, rir: 2 };
    onChange({ ...exercise, sets: [...exercise.sets, next] });
    // La série précédente vient d'être faite : on lance le repos.
    if (exercise.sets.length) onSetAdded?.();
  }

  function updateSet(index: number, next: SetLog) {
    onChange({ ...exercise, sets: exercise.sets.map((set, i) => (i === index ? next : set)) });
  }

  function removeSet(index: number) {
    onChange({ ...exercise, sets: exercise.sets.filter((_, i) => i !== index) });
  }

  const volume = exerciseVolume(exercise);
  const [swapping, setSwapping] = useState(false);
  const [custom, setCustom] = useState("");
  const original = exercise.replacedFrom ?? exercise.name;
  const options = [
    ...(exercise.replacedFrom ? [exercise.replacedFrom] : []),
    ...(ALTERNATIVES[original] ?? []),
  ].filter((name) => name !== exercise.name);

  function replaceWith(name: string) {
    const clean = name.trim();
    if (!clean) return;
    onChange({
      ...exercise,
      name: clean,
      exerciseId: undefined,
      replacedFrom: clean === original ? undefined : original,
      sets: [],
      skipped: false,
    });
    setSwapping(false);
    setCustom("");
  }

  if (exercise.skipped) {
    return (
      <article className="exercise-block exercise-block--skipped">
        <header className="exercise-block__head">
          <div>
            <strong>{exercise.name}</strong>
            <span className="exercise-block__volume">Sauté</span>
          </div>
          <button type="button" className="link-button" onClick={() => onChange({ ...exercise, skipped: false })}>
            <Undo2 className="inline-icon" aria-hidden="true" /> Reprendre
          </button>
        </header>
      </article>
    );
  }

  return (
    <article className="exercise-block">
      <header className="exercise-block__head">
        <div>
          <strong>{exercise.name}</strong>
          {exercise.replacedFrom ? (
            <span className="exercise-block__volume">à la place de {exercise.replacedFrom}</span>
          ) : null}
          {exercise.target ? <span className="exercise-block__volume">Objectif {exercise.target}</span> : null}
          {volume > 0 ? <span className="exercise-block__volume">{volume} kg de tonnage</span> : null}
        </div>
        <div className="exercise-block__actions">
          <button
            type="button"
            className={cx("icon-button", swapping && "is-active")}
            onClick={() => setSwapping((value) => !value)}
            aria-label={`Remplacer ${exercise.name}`}
            aria-expanded={swapping}
          >
            <Shuffle aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => onChange({ ...exercise, skipped: true, sets: [] })}
            aria-label={`Sauter ${exercise.name}`}
          >
            <SkipForward aria-hidden="true" />
          </button>
          <button type="button" className="icon-button" onClick={onRemove} aria-label={`Retirer ${exercise.name}`}>
            <Trash2 aria-hidden="true" />
          </button>
        </div>
      </header>

      {swapping ? (
        <div className="swap-panel">
          <span className="muted">Machine prise ou absente ? Remplace par :</span>
          <div className="chip-row__items">
            {options.map((name) => (
              <button key={name} type="button" className="chip" onClick={() => replaceWith(name)}>
                {name === exercise.replacedFrom ? `↩ ${name}` : name}
              </button>
            ))}
          </div>
          <div className="swap-panel__custom">
            <input
              value={custom}
              placeholder="Autre exercice…"
              onChange={(event) => setCustom(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  replaceWith(custom);
                }
              }}
            />
            <button type="button" className="secondary-button" disabled={!custom.trim()} onClick={() => replaceWith(custom)}>
              OK
            </button>
          </div>
        </div>
      ) : null}

      <p className={cx("advice", `advice--${advice.status}`)}>
        <TrendingUp aria-hidden="true" />
        <span>{advice.message}</span>
      </p>

      {exercise.sets.length ? (
        <div className="set-list">
          {exercise.sets.map((set, index) => (
            <SetRow
              key={index}
              index={index}
              set={set}
              onChange={(next) => updateSet(index, next)}
              onRemove={() => removeSet(index)}
            />
          ))}
        </div>
      ) : null}

      <button type="button" className="quick-button quick-button--full" onClick={addSet}>
        <Plus aria-hidden="true" />
        <span>{exercise.sets.length ? "Série suivante" : "Première série"}</span>
      </button>

      {exercise.sets.length ? (
        <>
          <FeelPicker label={`Ressenti ${exercise.name}`} value={exercise.feel} onChange={(feel) => onChange({ ...exercise, feel })} />
          {exercise.feel ? (
            <input
              className="note-input"
              value={exercise.note ?? ""}
              placeholder={exercise.feel === "douleur" ? "Où ? Quel mouvement ?" : "Note (optionnel)"}
              onChange={(event) => onChange({ ...exercise, note: event.target.value || undefined })}
            />
          ) : null}
        </>
      ) : null}
    </article>
  );
}

export function WorkoutLogger({
  today,
  logs,
  updateToday,
}: {
  today: DailyLog;
  logs: DailyLog[];
  updateToday: (log: DailyLog) => void;
}) {
  const [exerciseName, setExerciseName] = useState("");
  const [restEnd, setRestEnd] = useState<number | null>(null);
  const [restSeconds, setRestSeconds] = useState(() => (typeof window === "undefined" ? 90 : readRestSeconds()));

  function startRest(seconds = restSeconds) {
    setRestEnd(Date.now() + seconds * 1000);
  }

  const workout: WorkoutLog | null = today.workouts[today.workouts.length - 1] ?? null;

  const [confirmingDelete, setConfirmingDelete] = useState(false);

  /** Retire la séance (enregistrée par erreur) ; demande une confirmation d'abord. */
  function deleteWorkout() {
    if (!workout) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setConfirmingDelete(false);
    updateToday({ ...today, workouts: today.workouts.filter((item) => item.id !== workout.id) });
  }

  const deleteButton = (
    <button type="button" className="link-button" onClick={deleteWorkout} onBlur={() => setConfirmingDelete(false)}>
      <Trash2 className="inline-icon" aria-hidden="true" />{" "}
      {confirmingDelete ? "Confirmer : supprimer cette séance" : "Supprimer cette séance (enregistrée par erreur)"}
    </button>
  );

  function writeWorkout(next: WorkoutLog) {
    updateToday({
      ...today,
      workouts: today.workouts.map((item) => (item.id === next.id ? next : item)),
    });
  }

  function startWorkout(focus: string) {
    const template = TRAINING_SPLIT.find((session) => session.title === focus);
    const created: WorkoutLog = template
      ? workoutFromTemplate(template.title, template.exercises, makeId)
      : { id: makeId("workout"), focus, minutes: 0, hardSets: 0, progression: false, completed: false, exercises: [] };
    updateToday({ ...today, workouts: [...today.workouts, created] });
  }

  const todo = sessionToDo(logs);
  const todaySession = todo?.session ?? null;

  function addExercise(name: string, exerciseId?: string) {
    if (!workout || !name.trim()) return;
    writeWorkout({
      ...workout,
      exercises: [...workout.exercises, emptyExerciseLog(name.trim(), exerciseId, makeId("ex"))],
    });
    setExerciseName("");
  }

  if (!workout || workout.completed) {
    return (
      <section className="panel">
        <div className="panel__title">
          <div>
            <span className="eyebrow">Séance</span>
            <h2>{workout?.completed ? "Séance validée" : "Démarrer une séance"}</h2>
          </div>
          <Dumbbell className="panel-icon" aria-hidden="true" />
        </div>
        {workout?.completed ? (
          <div className="recap">
            <p className="muted">
              {workout.focus} · {countHardSets(workout)} séries dures · {workoutVolume(workout)} kg de tonnage
            </p>
            <ul className="log-list">
              {workout.exercises.map((exercise) => (
                <li key={exercise.id}>
                  <span>
                    {exercise.name}
                    {exercise.replacedFrom ? <em className="quick-button__meta"> au lieu de {exercise.replacedFrom}</em> : null}
                    {exercise.feel ? <em className={cx("tag", `feel--${exercise.feel}`)}>{exercise.feel}</em> : null}
                  </span>
                  <strong>{exercise.skipped ? "sauté" : exercise.sets.map(formatSet).join(" · ") || "—"}</strong>
                </li>
              ))}
            </ul>
            {workout.note ? <p className="muted">« {workout.note} »</p> : null}
            {deleteButton}
          </div>
        ) : null}
        {todaySession && !workout?.completed ? (
          <button type="button" className="primary-button primary-button--block" onClick={() => startWorkout(todaySession.title)}>
            <Dumbbell className="h-4 w-4" aria-hidden="true" />
            {todo?.kind === "rattrapage" ? `Rattrapage (${todaySession.day.toLowerCase()}) : ` : "Séance du jour : "}
            {todaySession.title}
          </button>
        ) : null}
        <p className="muted">
          {GYM.name} · les exercices sont pré-remplis, tu n&apos;as plus qu&apos;à noter reps et kg. Machine prise ou
          absente : remplace-la par l&apos;équivalent haltères, garde le même nom la fois suivante.
        </p>
        <div className="quick-grid quick-grid--two">
          {TRAINING_SPLIT.filter((session) => session.title !== todaySession?.title).map((session) => (
            <button key={session.day} type="button" className="quick-button" onClick={() => startWorkout(session.title)}>
              <Plus aria-hidden="true" />
              <span>
                {session.title}
                <em className="quick-button__meta">prévue le {session.day.toLowerCase()}</em>
              </span>
            </button>
          ))}
          <button type="button" className="quick-button" onClick={() => startWorkout("Séance libre")}>
            <Plus aria-hidden="true" />
            <span>Séance libre</span>
          </button>
        </div>
      </section>
    );
  }

  const hardSetCount = countHardSets(workout);

  return (
    <section className="panel panel--lead">
      <div className="panel__title">
        <div>
          <span className="eyebrow">Séance en cours</span>
          <h2>{workout.focus}</h2>
        </div>
        <Dumbbell className="panel-icon" aria-hidden="true" />
      </div>

      {restEnd ? (
        <RestTimer
          endsAt={restEnd}
          duration={restSeconds}
          onDuration={(seconds) => {
            setRestSeconds(seconds);
            saveRestSeconds(seconds);
            startRest(seconds);
          }}
          onExtend={(seconds) => setRestEnd((end) => (end ?? Date.now()) + seconds * 1000)}
          onStop={() => setRestEnd(null)}
        />
      ) : null}

      <a className="music-link" href="music://">
        <Music aria-hidden="true" />
        <span>Ouvrir Musique</span>
      </a>

      <div className="plan-targets">
        <div className="stat-pill">
          <Repeat aria-hidden="true" />
          <span>Séries dures</span>
          <strong>{hardSetCount}</strong>
        </div>
        <div className="stat-pill">
          <Dumbbell aria-hidden="true" />
          <span>Tonnage</span>
          <strong>{workoutVolume(workout)} kg</strong>
        </div>
      </div>

      {workout.exercises.map((exercise) => (
        <ExerciseBlock
          key={exercise.id}
          exercise={exercise}
          logs={logs}
          date={today.date}
          onChange={(next) =>
            writeWorkout({
              ...workout,
              exercises: workout.exercises.map((item) => (item.id === next.id ? next : item)),
            })
          }
          onRemove={() =>
            writeWorkout({
              ...workout,
              exercises: workout.exercises.filter((item) => item.id !== exercise.id),
            })
          }
          onSetAdded={() => startRest()}
        />
      ))}

      <div className="form-grid">
        <label className="field field--wide">
          <span>Ajouter un exercice</span>
          <input
            value={exerciseName}
            placeholder="Traction, développé couché…"
            onChange={(event) => setExerciseName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addExercise(exerciseName);
              }
            }}
          />
        </label>
        <button type="button" className="primary-button" onClick={() => addExercise(exerciseName)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Ajouter
        </button>
      </div>
      <p className="muted">
        Tu peux aussi passer par l&apos;onglet Exos et utiliser « Ajouter à la séance » : le nom et
        l&apos;identifiant sont repris, donc l&apos;historique se relie tout seul d&apos;une semaine à l&apos;autre.
      </p>

      <div className="session-end">
        <span className="section-title">Fin de séance</span>
        <FeelPicker label="Ressenti global" value={workout.feel} onChange={(feel) => writeWorkout({ ...workout, feel })} />
        <textarea
          className="note-input"
          value={workout.note ?? ""}
          placeholder="Ce qui a changé, ce qui a coincé, à retenir pour la prochaine fois…"
          onChange={(event) => writeWorkout({ ...workout, note: event.target.value || undefined })}
        />
      </div>

      <div className="form-grid">
        <label className="field">
          <span>Durée</span>
          <div className="input-with-suffix">
            <input
              inputMode="numeric"
              value={workout.minutes || ""}
              onChange={(event) => writeWorkout({ ...workout, minutes: toNumber(event.target.value) ?? 0 })}
            />
            <em>min</em>
          </div>
        </label>
        <button
          type="button"
          className="primary-button"
          onClick={() => writeWorkout({ ...workout, completed: true, hardSets: hardSetCount })}
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          Terminer la séance
        </button>
      </div>
      {deleteButton}
    </section>
  );
}
