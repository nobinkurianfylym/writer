/**
 * Seeds the API with a user, project, and a ~300-page script state, then
 * prints JSON ({ token, scriptId }) for k6 to consume. ESM resolves imports
 * from the script file's own directory, so copy it into apps/worker (which
 * has @fylym/editor + yjs) and run it there:
 *
 *   cp infra/perf/seed.mjs apps/worker/.perf-seed.mjs
 *   (cd apps/worker && node .perf-seed.mjs && rm .perf-seed.mjs)
 *
 *   API_URL=http://localhost:3001 overrides the target.
 */
import * as Y from "yjs";
import { prosemirrorToYXmlFragment } from "y-prosemirror";
import { toPmDoc } from "@fylym/editor";

const API = process.env.API_URL ?? "http://localhost:3001";

async function req(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`);
  return res.status === 204 ? undefined : res.json();
}

// ── auth ──
const email = `perf-${Date.now()}@example.com`;
const { accessToken: token } = await req("/auth/register", {
  method: "POST",
  body: { name: "Perf Seed", email, password: "SecureP@ss123!" },
});

// ── org / project / script ──
const { items: orgs } = await req("/v1/orgs", { token });
const orgId = orgs[0].id;
const project = await req(`/v1/orgs/${orgId}/projects`, {
  method: "POST",
  token,
  body: { title: "Perf Project", genre: [], format: "FEATURE" },
});
const script = await req(`/v1/projects/${project.id}/scripts`, {
  method: "POST",
  token,
  body: { title: "300-page Draft", formatProfile: "us-feature" },
});

// ── ~300-page ydocState (same wire format the editor persists) ──
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const blocks = [];
let i = 0;
// ~13 action blocks/page at this length (measured in E5-2's perf test):
// 5000 blocks ≈ 380 pages — comfortably over the 300-page budget target.
for (let n = 0; n < 5000; n++) {
  blocks.push({
    id: uid(i++),
    type: "action",
    text: `Beat ${n}. ${"The camera lingers on the empty hallway. ".repeat(3)}`,
    marks: [],
    attrs: {},
  });
}
const ydoc = new Y.Doc();
prosemirrorToYXmlFragment(toPmDoc(blocks), ydoc.getXmlFragment("content"));
const state = Buffer.from(Y.encodeStateAsUpdate(ydoc));
ydoc.destroy();

await req(`/v1/scripts/${script.id}/state`, {
  method: "PUT",
  token,
  body: { ydocState: state.toString("base64"), compression: "none" },
});

console.log(
  JSON.stringify({ token, orgId, projectId: project.id, scriptId: script.id }),
);
