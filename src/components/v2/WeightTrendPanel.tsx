"use client";

import { Scale } from "lucide-react";
import { weightTrend } from "@/lib/v2/weight";
import type { DailyLog } from "@/lib/v2/types";

function kg(value: number | null) {
  return value == null ? "—" : `${String(value).replace(".", ",")} kg`;
}

export function WeightTrendPanel({ logs }: { logs: DailyLog[] }) {
  const trend = weightTrend(logs);
  return (
    <section className="panel">
      <div className="panel__title">
        <div>
          <span className="eyebrow">Poids · moyenne 7 jours</span>
          <h2>{kg(trend.avg7)}</h2>
        </div>
        <Scale className="panel-icon" aria-hidden="true" />
      </div>
      <div className="delta-grid">
        <div className="delta">
          <span>Semaine précédente</span>
          <strong>{kg(trend.prevAvg7)}</strong>
        </div>
        <div className="delta">
          <span>Évolution</span>
          <strong>
            {trend.delta == null ? "—" : `${trend.delta > 0 ? "+" : ""}${String(trend.delta).replace(".", ",")} kg/sem`}
          </strong>
        </div>
      </div>
      <p className="muted">{trend.verdict}</p>
      {trend.weighIns.length ? (
        <ul className="log-list">
          {trend.weighIns.map((item) => (
            <li key={item.date}>
              <span>
                {new Date(`${item.date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
              </span>
              <strong>{kg(item.weightKg)}</strong>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
