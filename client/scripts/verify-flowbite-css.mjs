import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const requiredTokens = ["invisible", "opacity-0", "transition-opacity"];
const assetsDir = path.join(process.cwd(), "dist", "assets");

const fail = (message) => {
  console.error(`[verify-flowbite-css] ${message}`);
  process.exit(1);
};

const entries = await readdir(assetsDir, { withFileTypes: true }).catch((error) => {
  fail(`Cannot read ${assetsDir}: ${error.message}`);
});

const cssFiles = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith(".css"))
  .map((entry) => path.join(assetsDir, entry.name));

if (cssFiles.length === 0) {
  fail("No CSS files found in dist/assets. Run a build before verification.");
}

const cssContent = (await Promise.all(cssFiles.map((filePath) => readFile(filePath, "utf8")))).join("\n");

const missingTokens = requiredTokens.filter((token) => !cssContent.includes(token));
if (missingTokens.length > 0) {
  fail(
    `Missing required Tailwind tokens in built CSS: ${missingTokens.join(", ")}. ` +
      "Flowbite classes may be excluded from Tailwind content scan."
  );
}

console.log(
  `[verify-flowbite-css] OK. Found required tokens: ${requiredTokens.join(", ")} in ${cssFiles.length} CSS file(s).`
);
