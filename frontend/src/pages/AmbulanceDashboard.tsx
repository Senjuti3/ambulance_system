import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

type Req = {
  id?: string;
  status?: string;
  brief_symptoms?: string;
  latitude?: number;
  longitude?: number;
  address_hint?: string;
};

export function AmbulanceDashboard() {
  const { token, profile } = useAuth();
  const ambId = String((profile as { ambulance_id?: string })?.ambulance_id ?? "");
  const [requests, setRequests] = useState<Req[]>([]);
  const [activeCase, setActiveCase] = useState<Req | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [triaging, setTriaging] = useState<Req | null>(null);
  const [form, setForm] = useState({
    patient_name: "",
    age: "40",
    sex: "",
    symptoms: "",
    bp_systolic: "120",
    bp_diastolic: "80",
    pulse: "80",
    spo2: "98",
    consciousness: "Alert",
  });

  useEffect(() => {
    if (!token) return;
    const socket = io({
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });
    socket.on("connect", () => socket.emit("join_ambulance", { token }));
    socket.on("requests_snapshot", (p: { requests: Req[] }) =>
      setRequests(p.requests ?? [])
    );
    socket.on("new_emergency_request", (r: Req) =>
      setRequests((x) => [r, ...x.filter((y) => y.id !== r.id)])
    );
    return () => socket.disconnect();
  }, [token]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get<{ requests: Req[] }>("/api/emergency-requests", {
          params: { status: "pending" },
        });
        setRequests(data.requests);
      } catch {
        /* unauthenticated public access may 401 on some setups */
      }
    })();
  }, []);

  const accept = async (id: string) => {
    setMsg(null);
    try {
      await api.post(`/api/emergency-requests/${id}/accept`, { ambulance_id: ambId });
      const picked = requests.find((x) => x.id === id) ?? { id };
      setActiveCase(picked);
      setRequests((r) => r.filter((x) => x.id !== id));
      setMsg(`Accepted request ${id}. Complete triage from your active assignment.`);
    } catch (ex: unknown) {
      const ax = ex as { response?: { data?: { error?: string } } };
      setMsg(ax.response?.data?.error ?? "Accept failed");
    }
  };

  const submitTriage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!triaging?.id) return;
    setMsg(null);
    try {
      await api.post("/api/triage-submit", {
        request_id: triaging.id,
        ambulance_id: ambId,
        ...form,
        age: parseInt(form.age, 10),
        bp_systolic: parseInt(form.bp_systolic, 10),
        bp_diastolic: parseInt(form.bp_diastolic, 10),
        pulse: parseInt(form.pulse, 10),
        spo2: parseInt(form.spo2, 10),
      });
      setMsg("Triage submitted — hospital notified.");
      setTriaging(null);
      setActiveCase(null);
    } catch (ex: unknown) {
      const ax = ex as { response?: { data?: { error?: string } } };
      setMsg(ax.response?.data?.error ?? "Triage failed");
    }
  };

  const openTriage = (r: Req) => {
    setTriaging(r);
    setForm((f) => ({
      ...f,
      symptoms: r.brief_symptoms ?? "",
    }));
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Ambulance dispatch</h1>
        <p className="text-sm text-slate-400">
          Logged in as <span className="text-teal-300">{ambId}</span>. Only verified crews
          see pending requests and may accept.
        </p>
      </div>
      {msg && <p className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-200">{msg}</p>}

      {activeCase && (
        <section className="rounded-xl border border-amber-700/50 bg-amber-950/20 p-4">
          <h2 className="text-lg font-semibold text-amber-200">Your active assignment</h2>
          <p className="text-sm text-slate-300">
            #{activeCase.id} — {activeCase.brief_symptoms}
          </p>
          <button
            type="button"
            className="mt-3 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white"
            onClick={() => openTriage(activeCase)}
          >
            Open triage form
          </button>
        </section>
      )}

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h2 className="mb-3 text-lg font-semibold text-teal-300">Pending requests</h2>
        <ul className="space-y-3">
          {requests.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-2 rounded-lg border border-slate-700/80 bg-slate-950/50 p-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="text-sm">
                <div className="font-mono text-teal-300">#{r.id}</div>
                <div className="text-slate-200">{r.brief_symptoms}</div>
                <div className="text-xs text-slate-500">
                  {r.latitude}, {r.longitude} {r.address_hint ? `· ${r.address_hint}` : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void accept(String(r.id))}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
              >
                Accept
              </button>
            </li>
          ))}
          {requests.length === 0 && (
            <li className="text-sm text-slate-500">No pending requests in queue.</li>
          )}
        </ul>
      </section>

      {triaging && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 md:items-center">
          <form
            onSubmit={submitTriage}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
          >
            <h3 className="text-lg font-semibold text-white">Field triage — #{triaging.id}</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["patient_name", "text"],
                  ["age", "number"],
                  ["sex", "text"],
                  ["symptoms", "text"],
                  ["bp_systolic", "number"],
                  ["bp_diastolic", "number"],
                  ["pulse", "number"],
                  ["spo2", "number"],
                  ["consciousness", "text"],
                ] as const
              ).map(([k, t]) => (
                <label key={k} className="block text-xs sm:col-span-2">
                  <span className="text-slate-400">{k.replace(/_/g, " ")}</span>
                  {k === "symptoms" ? (
                    <textarea
                      required
                      className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-white"
                      rows={3}
                      value={form[k]}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, [k]: e.target.value }))
                      }
                    />
                  ) : (
                    <input
                      type={t}
                      required={k !== "sex"}
                      className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-white"
                      value={form[k]}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, [k]: e.target.value }))
                      }
                    />
                  )}
                </label>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="submit"
                className="flex-1 rounded-lg bg-teal-600 py-2 text-sm font-semibold text-white"
              >
                Submit & route to hospital
              </button>
              <button
                type="button"
                onClick={() => setTriaging(null)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
