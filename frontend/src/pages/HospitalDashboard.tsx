import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

type VitalRow = {
  idx: number;
  heart_rate: number;
  bp_systolic: number;
  bp_diastolic: number;
  temperature_c: number;
  glucose_mg_dl: number;
  ml_abnormal?: boolean;
  alerts?: string[];
};

type CaseRow = Record<string, unknown> & { id?: string; patient_name?: string };

export function HospitalDashboard() {
  const { token } = useAuth();
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [vitals, setVitals] = useState<VitalRow[]>([]);
  const [latest, setLatest] = useState<Record<string, unknown> | null>(null);
  const [sessionId, setSessionId] = useState(
    () => localStorage.getItem("ambusync_vitals_session") ?? ""
  );
  const [demoOn, setDemoOn] = useState(false);
  const idxRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!token) return;
    const socket = io({
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });
    socket.on("connect", () => {
      socket.emit("join_hospital", { token });
    });
    socket.on("cases_snapshot", (p: { cases: CaseRow[] }) => {
      setCases(p.cases ?? []);
    });
    socket.on("hospital_notified", (p: { case: CaseRow }) => {
      if (p?.case) setCases((c) => [p.case, ...c]);
    });
    socket.on("vitals_update", (reading: Record<string, unknown>) => {
      idxRef.current += 1;
      const row: VitalRow = {
        idx: idxRef.current,
        heart_rate: Number(reading.heart_rate ?? 0),
        bp_systolic: Number(reading.bp_systolic ?? 0),
        bp_diastolic: Number(reading.bp_diastolic ?? 0),
        temperature_c: Number(reading.temperature_c ?? 0),
        glucose_mg_dl: Number(reading.glucose_mg_dl ?? 0),
        ml_abnormal: Boolean(reading.ml_abnormal),
        alerts: (reading.alerts as string[]) ?? [],
      };
      setLatest(reading);
      setVitals((v) => [...v.slice(-80), row]);
    });
    socket.on("error", (e: { message?: string }) => {
      console.warn("socket error", e);
    });
    return () => {
      socket.disconnect();
    };
  }, [token]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get<{ cases: CaseRow[] }>("/api/cases");
        setCases(data.cases);
      } catch {
        /* require verified hospital */
      }
    })();
  }, []);

  const persistSession = (sid: string) => {
    localStorage.setItem("ambusync_vitals_session", sid);
    setSessionId(sid);
  };

  const pushSimulatedVital = async () => {
    let sid = sessionId;
    if (!sid) {
      sid = crypto.randomUUID?.() ?? `sess-${Date.now()}`;
      persistSession(sid);
    }
    const { data } = await api.post<{ reading: Record<string, unknown> }>(
      "/api/health/vitals/simulated",
      {},
      { params: { bias: 0 } }
    );
    await api.post("/api/health/vitals", {
      ...data.reading,
      session_id: sid,
    });
  };

  useEffect(() => {
    if (!demoOn) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    void pushSimulatedVital();
    timerRef.current = setInterval(() => {
      void pushSimulatedVital();
    }, 3000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- demo toggle only
  }, [demoOn]);

  const downloadPdf = async () => {
    if (!sessionId) {
      alert("Start demo stream or ingest vitals first to create a session.");
      return;
    }
    const { data } = await api.get("/api/health/report.pdf", {
      params: { session_id: sessionId },
      responseType: "blob",
    });
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ambusync-report.pdf";
    a.click();
    URL.revokeObjectURL(url);
  };

  const abnormalFlash = useMemo(
    () => latest?.ml_abnormal || (latest?.alerts as string[] | undefined)?.length,
    [latest]
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Hospital command center</h1>
          <p className="text-sm text-slate-400">
            Verified hospitals receive routed cases and live vitals. Subscribes over
            WebSockets.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              const s = crypto.randomUUID?.() ?? `sess-${Date.now()}`;
              persistSession(s);
            }}
            className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200"
          >
            New vitals session ID
          </button>
          <button
            type="button"
            onClick={() => setDemoOn((x) => !x)}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              demoOn
                ? "bg-amber-600 text-white"
                : "bg-teal-700 text-white hover:bg-teal-600"
            }`}
          >
            {demoOn ? "Stop demo vitals" : "Start demo vitals (3s)"}
          </button>
          <button
            type="button"
            onClick={() => void downloadPdf()}
            className="rounded-lg border border-slate-500 px-3 py-2 text-sm text-slate-200"
          >
            Download PDF report
          </button>
        </div>
      </div>

      {abnormalFlash ? (
        <div className="rounded-xl border border-amber-600/50 bg-amber-950/40 px-4 py-3 text-amber-100">
          <strong>Alert:</strong> Latest sample flagged abnormal rules or ML anomaly.
          {((latest?.alerts as string[]) ?? []).map((a) => (
            <div key={a} className="text-sm">
              • {a}
            </div>
          ))}
        </div>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 lg:col-span-2">
          <h2 className="mb-3 text-lg font-semibold text-teal-300">Live vitals</h2>
          <div className="h-72 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={vitals}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="idx" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }} />
                <Legend />
                <Line type="monotone" dataKey="heart_rate" stroke="#f472b6" dot={false} name="HR" />
                <Line
                  type="monotone"
                  dataKey="bp_systolic"
                  stroke="#38bdf8"
                  dot={false}
                  name="BP sys"
                />
                <Line
                  type="monotone"
                  dataKey="temperature_c"
                  stroke="#a3e635"
                  dot={false}
                  name="Temp °C"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <h2 className="text-lg font-semibold text-teal-300">Current values</h2>
          {latest ? (
            <ul className="space-y-2 text-sm text-slate-300">
              <li>Heart rate: {String(latest.heart_rate)} bpm</li>
              <li>
                BP: {String(latest.bp_systolic)}/{String(latest.bp_diastolic)}
              </li>
              <li>Temp: {String(latest.temperature_c)} °C</li>
              <li>Glucose: {String(latest.glucose_mg_dl)} mg/dL</li>
              <li>ML abnormal: {String(latest.ml_abnormal)}</li>
              <li className="break-all text-xs text-slate-500">
                Session: {sessionId || "auto on first demo tick"}
              </li>
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Waiting for vitals…</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-teal-300">Incoming cases</h2>
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
            <thead className="bg-slate-900/80 text-slate-400">
              <tr>
                <th className="px-3 py-2">Patient</th>
                <th className="px-3 py-2">Urgency</th>
                <th className="px-3 py-2">Hospital</th>
                <th className="px-3 py-2">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {cases.slice(0, 20).map((c) => (
                <tr key={String(c.id)} className="bg-slate-950/40">
                  <td className="px-3 py-2 text-white">{String(c.patient_name ?? "")}</td>
                  <td className="px-3 py-2 text-amber-300">{String(c.urgency ?? "")}</td>
                  <td className="px-3 py-2 text-slate-400">{String(c.hospital_name ?? "")}</td>
                  <td className="max-w-md truncate px-3 py-2 text-slate-400">
                    {String(c.summary ?? "")}
                  </td>
                </tr>
              ))}
              {cases.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-slate-500">
                    No cases yet. Waiting for triage completions from verified ambulances.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
