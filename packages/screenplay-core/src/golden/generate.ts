/**
 * Regenerates the committed golden fixtures (src/golden/fixtures/<name>/)
 * from the corpus registry (corpus.ts) by running the real, already
 * property-tested screenplay-core functions once and writing their output
 * to disk. This is a snapshot/characterization-test generator, not an
 * independent correctness oracle: it locks in today's verified-correct
 * behavior as a regression guard for tomorrow (see the golden/README.md
 * section "What this corpus does and doesn't prove").
 *
 * Run via `pnpm golden:generate` after adding or intentionally changing a
 * corpus entry, then review the resulting diff before committing it.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalize } from "../normalize.js";
import { serializeFountain } from "../fountain/serialize.js";
import { serializeFdx } from "../fdx/serialize.js";
import { paginate } from "../pagination/solver.js";
import { CORPUS } from "./corpus.js";
import { summarizePageMap } from "./page-break-summary.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures");

function main(): void {
  rmSync(FIXTURES_DIR, { recursive: true, force: true });
  mkdirSync(FIXTURES_DIR, { recursive: true });

  for (const entry of CORPUS) {
    const dir = join(FIXTURES_DIR, entry.name);
    mkdirSync(dir, { recursive: true });

    const canonical = normalize(entry.build());
    const fountain = serializeFountain(canonical);
    const fdx = serializeFdx(canonical);
    const pageMap = paginate(canonical, entry.profile);
    const pageBreaks = summarizePageMap(pageMap);

    writeFileSync(join(dir, "description.txt"), `${entry.description}\n`);
    writeFileSync(join(dir, "profile.txt"), `${entry.profile.id}\n`);
    writeFileSync(join(dir, "document.json"), `${JSON.stringify(canonical, null, 2)}\n`);
    writeFileSync(join(dir, "expected.fountain"), fountain);
    writeFileSync(join(dir, "expected.fdx"), fdx);
    writeFileSync(join(dir, "expected.pagebreaks.json"), `${JSON.stringify(pageBreaks, null, 2)}\n`);

    console.log(`generated ${entry.name} (${canonical.blocks.length} blocks, ${pageMap.pages.length} pages)`);
  }

  console.log(`\n${CORPUS.length} corpus entries written to ${FIXTURES_DIR}`);
}

main();
