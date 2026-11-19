import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { getUser, verifyRequestOrigin } from "@netlify/identity";

// All data access goes through this function. Every request must carry a valid
// Netlify Identity session; deleting records and editing the equipment register
// additionally need the "admin" role (set per user in the Netlify dashboard).

const STORE = "aulea-usage";
const REPORT_ID = /^AUL-\d{8}-[A-Z0-9]{6}$/;
const MAX_BODY = 1_500_000;
const UNITS = ["Veloxion 1", "Veloxion 2", "Darwin 1", "Darwin 2", "FSN 1", "FSN 2"];

const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } });

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const img = (v: unknown, max: number) =>
  typeof v === "string" && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length <= max ? v : "";
const list = (v: unknown, n: number, max: number) =>
  Array.isArray(v) ? v.slice(0, n).map((x) => str(x, max)).filter(Boolean) : [];

function cleanReport(b: any) {
  const items = Array.isArray(b.items)
    ? b.items.slice(0, 30).map((it: any) => ({
        pn: str(it?.pn, 80),
        name: str(it?.name, 80),
        lot: str(it?.lot, 80),
        qty: Math.min(999, Math.max(1, Number.parseInt(it?.qty, 10) || 1)),
      }))
    : [];
  const ratings: Record<string, number | string> = {};
  if (b.ratings && typeof b.ratings === "object") {
    for (const [k, v] of Object.entries(b.ratings).slice(0, 20)) {
      if (!/^r[A-Za-z]{1,20}$/.test(k)) continue;
      ratings[k] = v === "N/A" ? "N/A" : [1, 2, 3, 4, 5].includes(v as number) ? (v as number) : "";
    }
  }
  const procMin = Number(b.procMin);
  return {
    hospital: str(b.hospital, 200), country: str(b.country, 60), department: str(b.department, 100),
    surgeon: str(b.surgeon, 120), useDate: str(b.useDate, 10), demoSystem: str(b.demoSystem, 40),
    procedure: str(b.procedure, 200), items,
    unitDarwin: str(b.unitDarwin, 40), unitFSN: str(b.unitFSN, 40),
    experience: str(b.experience, 40), viewMode: str(b.viewMode, 60), share3D: str(b.share3D, 20),
    why2D: list(b.why2D, 12, 80), scopeType: str(b.scopeType, 20), disparity: str(b.disparity, 4),
    ratings, vsOverall: str(b.vsOverall, 10), vsTime: str(b.vsTime, 10),
    events: list(b.events, 15, 80), issueNote: str(b.issueNote, 2000),
    procMin: Number.isFinite(procMin) && procMin > 0 && procMin < 2000 ? Math.round(procMin) : "",
    useAgain: str(b.useAgain, 10), feedback: str(b.feedback, 4000),
    distCompany: str(b.distCompany, 120), distRep: str(b.distRep, 120),
    hospRep: str(b.hospRep, 120), hospTitle: str(b.hospTitle, 120),
    distSig: img(b.distSig, 300_000), hospSig: img(b.hospSig, 300_000), stamp: img(b.stamp, 400_000),
  };
}

export default async (req: Request, context: Context) => {
  const user = await getUser();
  if (!user) return json({ error: "unauthorized" }, 401);
  const isAdmin = (user.roles ?? []).includes("admin");

  if (req.method !== "GET") {
    try {
      verifyRequestOrigin(req);
    } catch {
      return json({ error: "forbidden" }, 403);
    }
  }

  const [resource, id] = new URL(req.url).pathname.replace(/^\/api\//, "").split("/");
  const store = getStore({ name: STORE, consistency: "strong" });

  if (resource === "me" && req.method === "GET") {
    return json({ email: user.email ?? "", isAdmin });
  }

  if (resource === "equipment") {
    if (req.method === "GET") {
      const doc = (await store.get("config/equipment", { type: "json" })) as any;
      return json({ units: doc?.units ?? {} });
    }
    if (req.method === "PUT") {
      if (!isAdmin) return json({ error: "admin_only" }, 403);
      const body = (await req.json().catch(() => null)) as any;
      const units: Record<string, string> = {};
      for (const u of UNITS) {
        const v = str(body?.units?.[u], 80);
        if (v) units[u] = v;
      }
      await store.setJSON("config/equipment", { units, updatedAt: new Date().toISOString(), updatedBy: user.email ?? user.id });
      return json({ units });
    }
  }

  if (resource === "reports") {
    if (req.method === "GET" && !id) {
      const { blobs } = await store.list({ prefix: "reports/" });
      const docs = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
      const reports = docs.filter(Boolean).sort((a: any, b: any) => String(b.useDate).localeCompare(String(a.useDate)));
      return json({ reports });
    }
    if (req.method === "POST" && !id) {
      const raw = await req.text();
      if (raw.length > MAX_BODY) return json({ error: "too_large" }, 413);
      let body: any;
      try { body = JSON.parse(raw); } catch { return json({ error: "bad_json" }, 400); }
      const r = cleanReport(body ?? {});
      if (!r.hospital || !r.surgeon || !/^\d{4}-\d{2}-\d{2}$/.test(r.useDate) || !r.items.length ||
          r.items.some((it: any) => !it.lot) || !r.distRep || !r.hospRep || !r.distSig || !r.hospSig) {
        return json({ error: "missing_fields" }, 400);
      }
      const reg = ((await store.get("config/equipment", { type: "json" })) as any)?.units ?? {};
      const serials: Record<string, string> = {};
      for (const u of [r.demoSystem, r.unitDarwin, r.unitFSN]) if (UNITS.includes(u) && reg[u]) serials[u] = reg[u];
      for (let attempt = 0; attempt < 5; attempt++) {
        const reportNo = `AUL-${r.useDate.replace(/-/g, "")}-${crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`;
        const doc = { ...r, serials, reportNo, createdAt: new Date().toISOString(), createdBy: user.email ?? user.id };
        const { modified } = await store.setJSON(`reports/${reportNo}`, doc, { onlyIfNew: true });
        if (modified) return json({ report: doc }, 201);
      }
      return json({ error: "try_again" }, 503);
    }
    if (req.method === "DELETE" && id) {
      if (!isAdmin) return json({ error: "admin_only" }, 403);
      if (!REPORT_ID.test(id)) return json({ error: "bad_id" }, 400);
      await store.delete(`reports/${id}`);
      return json({ deleted: id });
    }
  }

  return json({ error: "not_found" }, 404);
};

export const config: Config = {
  path: ["/api/me", "/api/reports", "/api/reports/:id", "/api/equipment"],
};
