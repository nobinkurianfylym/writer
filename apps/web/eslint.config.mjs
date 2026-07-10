import { FlatCompat } from "@eslint/eslintrc";
import { reactConfig } from "@fylym/config/eslint/react";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

// `next/core-web-vitals` (via FlatCompat) redefines the `react`/`react-hooks`
// plugins that our shared reactConfig already registers, which flat config
// rejects ("Cannot redefine plugin"). Strip the duplicate plugin definitions
// from Next's config while keeping its rules.
const nextConfigs = compat.extends("next/core-web-vitals").map((cfg) => {
  if (!cfg.plugins) return cfg;
  const plugins = { ...cfg.plugins };
  delete plugins.react;
  delete plugins["react-hooks"];
  return { ...cfg, plugins };
});

export default [...reactConfig, ...nextConfigs];
