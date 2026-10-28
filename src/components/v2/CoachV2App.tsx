"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Apple,
  BarChart3,
  CalendarCheck,
  Check,
  ChevronRight,
  Dumbbell,
  Flame,
  Moon,
  MoreHorizontal,
  Settings,
  Ruler,
  Salad,
  Scale,
  Target,
  TimerReset,
  Zap,
} from "lucide-react";
import {
  COACH_PRINCIPLES,
  DEFAULT_REMINDERS,
  MINIMUM_DAY,
  NUTRITION_RULES,
  TRAINING_SPLIT,
  V2_PROFILE,
  V2_TARGETS,
} from "@/lib/v2/coachPlan";
import {
  buildCheckin,
  buildWeeklySummary,
  emptyDailyLog,
  mealTotals,
  objectiveProgress,
  scoreDailyLog,
} from "@/lib/v2/metrics";
import {
  addCheckin,
  getTodayLog,
  loadCoachV2State,
  saveCoachV2State,
  upsertDailyLog,
} from "@/lib/v2/storage";
import { bfCategoryMen, bodySeries, composeBody, deltaSince, recompositionVerdict } from "@/lib/v2/body";
import { emptyExerciseLog, workoutFromTemplate } from "@/lib/v2/training";
import type {
  BodyComposition,
  CoachV2State,
  DailyLog,
  Mood,
  Reminder,
} from "@/lib/v2/types";
import { ExerciseLibrary } from "./ExerciseLibrary";
import { NutritionTab } from "./NutritionTab";
import { WorkoutLogger } from "./WorkoutLogger";
import { WorkoutHistory } from "./WorkoutHistory";
import { DataPanel, RemindersPanel } from "./DataPanel";
import { SyncPanel } from "./SyncPanel";
import { TodayFocus } from "./TodayFocus";
import { ActivityHeatmap } from "./ActivityHeatmap";
import { ProgressPhotos } from "./ProgressPhotos";
import { WeightTrendPanel } from "./WeightTrendPanel";
import { startSync } from "@/lib/v2/sync";
import { applyMealDiff, loadPantry, savePantry } from "@/lib/v2/pantry";

type Tab = "today" | "nutrition" | "exercises" | "progress" | "more";
type MoreView = "plan" | "checkin" | "settings";

const TABS: { id: Tab; label: string; icon: typeof Target }[] = [
  { id: "today", label: "Jour", icon: Flame },
  { id: "nutrition", label: "Repas", icon: Salad },
  { id: "exercises", label: "Exos", icon: Dumbbell },
  { id: "progress", label: "Progrès", icon: BarChart3 },
  { id: "more", label: "Plus", icon: MoreHorizontal },
];

const MORE_VIEWS: { id: MoreView; label: string; icon: typeof Target }[] = [
  { id: "plan", label: "Plan", icon: Target },
  { id: "checkin", label: "Bilan", icon: CalendarCheck },
  { id: "settings", label: "Réglages", icon: Settings },
];

/** Anciennes URL (?tab=plan, /checkin) → onglet « Plus » + sous-vue. */
function resolveTab(requested: string | null | undefined): { tab: Tab; more?: MoreView } | null {
  if (!requested) return null;
  if (requested === "plan" || requested === "checkin" || requested === "settings") return { tab: "more", more: requested };
  if (TABS.some((tab) => tab.id === requested)) return { tab: requested as Tab };
  return null;
}


let idCounter = 0;

