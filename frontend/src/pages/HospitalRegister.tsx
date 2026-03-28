import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

export function HospitalRegister() {
  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    address: "",
    latitude: "",
    longitude: "",
    uhid: "",
    hospital_type: "private",
    specialization: "",
    contact_phone: "",
    contact_email: "",
  });
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
      const { data } = await api.post("/api/hospitals/register", {
        ...form,
        latitude: parseFloat(form.latitude),
        longitude: parseFloat(form.longitude),
      });
      setMsg(data.message ?? "Registered. Awaiting admin verification.");
    } catch (ex: unknown) {
      const ax = ex as { response?: { data?: { error?: string } } };
      setErr(ax.response?.data?.error ?? "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-bold text-white">Hospital registration</h1>
      <p className="text-sm text-slate-400">
        After submission, status is <code className="text-teal-300">pending</code> until an
        admin verifies your facility.
      </p>
      <form onSubmit={submit} className="grid gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-6 md:grid-cols-2">
        {(
          [
            ["email", "email", "Work email (login)"],
            ["password", "password", "Password (min 8 chars)"],
            ["name", "text", "Hospital name"],
            ["address", "text", "Full address"],
            ["latitude", "number", "GPS latitude"],
            ["longitude", "number", "GPS longitude"],
            ["uhid", "text", "UHID / registration number"],
            ["hospital_type", "select", "Hospital type"],
            ["specialization", "text", "Specializations (comma-separated)"],
            ["contact_phone", "tel", "Contact phone"],
            ["contact_email", "email", "Contact email"],
          ] as const
        ).map(([key, type, label]) =>
          key === "hospital_type" ? (
            <label key={key} className="block text-sm md:col-span-2">
              <span className="text-slate-400">{label}</span>
              <select
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                value={form.hospital_type}
                onChange={(e) => set("hospital_type", e.target.value)}
              >
                <option value="government">Government</option>
                <option value="private">Private</option>
              </select>
            </label>
          ) : (
            <label key={key} className="block text-sm">
              <span className="text-slate-400">{label}</span>
              <input
                type={type}
                required={key !== "contact_email"}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                value={form[key as keyof typeof form]}
                onChange={(e) => set(key, e.target.value)}
              />
            </label>
          )
        )}
        {err && <p className="md:col-span-2 text-sm text-red-400">{err}</p>}
        {msg && <p className="md:col-span-2 text-sm text-teal-300">{msg}</p>}
        <button
          type="submit"
          disabled={loading}
          className="md:col-span-2 rounded-xl bg-teal-700 py-3 font-semibold text-white hover:bg-teal-600 disabled:opacity-50"
        >
          {loading ? "Submitting…" : "Submit for verification"}
        </button>
      </form>
      <p className="text-center text-sm">
        <Link to="/login" className="text-teal-400 hover:underline">
          Already verified? Log in
        </Link>
      </p>
    </div>
  );
}
