import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

if (process.env.VERCEL !== "1") {
  process.exit(0);
}

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function findPackage(name) {
  let dir = apiRoot;
  for (let step = 0; step < 4; step += 1) {
    const candidate = path.join(dir, "node_modules", name);
    if (fs.existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  throw new Error(`Не найден пакет ${name}`);
}

function run(script, args = []) {
  execFileSync(process.execPath, [script, ...args], { stdio: "inherit", env: process.env });
}

console.log("kromka: собираем API для Vercel");
const engines = path.join(findPackage("@prisma/engines"), "scripts", "postinstall.js");
if (fs.existsSync(engines)) run(engines);
const esbuildInstall = path.join(findPackage("esbuild"), "install.js");
if (fs.existsSync(esbuildInstall)) run(esbuildInstall);
run(path.join(findPackage("prisma"), "build", "index.js"), ["generate", "--schema", path.resolve(apiRoot, "../../packages/db/prisma/schema.prisma")]);

const esbuild = await import(pathToFileURL(path.join(findPackage("esbuild"), "lib", "main.js")).href);
await esbuild.build({
  entryPoints: [path.join(apiRoot, "src", "index.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: path.join(apiRoot, "src", "vercel-bundle.mjs"),
  external: ["@node-rs/argon2"],
  plugins: [
    {
      name: "prisma-ts",
      setup(build) {
        build.onResolve({ filter: /^db$/ }, () => {
          const clientTs = path.resolve(apiRoot, "../../packages/db/src/client.ts");
          if (fs.existsSync(clientTs)) return { path: clientTs };
          const clientJs = path.resolve(apiRoot, "../../packages/db/dist/src/client.js");
          if (fs.existsSync(clientJs)) return { path: clientJs };
          return null;
        });
        build.onResolve({ filter: /^\.{1,2}\/.*\.js$/ }, (args) => {
          const tsPath = path.resolve(args.resolveDir, args.path.replace(/\.js$/, ".ts"));
          if (fs.existsSync(tsPath)) return { path: tsPath };
          return null;
        });
      },
    },
  ],
});
console.log("kromka: bundle готов");
