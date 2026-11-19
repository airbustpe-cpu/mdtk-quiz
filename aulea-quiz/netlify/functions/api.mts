import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { admin, getUser, verifyRequestOrigin } from "@netlify/identity";

// All data access goes through this function. Every request must carry a valid
// Netlify Identity session, and the account is re-read from Identity on each
// request so that removing a user or changing their role applies at once.
// Deleting records, editing the equipment register and managing users need the
// "admin" role.

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
        gtin: /^\d{14}$/.test(it?.gtin) ? it.gtin : "",
        sn: str(it?.sn, 80),
        exp: /^\d{4}-\d{2}-\d{2}$/.test(it?.exp) ? it.exp : "",
        scanned: it?.scanned === true,
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

const PW_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
function tempPassword() {
  const b = crypto.getRandomValues(new Uint8Array(12));
  const c = Array.from(b, (x) => PW_CHARS[x % PW_CHARS.length]).join("");
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}`;
}
const hasAdmin = (u: any) => (u?.roles ?? []).includes("admin");
const withRole = (appMeta: any, makeAdmin: boolean) => {
  const roles = new Set<string>(Array.isArray(appMeta?.roles) ? appMeta.roles : []);
  makeAdmin ? roles.add("admin") : roles.delete("admin");
  return { ...(appMeta ?? {}), roles: [...roles] };
};
const userView = (u: any) => ({
  id: u.id, email: u.email ?? "", isAdmin: hasAdmin(u),
  tempPassword: u.userMetadata?.temp_password === true,
  createdAt: u.createdAt ?? "", lastSignInAt: u.lastSignInAt ?? "",
});

export default async (req: Request, context: Context) => {
  const session = await getUser();
  if (!session) return json({ error: "unauthorized" }, 401);
  let user: any;
  try {
    user = await admin.getUser(session.id);
  } catch {
    return json({ error: "unauthorized" }, 401);
  }
  const isAdmin = hasAdmin(user);

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
    return json({ email: user.email ?? "", isAdmin, tempPassword: user.userMetadata?.temp_password === true });
  }

  if (resource === "users") {
    if (!isAdmin) return json({ error: "admin_only" }, 403);
    if (req.method === "GET" && !id) {
      const all: any[] = [];
      for (let page = 1; page <= 20; page++) {
        const batch = await admin.listUsers({ page, perPage: 100 });
        all.push(...batch);
        if (batch.length < 100) break;
      }
      all.sort((a, b) => String(a.email).localeCompare(String(b.email)));
      return json({ users: all.map(userView), me: user.id });
    }
    if (req.method === "POST" && !id) {
      const body = (await req.json().catch(() => null)) as any;
      const email = str(body?.email, 200).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "bad_email" }, 400);
      const password = tempPassword();
      try {
        const created = await admin.createUser({
          email, password,
          data: { app_metadata: withRole({}, body?.isAdmin === true), user_metadata: { temp_password: true } },
        });
        return json({ user: userView(created), password }, 201);
      } catch {
        return json({ error: "exists_or_failed" }, 409);
      }
    }
    if (id && !/^[0-9a-f-]{8,64}$/i.test(id)) return json({ error: "bad_id" }, 400);
    if (req.method === "DELETE" && id) {
      if (id === user.id) return json({ error: "self" }, 400);
      await admin.deleteUser(id);
      return json({ deleted: id });
    }
    if (req.method === "PATCH" && id) {
      const body = (await req.json().catch(() => null)) as any;
      const target = await admin.getUser(id).catch(() => null);
      if (!target) return json({ error: "not_found" }, 404);
      if (body?.action === "reset_password") {
        const password = tempPassword();
        const updated = await admin.updateUser(id, {
          password, user_metadata: { ...(target.userMetadata ?? {}), temp_password: true },
        });
        return json({ user: userView(updated), password });
      }
      if (body?.action === "set_admin" && typeof body.isAdmin === "boolean") {
        if (id === user.id && !body.isAdmin) return json({ error: "self" }, 400);
        const updated = await admin.updateUser(id, { app_metadata: withRole(target.appMetadata, body.isAdmin) });
        return json({ user: userView(updated) });
      }
      return json({ error: "bad_action" }, 400);
    }
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
  path: ["/api/me", "/api/reports", "/api/reports/:id", "/api/equipment", "/api/users", "/api/users/:id"],
};