/** Identifiant local stable, généré hors rendu pour rester pur. */
function makeId(prefix: string) {
  idCounter += 1;
  return `${prefix}-${idCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function toNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function pct(value: number, max: number) {
  return `${Math.min(100, Math.max(0, (value / max) * 100))}%`;
}

function toneText(score: number) {
  if (score >= 85) return "Tu construis le physique. Ne baisse pas le standard.";
  if (score >= 70) return "Solide. Maintenant cherche la micro-progression.";
  if (score >= 50) return "Ce n'est pas dramatique, mais ce n'est pas assez net. Verrouille le prochain repas.";
  return "Rattrapage immédiat : protéines, marche, coucher. Pas de théâtre, une action.";
}

function StatPill({ icon: Icon, label, value }: { icon: typeof Target; label: string; value: string }) {
  return (
    <div className="stat-pill">
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MetricBar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className="metric-row">
      <div className="metric-row__label">
        <span>{label}</span>
        <strong>
          {value}/{max}
        </strong>
      </div>
      <div className="metric-track" aria-hidden="true">
        <span style={{ width: pct(value, max) }} />
      </div>
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  suffix,
  step = "1",
}: {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  suffix?: string;
  step?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="input-with-suffix">
        <input inputMode="decimal" step={step} value={value ?? ""} onChange={(event) => onChange(toNumber(event.target.value))} />
        {suffix ? <em>{suffix}</em> : null}
      </div>
    </label>
  );
}

function CoachHeader({ score, summary }: { score: ReturnType<typeof scoreDailyLog>; summary: ReturnType<typeof buildWeeklySummary> }) {
  const date = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  return (
    <header className="topbar">
      <div className="topbar__copy">
        <span className="topbar__date">{date}</span>
        <h1>{toneText(score.score)}</h1>
      </div>
      <div className="topbar__stats" aria-label="Résumé">
        <span className="mini-stat" title="Série de jours trackés">
          <Flame aria-hidden="true" />
          {summary.streak} j
        </span>
        <span className="mini-stat" title="Séances cette semaine">
          <Dumbbell aria-hidden="true" />
          {summary.workoutsDone}/{V2_TARGETS.workoutsPerWeek}
        </span>
        <MiniDial score={score.score} />
      </div>
    </header>
  );
}

function MiniDial({ score }: { score: number }) {
  return (
    <span
      className="mini-dial"
      style={{ background: `conic-gradient(var(--accent-red) ${score}%, var(--line) 0)` }}
      title="Score de discipline du jour"
    >
      <strong>{score}</strong>
    </span>
  );
}

function MeasurementsPanel({
  today,
  updateToday,
}: {
  today: DailyLog;
  updateToday: (log: DailyLog) => void;
}) {
  const composition = composeBody(today.date, today.body, V2_PROFILE.heightCm);

  function setBody(patch: Partial<DailyLog["body"]>) {
    updateToday({ ...today, body: { ...today.body, ...patch } });
  }

  return (
    <section className="panel">
      <div className="panel__title">
        <div>
          <span className="eyebrow">Mensurations</span>
          <h2>Composition corporelle</h2>
        </div>
        <Scale className="panel-icon" aria-hidden="true" />
      </div>
      <p className="muted">
        Une fois par semaine suffit — même jour, le matin à jeun, avant de boire. Le tour de cou
        et le tour de taille permettent d&apos;estimer la masse grasse ; un pourcentage mesuré
        (balance à impédance, pince) prend le dessus s&apos;il est renseigné.
      </p>
      <div className="form-grid">
        <NumberInput label="Tour de taille" value={today.body.waistCm} suffix="cm" step="0.5" onChange={(waistCm) => setBody({ waistCm })} />
        <NumberInput label="Tour de cou" value={today.body.neckCm} suffix="cm" step="0.5" onChange={(neckCm) => setBody({ neckCm })} />
        <NumberInput label="Poitrine" value={today.body.chestCm} suffix="cm" step="0.5" onChange={(chestCm) => setBody({ chestCm })} />
        <NumberInput label="Épaules" value={today.body.shoulderCm} suffix="cm" step="0.5" onChange={(shoulderCm) => setBody({ shoulderCm })} />
        <NumberInput label="Bras contracté" value={today.body.armCm} suffix="cm" step="0.5" onChange={(armCm) => setBody({ armCm })} />
        <NumberInput label="Cuisse" value={today.body.thighCm} suffix="cm" step="0.5" onChange={(thighCm) => setBody({ thighCm })} />
        <NumberInput label="Masse grasse mesurée" value={today.body.bodyFatPct} suffix="%" step="0.1" onChange={(bodyFatPct) => setBody({ bodyFatPct })} />
      </div>

      {composition ? (
        <div className="composition-readout">
          <div className="composition-cell composition-cell--lean">
            <span>Masse maigre</span>
            <strong>{composition.leanKg} kg</strong>
          </div>
          <div className="composition-cell composition-cell--fat">
            <span>Masse grasse</span>
            <strong>{composition.fatKg} kg</strong>
          </div>
          <div className="composition-cell">
            <span>Taux de gras</span>
            <strong>{composition.bodyFatPct} %</strong>
            <em>{composition.source === "navy" ? "estimé (mètre ruban)" : "mesuré"}</em>
          </div>
        </div>
      ) : (
        <p className="muted">
          Renseigne le poids, puis soit le tour de taille et le tour de cou, soit un pourcentage
          de masse grasse mesuré — la composition apparaîtra ici.
        </p>
      )}
    </section>
  );
}

function TodayTab({
  today,
  logs,
  updateToday,
}: {
  today: DailyLog;
  logs: DailyLog[];
  updateToday: (log: DailyLog) => void;
}) {
  const totals = mealTotals(today);
  const score = scoreDailyLog(today);

  return (
    <div className="tab-grid">
      <WorkoutLogger today={today} logs={logs} updateToday={updateToday} />
      <WorkoutHistory logs={logs} today={today.date} />

      <section className="panel">
        <div className="panel__title">
          <div>
            <span className="eyebrow">Corps + récup</span>
            <h2>Check du jour</h2>
          </div>
          <Ruler className="panel-icon" aria-hidden="true" />
        </div>
        <div className="form-grid">
          <NumberInput label="Poids" value={today.body.weightKg} suffix="kg" step="0.1" onChange={(weightKg) => updateToday({ ...today, body: { ...today.body, weightKg } })} />
          <NumberInput label="Sommeil" value={today.recovery.sleepHours} suffix="h" step="0.25" onChange={(sleepHours) => updateToday({ ...today, recovery: { ...today.recovery, sleepHours } })} />
          <NumberInput label="Pas" value={today.recovery.steps} suffix="" onChange={(steps) => updateToday({ ...today, recovery: { ...today.recovery, steps } })} />
          <NumberInput label="Eau" value={today.recovery.waterL} suffix="L" step="0.1" onChange={(waterL) => updateToday({ ...today, recovery: { ...today.recovery, waterL } })} />
        </div>
        <details className="disclosure">
          <summary>Énergie, humeur, note…</summary>
          <div className="form-grid">
          <label className="field">
            <span>Énergie</span>
            <input
              type="range"
              min="1"
              max="5"
              value={today.recovery.energy}
              onChange={(event) =>
                updateToday({ ...today, recovery: { ...today.recovery, energy: Number(event.target.value) as 1 | 2 | 3 | 4 | 5 } })
              }
            />
          </label>
          <label className="field">
            <span>Humeur</span>
            <select value={today.recovery.mood} onChange={(event) => updateToday({ ...today, recovery: { ...today.recovery, mood: event.target.value as Mood } })}>
              <option value="solide">Solide</option>
              <option value="neutre">Neutre</option>
              <option value="bas">Bas</option>
            </select>
          </label>
          <label className="field">
            <span>Respect plan</span>
            <input
              type="range"
              min="1"
              max="5"
              value={today.planRespect}
              onChange={(event) => updateToday({ ...today, planRespect: Number(event.target.value) as 1 | 2 | 3 | 4 | 5 })}
            />
          </label>
          <label className="field field--wide">
            <span>Note honnête</span>
            <textarea value={today.notes} onChange={(event) => updateToday({ ...today, notes: event.target.value })} />
          </label>
          </div>
        </details>
      </section>

      <details className="panel disclosure-panel">
        <summary>
          <span className="eyebrow">Score du jour</span>
          <strong>
            {score.score}/100 · {score.label}
          </strong>
        </summary>
      <div className="disclosure-panel__body">
        <p className="coach-line">{score.label}. Focus prioritaire : {score.primaryGap}.</p>
        <div className="metric-list">
          <MetricBar label="Protéines" value={score.breakdown.protein} max={30} />
          <MetricBar label="Entraînement / pas" value={score.breakdown.training} max={25} />
          <MetricBar label="Récupération" value={score.breakdown.recovery} max={20} />
          <MetricBar label="Tracking" value={score.breakdown.tracking} max={15} />
          <MetricBar label="Plan" value={score.breakdown.plan} max={10} />
        </div>
        {score.caloriePenalty > 0 ? (
          <p className="coach-line coach-line--warn">
            −{score.caloriePenalty} points : {totals.calories} kcal contre {V2_TARGETS.calories} visées.{" "}
            {totals.calories > V2_TARGETS.calories
              ? "L'excédent part en gras, pas en muscle."
              : "Trop bas pour construire : le muscle a besoin du carburant."}
          </p>
        ) : null}
      </div>

      </details>
    </div>
  );
}

function SettingsView({ state, onRestore }: { state: CoachV2State; onRestore: (state: CoachV2State) => void }) {
  return (
    <div className="tab-grid">
      <SyncPanel />
      <RemindersPanel state={state} />
      <DataPanel state={state} onRestore={onRestore} />
    </div>
  );
}

function PlanTab({ state, setState }: { state: CoachV2State; setState: (state: CoachV2State) => void }) {
  function toggleReminder(reminder: Reminder) {
    const reminders = state.reminders.map((item) => (item.id === reminder.id ? { ...item, enabled: !item.enabled } : item));
    const next = { ...state, reminders };
    saveCoachV2State(next);
    setState(next);
  }

  function resetReminders() {
    const next = { ...state, reminders: DEFAULT_REMINDERS };
    saveCoachV2State(next);
    setState(next);
  }

  return (
    <div className="tab-grid">
      <section className="panel panel--lead">
        <div className="panel__title">
          <div>
            <span className="eyebrow">Plan d&apos;action</span>
            <h2>Sèche légère, muscle préservé</h2>
          </div>
          <Target className="panel-icon" aria-hidden="true" />
        </div>
        <div className="plan-targets">
          <StatPill icon={Apple} label="Calories" value={`${V2_TARGETS.calories}`} />
          <StatPill icon={Zap} label="Protéines" value={`${V2_TARGETS.proteinG} g`} />
          <StatPill icon={Dumbbell} label="Séances" value={`${V2_TARGETS.workoutsPerWeek}/sem`} />
          <StatPill icon={Moon} label="Sommeil" value={`${V2_TARGETS.sleepHours} h`} />
        </div>
        <ul className="rule-list">
          {COACH_PRINCIPLES.map((rule) => (
            <li key={rule}>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
              <span>{rule}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <div className="panel__title">
          <div>
            <span className="eyebrow">Split</span>
            <h2>4 séances efficaces</h2>
          </div>
          <Dumbbell className="panel-icon" aria-hidden="true" />
        </div>
        <div className="timeline">
          {TRAINING_SPLIT.map((session) => (
            <article key={session.day} className="timeline-item">
              <strong>{session.day}</strong>
              <div>
                <h3>{session.title}</h3>
                <p>{session.focus}</p>
                <ul>
                  {session.rules.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel__title">
          <div>
            <span className="eyebrow">Nutrition</span>
            <h2>Règles non négociables</h2>
          </div>
          <Apple className="panel-icon" aria-hidden="true" />
        </div>
        <ul className="rule-list">
          {NUTRITION_RULES.map((rule) => (
            <li key={rule}>
              <Check className="h-4 w-4" aria-hidden="true" />
              <span>{rule}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <div className="panel__title">
          <div>
            <span className="eyebrow">Journée minimale</span>
            <h2>Quand la journée part mal</h2>
          </div>
          <TimerReset className="panel-icon" aria-hidden="true" />
        </div>
        <ul className="rule-list">
          {MINIMUM_DAY.map((rule) => (
            <li key={rule}>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
              <span>{rule}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <div className="panel__title">
          <div>
            <span className="eyebrow">Rappels</span>
            <h2>Discipline quotidienne</h2>
          </div>
          <CalendarCheck className="panel-icon" aria-hidden="true" />
        </div>
        <div className="reminder-list">
          {state.reminders.map((reminder) => (
            <button key={reminder.id} className={cx("reminder", reminder.enabled && "is-on")} type="button" onClick={() => toggleReminder(reminder)}>
              <span>{reminder.time}</span>
              <strong>{reminder.label}</strong>
              <em>{reminder.enabled ? "Actif" : "Off"}</em>
            </button>
          ))}
        </div>
        <button className="secondary-button" type="button" onClick={resetReminders}>
          <TimerReset className="h-4 w-4" aria-hidden="true" />
          Réinitialiser
        </button>
      </section>
    </div>
  );
}

function ProgressTab({
  state,
  today,
  updateToday,
}: {
  state: CoachV2State;
  today: DailyLog;
  updateToday: (log: DailyLog) => void;
}) {
  const summary = buildWeeklySummary(state.dailyLogs);
  const lastLogs = state.dailyLogs.slice(0, 14).sort((a, b) => a.date.localeCompare(b.date));
  const maxScore = 100;

  return (
    <div className="tab-grid">
      <section className="panel panel--lead">
        <div className="panel__title">
          <div>
            <span className="eyebrow">Bilan semaine</span>
            <h2>{summary.score}/100</h2>
          </div>
          <Activity className="panel-icon" aria-hidden="true" />
        </div>
        <p className="coach-line">{summary.coachLine}</p>
        <div className="plan-targets">
          <StatPill icon={Dumbbell} label="Séances" value={`${summary.workoutsDone}/${V2_TARGETS.workoutsPerWeek}`} />
          <StatPill icon={Apple} label="Prot." value={`${summary.proteinDays}/7 j`} />
          <StatPill icon={Moon} label="Sommeil" value={summary.avgSleep ? `${summary.avgSleep} h` : "n/a"} />
          <StatPill icon={Ruler} label="Taille" value={summary.waistTrendCm == null ? "n/a" : `${summary.waistTrendCm > 0 ? "+" : ""}${summary.waistTrendCm} cm`} />
        </div>
      </section>

      <section className="panel">
        <div className="panel__title">
          <div>
            <span className="eyebrow">14 derniers jours</span>
            <h2>Score visible</h2>
          </div>
          <BarChart3 className="panel-icon" aria-hidden="true" />
        </div>
        <div className="mini-chart" aria-label="Scores des 14 derniers jours">
          {lastLogs.map((log) => {
            const score = scoreDailyLog(log).score;
            return (
              <div key={log.date} className="bar">
                <span style={{ height: pct(score, maxScore) }} />
                <em>{log.date.slice(5)}</em>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <div className="panel__title">
          <div>
            <span className="eyebrow">Objectifs hebdo</span>
            <h2>
              {state.objectives.filter((objective) => objectiveProgress(objective, summary) >= objective.target).length}
              /{state.objectives.length} atteints
            </h2>
          </div>
          <Target className="panel-icon" aria-hidden="true" />
        </div>
        <div className="metric-list">
          {state.objectives.map((objective) => (
            <MetricBar
              key={objective.id}
              label={objective.label}
              value={Math.min(objectiveProgress(objective, summary), objective.target)}
              max={objective.target}
            />
          ))}
        </div>
      </section>

      <CompositionPanel state={state} />

      <section className="panel">
        <div className="panel__title">
          <div>
            <span className="eyebrow">Mensurations</span>
            <h2>Dernières mesures</h2>
          </div>
          <Ruler className="panel-icon" aria-hidden="true" />
        </div>
        <div className="trend-grid">
          {state.dailyLogs
            .filter((log) => log.body.weightKg || log.body.waistCm)
            .slice(0, 6)
            .map((log) => (
              <div key={log.date} className="trend-row">
                <span>{log.date}</span>
                <strong>{log.body.weightKg ? `${log.body.weightKg} kg` : "poids n/a"}</strong>
                <em>{log.body.waistCm ? `${log.body.waistCm} cm taille` : "taille n/a"}</em>
              </div>
            ))}
          {!state.dailyLogs.some((log) => log.body.weightKg || log.body.waistCm) ? (
            <p className="muted">Aucune mesure enregistrée. Onglet Jour → Composition corporelle.</p>
          ) : null}
        </div>
      </section>
      <WeightTrendPanel logs={state.dailyLogs} />
      <MeasurementsPanel today={today} updateToday={updateToday} />
      <ProgressPhotos />
    </div>
  );
}

function DeltaBadge({ label, value, unit, goodWhen }: { label: string; value: number | null; unit: string; goodWhen: "up" | "down" }) {
  if (value == null) {
    return (
      <div className="delta">
        <span>{label}</span>
        <strong className="delta--none">n/a</strong>
      </div>
    );
  }
  const neutral = Math.abs(value) < 0.2;
  const good = goodWhen === "up" ? value > 0 : value < 0;
  return (
    <div className="delta">
      <span>{label}</span>
      <strong className={neutral ? "delta--none" : good ? "delta--good" : "delta--bad"}>
        {value > 0 ? "+" : ""}
        {value} {unit}
      </strong>
    </div>
  );
}

/** Double courbe masse maigre / masse grasse, échelle commune. */
function CompositionChart({ series }: { series: BodyComposition[] }) {
  const points = series.slice(-16);
  if (points.length < 2) return null;

  const values = points.flatMap((point) => [point.leanKg, point.fatKg]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = span * 0.12;
  const lo = min - pad;
  const hi = max + pad;

  const x = (index: number) => (index / (points.length - 1)) * 100;
  const y = (value: number) => 100 - ((value - lo) / (hi - lo)) * 100;
  const path = (pick: (point: BodyComposition) => number) =>
    points.map((point, index) => `${index === 0 ? "M" : "L"} ${x(index).toFixed(2)} ${y(pick(point)).toFixed(2)}`).join(" ");

  return (
    <div className="composition-chart">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Évolution masse maigre et masse grasse">
        <path d={path((point) => point.leanKg)} className="line line--lean" vectorEffect="non-scaling-stroke" />
        <path d={path((point) => point.fatKg)} className="line line--fat" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="chart-legend">
        <span className="chart-legend__item chart-legend__item--lean">Masse maigre</span>
        <span className="chart-legend__item chart-legend__item--fat">Masse grasse</span>
        <span className="chart-legend__range">
          {points[0].date.slice(5)} → {points[points.length - 1].date.slice(5)}
        </span>
      </div>
    </div>
  );
}

function CompositionPanel({ state }: { state: CoachV2State }) {
  const series = useMemo(() => bodySeries(state.dailyLogs, V2_PROFILE.heightCm), [state.dailyLogs]);
  const latest = series.length ? series[series.length - 1] : null;

  if (!latest) {
    return (
      <section className="panel">
        <div className="panel__title">
          <div>
            <span className="eyebrow">Composition</span>
            <h2>Masse maigre</h2>
          </div>
          <Scale className="panel-icon" aria-hidden="true" />
        </div>
        <p className="muted">
          Pas encore de mesure exploitable. Dans l&apos;onglet Jour, saisis ton poids et — au
          choix — le tour de taille avec le tour de cou, ou un pourcentage de masse grasse mesuré.
        </p>
      </section>
    );
  }

  const category = bfCategoryMen(latest.bodyFatPct);

  return (
    <section className="panel panel--lead">
      <div className="panel__title">
        <div>
          <span className="eyebrow">Composition · {latest.date}</span>
          <h2>{latest.leanKg} kg de masse maigre</h2>
        </div>
        <Scale className="panel-icon" aria-hidden="true" />
      </div>

      <p className="coach-line">{recompositionVerdict(series)}</p>

      <div className="composition-readout">
        <div className="composition-cell composition-cell--lean">
          <span>Masse maigre</span>
          <strong>{latest.leanKg} kg</strong>
        </div>
        <div className="composition-cell composition-cell--fat">
          <span>Masse grasse</span>
          <strong>{latest.fatKg} kg</strong>
        </div>
        <div className="composition-cell">
          <span>Taux de gras</span>
          <strong>{latest.bodyFatPct} %</strong>
          <em className={`tone-${category.tone}`}>{category.label}</em>
        </div>
      </div>

      <CompositionChart series={series} />

      <div className="delta-grid">
        <DeltaBadge label="Masse maigre / 30 j" value={deltaSince(series, "leanKg", 30)} unit="kg" goodWhen="up" />
        <DeltaBadge label="Masse grasse / 30 j" value={deltaSince(series, "fatKg", 30)} unit="kg" goodWhen="down" />
        <DeltaBadge label="Masse maigre / 90 j" value={deltaSince(series, "leanKg", 90)} unit="kg" goodWhen="up" />
        <DeltaBadge label="Masse grasse / 90 j" value={deltaSince(series, "fatKg", 90)} unit="kg" goodWhen="down" />
      </div>

      <p className="muted">
        {latest.source === "navy"
          ? "Taux estimé au mètre ruban (formule US Navy, ±3 à 4 points). Le chiffre absolu compte peu : c'est la tendance qui est fiable."
          : "Taux issu de ta mesure directe."}{" "}
        Mesures relevées sur {series.length} jour{series.length > 1 ? "s" : ""}.
      </p>
    </section>
  );
}

function CheckinTab({ state, setState }: { state: CoachV2State; setState: (state: CoachV2State) => void }) {
  const [wins, setWins] = useState("");
  const [friction, setFriction] = useState("");
  const [focus, setFocus] = useState("Sécuriser protéines + 4 séances");
  const summary = buildWeeklySummary(state.dailyLogs);

  function createCheckin() {
    const checkin = buildCheckin(state.dailyLogs, wins, friction, focus);
    setState(addCheckin(state, checkin));
    setWins("");
    setFriction("");
  }

  return (
    <div className="tab-grid">
      <section className="panel panel--lead">
        <div className="panel__title">
          <div>
            <span className="eyebrow">Check-in</span>
            <h2>Coach strict, pas brutal</h2>
          </div>
          <CalendarCheck className="panel-icon" aria-hidden="true" />
        </div>
        <p className="coach-line">{summary.coachLine}</p>
        <div className="form-grid">
          <label className="field field--wide">
            <span>Victoires</span>
            <textarea value={wins} onChange={(event) => setWins(event.target.value)} placeholder="Ce qui a été exécuté malgré la friction" />
          </label>
          <label className="field field--wide">
            <span>Friction</span>
            <textarea value={friction} onChange={(event) => setFriction(event.target.value)} placeholder="Ce qui a coûté trop cher en énergie" />
          </label>
          <label className="field field--wide">
            <span>Focus semaine prochaine</span>
            <input value={focus} onChange={(event) => setFocus(event.target.value)} />
          </label>
          <button className="primary-button" type="button" onClick={createCheckin}>
            <Check className="h-4 w-4" aria-hidden="true" />
            Générer le bilan
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel__title">
          <div>
            <span className="eyebrow">Historique</span>
            <h2>{state.checkins.length} bilans</h2>
          </div>
          <BarChart3 className="panel-icon" aria-hidden="true" />
        </div>
        <div className="checkin-list">
          {state.checkins.map((checkin) => (
            <article key={checkin.id} className="checkin-card">
              <div>
                <span>{checkin.weekStart}</span>
                <strong>{checkin.score}/100</strong>
              </div>
              <p>{checkin.coachFeedback}</p>
              <em>{checkin.nextWeekFocus}</em>
            </article>
          ))}
          {!state.checkins.length ? <p className="muted">Premier bilan à créer après quelques jours de logs.</p> : null}
        </div>
      </section>
    </div>
  );
}

export function CoachV2App({ initialTab = "today" }: { initialTab?: string }) {
  const [state, setState] = useState<CoachV2State | null>(null);
  const initial = resolveTab(initialTab) ?? { tab: "today" as Tab };
  const [activeTab, setActiveTabState] = useState<Tab>(initial.tab);
  const [moreView, setMoreView] = useState<MoreView>(initial.more ?? "plan");

  function setActiveTab(tab: Tab) {
    setActiveTabState(tab);
    window.scrollTo({ top: 0 });
  }

  useEffect(() => {
    // Hydratation depuis localStorage : indisponible au rendu serveur, donc
    // nécessairement après le premier rendu.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(loadCoachV2State());

    // Raccourcis du manifeste PWA : /?tab=exercises ouvre directement l'onglet.
    const requested = new URLSearchParams(window.location.search).get("tab");
    const resolved = resolveTab(requested);
    if (resolved) {
      setActiveTabState(resolved.tab);
      if (resolved.more) setMoreView(resolved.more);
    }
  }, []);

  // Synchronisation D1 (version en ligne uniquement, si un code est enregistré).
  useEffect(() => {
    if (window.location.hostname !== "localhost") startSync();
  }, []);

  // Service worker : cache hors-ligne et mise en cache des GIF d'exercices.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* pas bloquant : l'app fonctionne sans */
    });
  }, []);

  const today = useMemo(() => (state ? getTodayLog(state) : emptyDailyLog()), [state]);
  const todayScore = useMemo(() => scoreDailyLog(today), [today]);
  const summary = useMemo(() => buildWeeklySummary(state?.dailyLogs ?? [today]), [state, today]);

  function updateToday(log: DailyLog) {
    if (!state) return;
    // Le frigo suit les repas notés : ajout = consommé, retrait = rendu.
    if (log.date === today.date) {
      const pantry = loadPantry();
      const next = applyMealDiff(pantry, today.meals, log.meals);
      if (next !== pantry) savePantry(next);
    }
    setState(upsertDailyLog(state, log));
  }

  /** Démarre la séance type du plan, exercices pré-remplis. */
  function startTemplateWorkout(title: string) {
    const template = TRAINING_SPLIT.find((session) => session.title === title);
    if (!template || !state) return;
    updateToday({ ...today, workouts: [...today.workouts, workoutFromTemplate(template.title, template.exercises, makeId)] });
  }

  /** Ajoute un exercice de la bibliothèque à la séance en cours, ou en démarre une. */
  function addExerciseToWorkout(name: string, exerciseId: string) {
    if (!state) return;
    const current = today.workouts[today.workouts.length - 1];
    const entry = emptyExerciseLog(name, exerciseId, makeId("ex"));

    if (current && !current.completed) {
      updateToday({
        ...today,
        workouts: today.workouts.map((workout) =>
          workout.id === current.id ? { ...workout, exercises: [...workout.exercises, entry] } : workout,
        ),
      });
    } else {
      updateToday({
        ...today,
        workouts: [
          ...today.workouts,
          {
            id: makeId("workout"),
            focus: "Séance libre",
            minutes: 0,
            hardSets: 0,
            progression: false,
            completed: false,
            exercises: [entry],
          },
        ],
      });
    }
    setActiveTab("today");
  }

  if (!state) {
    return (
      <main className="app-shell">
        <section className="hero skeleton">
          <div />
          <div />
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <CoachHeader score={todayScore} summary={summary} />

      <nav className="tab-nav" aria-label="Navigation principale">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={cx(activeTab === id && "is-active")}
            aria-current={activeTab === id ? "page" : undefined}
            onClick={() => setActiveTab(id)}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {activeTab === "today" ? (
        <>
          <ActivityHeatmap logs={state.dailyLogs} streak={summary.streak} />
          <TodayFocus
            today={today}
            logs={state.dailyLogs}
            updateToday={updateToday}
            onNavigate={(tab) => {
              if (tab === "settings") {
                setMoreView("settings");
                setActiveTab("more");
              } else setActiveTab(tab);
            }}
            onStartWorkout={startTemplateWorkout}
          />
          <TodayTab today={today} logs={state.dailyLogs} updateToday={updateToday} />
        </>
      ) : null}
      {activeTab === "nutrition" ? <NutritionTab today={today} logs={state.dailyLogs} updateToday={updateToday} /> : null}
      {activeTab === "exercises" ? <ExerciseLibrary onAddToWorkout={addExerciseToWorkout} /> : null}
      {activeTab === "progress" ? <ProgressTab state={state} today={today} updateToday={updateToday} /> : null}
      {activeTab === "more" ? (
        <>
          <div className="segmented" role="tablist" aria-label="Plus">
            {MORE_VIEWS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={moreView === id}
                className={cx(moreView === id && "is-active")}
                onClick={() => setMoreView(id)}
              >
                <Icon aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
          {moreView === "plan" ? <PlanTab state={state} setState={setState} /> : null}
          {moreView === "checkin" ? <CheckinTab state={state} setState={setState} /> : null}
          {moreView === "settings" ? <SettingsView state={state} onRestore={setState} /> : null}
        </>
      ) : null}
    </main>
  );
}
