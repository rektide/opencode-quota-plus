import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import babel from "@babel/core";
import typescriptPreset from "@babel/preset-typescript";
import solidPreset from "babel-preset-solid";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

async function compileTui(sourceName, outputDirectory, outputName) {
  const sourcePath = path.join(rootDir, "src", sourceName);
  const outputPath = path.join(rootDir, "dist", outputDirectory, `${outputName}.js`);
  const source = await fs.readFile(sourcePath, "utf8");
  const transformed = await babel.transformAsync(source, {
    filename: sourcePath,
    configFile: false,
    babelrc: false,
    presets: [
      [solidPreset, { moduleName: "@opentui/solid", generate: "universal" }],
      [typescriptPreset],
    ],
  });

  if (!transformed?.code)
    throw new Error(`Babel transform returned empty output for ${sourceName}`);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const code = outputDirectory
    ? transformed.code.replaceAll('from "./', 'from "../')
    : transformed.code;
  await fs.writeFile(outputPath, `${code}\n`);
}

await fs.copyFile(path.join(rootDir, "src", "tui.tsx"), path.join(rootDir, "dist", "tui.tsx"));
await fs.mkdir(path.join(rootDir, "dist", "v1"), { recursive: true });
await fs.copyFile(
  path.join(rootDir, "dist", "tui.d.ts"),
  path.join(rootDir, "dist", "v1", "tui.d.ts"),
);
await compileTui("tui.tsx", "v1", "tui");
await compileTui("tui-v2.tsx", "v2", "tui");
await fs.copyFile(
  path.join(rootDir, "dist", "tui-v2.d.ts"),
  path.join(rootDir, "dist", "v2", "tui.d.ts"),
);
await fs.writeFile(
  path.join(rootDir, "dist", "tui.js"),
  `import v1 from "./v1/tui.js";\nimport v2 from "./v2/tui.js";\n\nexport default { id: v2.id, tui: v1.tui, setup: v2.setup };\n`,
);
await fs.writeFile(
  path.join(rootDir, "dist", "tui.d.ts"),
  `import type v1 from "./v1/tui.js";\nimport type v2 from "./v2/tui.js";\n\ndeclare const plugin: {\n  id: string;\n  tui: typeof v1.tui;\n  setup: typeof v2.setup;\n};\nexport default plugin;\n`,
);

for (const artifact of ["tui.jsx", "tui.jsx.map", "tui-v2.jsx", "tui-v2.jsx.map", "tui.d.ts.map"]) {
  await fs.rm(path.join(rootDir, "dist", artifact), { force: true });
}
