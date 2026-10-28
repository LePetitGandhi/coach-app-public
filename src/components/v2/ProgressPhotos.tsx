"use client";

import { useEffect, useMemo, useState } from "react";
import { Camera, Lock, Trash2 } from "lucide-react";
import { todayLocalISO } from "@/lib/v2/metrics";
import {
  compressImage,
  deletePhoto,
  listPhotos,
  POSES,
  requestPersistence,
  savePhoto,
  type Pose,
  type ProgressPhoto,
} from "@/lib/v2/photos";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

let counter = 0;
function newPhotoId() {
  counter += 1;
  return `photo-${counter}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

/** URL d'affichage pour un Blob, libérée au démontage. */
function PhotoImg({ photo, alt }: { photo: ProgressPhoto; alt: string }) {
  const url = useMemo(() => URL.createObjectURL(photo.blob), [photo.blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} loading="lazy" />;
}

export function ProgressPhotos() {
  const [photos, setPhotos] = useState<ProgressPhoto[] | null>(null);
  const [pose, setPose] = useState<Pose>("face");
  const [date, setDate] = useState(() => todayLocalISO());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [comparePose, setComparePose] = useState<Pose>("face");

  useEffect(() => {
    let alive = true;
    listPhotos()
      .then((list) => {
        if (alive) setPhotos(list);
      })
      .catch(() => {
        if (alive) {
          setPhotos([]);
          setError("Stockage photo indisponible sur ce navigateur (navigation privée ?).");
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    requestPersistence();
    try {
      for (const file of Array.from(files)) {
        const blob = await compressImage(file);
        await savePhoto({ id: newPhotoId(), date, pose, blob });
      }
      setPhotos(await listPhotos());
    } catch {
      setError("Impossible d'enregistrer la photo.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await deletePhoto(id);
    setPhotos(await listPhotos());
  }

  const byDate = useMemo(() => {
    const groups = new Map<string, ProgressPhoto[]>();
    for (const photo of photos ?? []) {
      const list = groups.get(photo.date) ?? [];
      list.push(photo);
      groups.set(photo.date, list);
    }
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [photos]);

  const ofPose = (photos ?? []).filter((photo) => photo.pose === comparePose);
  const first = ofPose[0];
  const last = ofPose[ofPose.length - 1];

  return (
    <section className="panel">
      <div className="panel__title">
        <div>
          <span className="eyebrow">Photos de progression</span>
          <h2>{photos?.length ? `${photos.length} photo${photos.length > 1 ? "s" : ""}` : "Aucune photo"}</h2>
        </div>
        <Camera className="panel-icon" aria-hidden="true" />
      </div>

      <p className="muted">
        <Lock className="inline-icon" aria-hidden="true" /> Stockées uniquement sur cet appareil : jamais envoyées au
        serveur, pas synchronisées. Une série toutes les 4 semaines, le matin à jeun, même lumière, face · profil · dos.
      </p>

      <div className="form-grid">
        <label className="field">
          <span>Date</span>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value || todayLocalISO())} />
        </label>
        <div className="field">
          <span>Pose</span>
          <div className="chip-row__items">
            {POSES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cx("chip", pose === item.id && "is-active")}
                onClick={() => setPose(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <label className={cx("primary-button", "file-button", busy && "is-busy")}>
          <Camera className="h-4 w-4" aria-hidden="true" />
          {busy ? "Enregistrement…" : "Ajouter des photos"}
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={busy}
            onChange={(event) => {
              void addFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
      </div>
      {error ? <p className="coach-line coach-line--warn">{error}</p> : null}

      {first && last && first.id !== last.id ? (
        <>
          <h3 className="section-title">Avant / maintenant</h3>
          <div className="chip-row__items">
            {POSES.filter((item) => (photos ?? []).some((photo) => photo.pose === item.id)).map((item) => (
              <button
                key={item.id}
                type="button"
                className={cx("chip", comparePose === item.id && "is-active")}
                onClick={() => setComparePose(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="photo-compare">
            <figure>
              <PhotoImg photo={first} alt={`${comparePose} le ${first.date}`} />
              <figcaption>{formatDate(first.date)}</figcaption>
            </figure>
            <figure>
              <PhotoImg photo={last} alt={`${comparePose} le ${last.date}`} />
              <figcaption>{formatDate(last.date)}</figcaption>
            </figure>
          </div>
        </>
      ) : null}

      {byDate.map(([day, list]) => (
        <div key={day} className="photo-group">
          <h3 className="section-title">{formatDate(day)}</h3>
          <div className="photo-grid">
            {list.map((photo) => (
              <figure key={photo.id}>
                <PhotoImg photo={photo} alt={`${photo.pose} le ${photo.date}`} />
                <figcaption>
                  {POSES.find((item) => item.id === photo.pose)?.label}
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Supprimer la photo"
                    onClick={() => void remove(photo.id)}
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
