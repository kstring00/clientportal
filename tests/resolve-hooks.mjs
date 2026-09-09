import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../", import.meta.url);
const EXTENSIONS = [".ts", ".tsx", ".js", ".mjs", ".json"];

function existingUrl(base) {
  const path = fileURLToPath(base);

  if (existsSync(path)) {
    const stat = statSync(path);
    if (stat.isFile()) return base.href;
    if (stat.isDirectory()) {
      for (const extension of EXTENSIONS) {
        const index = new URL(
          `index${extension}`,
          base.href.endsWith("/") ? base : `${base.href}/`,
        );
        if (existsSync(fileURLToPath(index))) return index.href;
      }
    }
  }

  // TypeScript module names can legitimately contain dots before the extension
  // (`portal.config.ts`), so `path.extname()` cannot tell us whether the import
  // already contains a real source extension. If the exact path did not exist,
  // try the known source extensions unconditionally.
  for (const extension of EXTENSIONS) {
    const candidate = new URL(`${base.href}${extension}`);
    if (existsSync(fileURLToPath(candidate))) return candidate.href;
  }

  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const resolved = existingUrl(new URL(specifier.slice(2), ROOT));
    if (resolved) return { url: resolved, shortCircuit: true };
  }

  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    context.parentURL?.startsWith("file:")
  ) {
    const resolved = existingUrl(new URL(specifier, context.parentURL));
    if (resolved) return { url: resolved, shortCircuit: true };
  }

  return nextResolve(specifier, context);
}
