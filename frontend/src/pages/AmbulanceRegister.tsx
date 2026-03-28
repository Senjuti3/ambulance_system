import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

/** Multipart registration; axios sets multipart boundary automatically. */
export function AmbulanceRegister() {
  const [form, setForm] = useState({
    email: "",
    password: "",
    driver_name: "",
    ambulance_id: "",
    vehicle_number: "",
    license_number: "",
    ambulance_type: "BLS",
  });
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (file) fd.append("id_proof", file);
      await api.post("/api/ambulances/register", fd);
      setMsg("Submitted. Your crew remains pending until documents are verified.");
    } catch (ex: unknown) {
      const ax = ex as { response?: { data?: { error?: string } } };
      setErr(ax.response?.data?.error ?? "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-bold text-white">Ambulance / crew registration</h1>
      <p className="text-sm text-slate-400">
        Upload ID proof (image/PDF). Admins approve BLS or ALS units before they appear on
        the live dispatch board.
      </p>
      <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        {(
          [
            ["email", "email"],
            ["password", "password"],
            ["driver_name", "text"],
            ["ambulance_id", "text"],
            ["vehicle_number", "text"],
            ["license_number", "text"],
          ] as const
        ).map(([key, type]) => (
          <label key={key} className="block text-sm">
            <span className="capitalize text-slate-400">
              {key.replace(/_/g, " ")}
            </span>
            <input
              type={type}
              required
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              value={form[key]}
              onChange={(e) => set(key, e.target.value)}
            />
          </label>
        ))}
        <label className="block text-sm">
          <span className="text-slate-400">Ambulance type</span>
          <select
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            value={form.ambulance_type}
            onChange={(e) => set("ambulance_type", e.target.value)}
          >
            <option value="BLS">BLS</option>
            <option value="ALS">ALS</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-slate-400">ID proof upload</span>
          <input
            type="file"
            className="mt-1 w-full text-sm text-slate-400"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        {err && <p className="text-sm text-red-400">{err}</p>}
        {msg && <p className="text-sm text-teal-300">{msg}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-teal-700 py-3 font-semibold text-white hover:bg-teal-600 disabled:opacity-50"
        >
          {loading ? "Submitting…" : "Submit for verification"}
        </button>
      </form>
      <p className="text-center text-sm">
        <Link to="/login" className="text-teal-400 hover:underline">
          Approved crew? Log in
        </Link>
      </p>
    </div>
  );
}
