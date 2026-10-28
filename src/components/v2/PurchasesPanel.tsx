"use client";

import { useState } from "react";
import { Plus, Receipt, X } from "lucide-react";
import { todayLocalISO } from "@/lib/v2/metrics";
import { SHOPS } from "@/lib/v2/planner";
import { loadPurchases, periodSummary, savePurchases, type Purchase } from "@/lib/v2/purchases";

let counter = 0;
function newTicketId() {
  counter += 1;
  return `ticket-${counter}-${Math.random().toString(36).slice(2, 10)}`;
}

function euros(value: number) {
  return `${value.toFixed(2).replace(".", ",")} €`;
}

export function PurchasesPanel() {
  // Monté après le chargement de la base d'aliments : toujours côté client.
  const [list, setList] = useState<Purchase[]>(() => loadPurchases());
  const [shop, setShop] = useState(SHOPS[0].label);
  const [amount, setAmount] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const today = todayLocalISO();
  const month = periodSummary(list, today);
  const ratio = Math.min(100, Math.round((month.spent / month.budget) * 100));
  const short = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date));

  function commit(next: Purchase[]) {
    setList(next);
    savePurchases(next);
  }

  function add() {
    const total = Number(amount.replace(",", "."));
    if (!Number.isFinite(total) || total <= 0) return;
    commit([
      ...list,
      { id: newTicketId(), date: today, shop, total: Math.round(total * 100) / 100 },
    ]);
    setAmount("");
  }

  return (
    <section className="panel">
      <div className="panel__title">
        <div>
          <span className="eyebrow">
            Dépenses courses · {short(month.start)} → {short(month.end)}
          </span>
          <h2>
            {euros(month.spent)} / {month.budget} €
          </h2>
        </div>
        <Receipt className="panel-icon" aria-hidden="true" />
      </div>

      <div className="metric-track" aria-hidden="true">
        <span style={{ width: `${ratio}%` }} />
      </div>
      <p className="muted">
        {month.left >= 0 ? `Reste ${euros(month.left)} jusqu'au ${short(month.end)}.` : `Budget dépassé de ${euros(-month.left)}.`}{" "}
        Le budget repart à zéro toutes les 4 semaines, prochain départ le {short(month.next)}. Chiffres réels, tickets de
        caisse — pas des estimations.
      </p>

      <ul className="ticket-list">
        {sorted.map((ticket) => (
          <li key={ticket.id}>
            <button
              type="button"
              className="ticket-row"
              aria-expanded={open === ticket.id}
              onClick={() => setOpen(open === ticket.id ? null : ticket.id)}
            >
              <span>
                <strong>{ticket.shop}</strong>
                <em>
                  {new Date(`${ticket.date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
                  {ticket.lines ? ` · ${ticket.lines.length} articles` : ""}
                </em>
              </span>
              <strong>{euros(ticket.total)}</strong>
            </button>
            {open === ticket.id ? (
              <div className="ticket-detail">
                {ticket.lines ? (
                  <ul>
                    {ticket.lines.map((line, index) => (
                      <li key={index}>
                        <span>{line.label}</span>
                        <span>{euros(line.price)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <button
                  type="button"
                  className="link-button"
                  onClick={() => commit(list.filter((item) => item.id !== ticket.id))}
                >
                  <X className="inline-icon" aria-hidden="true" /> Supprimer ce ticket
                </button>
              </div>
            ) : null}
          </li>
        ))}
        {!sorted.length ? <li className="muted">Aucun ticket ce mois-ci.</li> : null}
      </ul>

      <div className="form-grid">
        <label className="field">
          <span>Magasin</span>
          <select value={shop} onChange={(event) => setShop(event.target.value)}>
            {SHOPS.map((item) => (
              <option key={item.id} value={item.label}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Montant du ticket</span>
          <div className="input-with-suffix">
            <input inputMode="decimal" value={amount} placeholder="0,00" onChange={(event) => setAmount(event.target.value)} />
            <em>€</em>
          </div>
        </label>
        <button type="button" className="primary-button" disabled={!amount.trim()} onClick={add}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Ajouter le ticket
        </button>
      </div>
    </section>
  );
}
