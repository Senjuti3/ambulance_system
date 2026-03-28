import { useEffect, useState } from "react";
import { api } from "../api/client";

type HospitalOpt = { id: string; name: string; specializations: string[] };

export function PatientRequest() {
  const [lat, setLat] = useState<number | "">("");
  const [lng, setLng] = useState<number | "">("");
  const [address, setAddress] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [patientName, setPatientName] = useState("");
  const [preferredId, setPreferredId] = useState("");
  const [hospitals, setHospitals] = useState<HospitalOpt[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get<{ hospitals: HospitalOpt[] }>("/api/hospitals");
        setHospitals(data.hospitals);
      } catch {
        /* non-fatal */
      }
    })();
  }, []);

  const geoLocate = () => {
    if (!navigator.geolocation) {
      setErr("Geolocation not supported in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLat(p.coords.latitude);
        setLng(p.coords.longitude);
        setErr(null);
      },
      () => setErr("Could not read location — enter coordinates manually if needed.")
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    if (lat === "" || lng === "") {
      setErr("Latitude and longitude are required (use GPS or enter manually).");
      return;
    }
    if (!symptoms.trim()) {
      setErr("Describe symptoms / situation.");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post("/api/emergency-request", {
        latitude: Number(lat),
        longitude: Number(lng),
        address_hint: address,
        brief_symptoms: symptoms,
        patient_name: patientName,
        preferred_hospital_id: preferredId || undefined,
      });
      setMsg(`Request sent. Reference: ${data.request?.id ?? ""}. Crews are notified.`);
    } catch (ex: unknown) {
      const ax = ex as { response?: { data?: { error?: string } } };
      setErr(ax.response?.data?.error ?? "Failed to send request.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-bold text-white">Request ambulance</h1>
      <p className="text-sm text-slate-400">
        No account required. Your request is broadcast to verified ambulances on the
        network.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            void (async () => {
              try {
                const { data } = await api.get<{ hospitals: HospitalOpt[] }>(
                  "/api/hospitals"
                );
                setHospitals(data.hospitals);
              } catch {
                /* ignore */
              }
            })();
          }}
          className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
        >
          Refresh hospital list
        </button>
        <button
          type="button"
          onClick={geoLocate}
          className="rounded-lg border border-teal-700 bg-teal-950/40 px-3 py-2 text-sm text-teal-200 hover:bg-teal-900/40"
        >
          Use my GPS
        </button>
      </div>
      <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        <label className="block text-sm">
          <span className="text-slate-400">Latitude</span>
          <input
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            value={lat}
            onChange={(e) => setLat(e.target.value === "" ? "" : Number(e.target.value))}
            type="number"
            step="any"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-400">Longitude</span>
          <input
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            value={lng}
            onChange={(e) => setLng(e.target.value === "" ? "" : Number(e.target.value))}
            type="number"
            step="any"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-400">Address / landmark (optional)</span>
          <input
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-400">Patient name (optional)</span>
          <input
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            value={patientName}
            onChange={(e) => setPatientName(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-400">Symptoms / emergency description</span>
          <textarea
            required
            className="mt-1 min-h-[100px] w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            value={symptoms}
            onChange={(e) => setSymptoms(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-400">Preferred verified hospital (optional)</span>
          <select
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            value={preferredId}
            onChange={(e) => setPreferredId(e.target.value)}
          >
            <option value="">No preference — auto routing</option>
            {hospitals.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </label>
        {err && <p className="text-sm text-red-400">{err}</p>}
        {msg && <p className="text-sm text-teal-300">{msg}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-red-600 py-3 font-semibold text-white hover:bg-red-500 disabled:opacity-50"
        >
          {loading ? "Sending…" : "Submit emergency request"}
        </button>
      </form>
    </div>
  );
}
