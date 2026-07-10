import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { registry } from "../registry.js";
import "../envelope.js";
import "../pagination.js";
import "../project.js";
import "../script.js";
import "../script-state.js";
import "../jobs.js";
import "../paths.js";

const generator = new OpenApiGeneratorV31(registry.definitions);

const document = generator.generateDocument({
  openapi: "3.1.0",
  info: { title: "FYLYM Writer API", version: "0.0.0" },
  servers: [{ url: "http://localhost:3001" }],
});

const outPath = fileURLToPath(new URL("../../dist/openapi.json", import.meta.url));
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(document, null, 2));

console.log(`OpenAPI document written to ${outPath}`);
