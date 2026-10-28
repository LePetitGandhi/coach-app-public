"use client";

import { useEffect, useRef, useState } from "react";
import { Timer, X } from "lucide-react";

const REST_KEY = "coach.v2.rest";
export const REST_OPTIONS = [60, 90, 120, 180];

export function readRestSeconds() {
  try {
    const value = Number(localStorage.getItem(REST_KEY));
    return REST_OPTIONS.includes(value) ? value : 90;
  } catch {
    return 90;
  }
}

export function saveRestSeconds(value: number) {
  try {
    localStorage.setItem(REST_KEY, String(value));
  } catch {
    // ignoré
  }
}

function format(seconds: number) {
  const safe = Math.max(0, seconds);
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

/** Barre de repos flottante, au-dessus des onglets. Démarre à chaque série ajoutée. */
export function RestTimer({
  endsAt,
  duration,
  onDuration,
  onExtend,
  onStop,
}: {
  endsAt: number;
  duration: number;
  onDuration: (seconds: number) => void;
  onExtend: (seconds: number) => void;
  onStop: () => void;
}) {
  const [now, setNow] = useState(0);
  const buzzed = useRef(false);

  useEffect(() => {
    buzzed.current = false;
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [endsAt]);

  const left = now ? Math.ceil((endsAt - now) / 1000) : duration;
  const done = left <= 0;

  useEffect(() => {
    if (done && !buzzed.current) {
      buzzed.current = true;
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.([200, 100, 200]);
    }
  }, [done]);

  return (
    <div className={`rest-bar${done ? " is-done" : ""}`} role="timer" aria-live="polite">
      <Timer aria-hidden="true" />
      <strong>{done ? "Repos fini — série suivante" : `Repos ${format(left)}`}</strong>
      {!done ? (
        <button type="button" className="rest-bar__btn" onClick={() => onExtend(30)}>
          +30 s
        </button>
      ) : null}
      <select
        className="rest-bar__select"
        aria-label="Durée du repos"
        value={duration}
        onChange={(event) => onDuration(Number(event.target.value))}
      >
        {REST_OPTIONS.map((seconds) => (
          <option key={seconds} value={seconds}>
            {format(seconds)}
          </option>
        ))}
      </select>
      <button type="button" className="rest-bar__btn" aria-label="Arrêter le minuteur" onClick={onStop}>
        <X aria-hidden="true" />
      </button>
    </div>
  );
}
