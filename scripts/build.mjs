import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await mkdir("dist/server", { recursive: true });
await mkdir("dist/.openai", { recursive: true });
await cp("worker", "dist/server", { recursive: true });
const hero = await readFile("assets/hero-barbershop-cyan.webp");
await writeFile("dist/server/hero-data.js", `export const heroData = "data:image/webp;base64,${hero.toString("base64")}";\n`);
const logo = await readFile("assets/muzain-logo.webp");
await writeFile("dist/server/logo-data.js", `export const logoData = "data:image/webp;base64,${logo.toString("base64")}";\n`);
const celebrity1 = await readFile("assets/celebrity-1.webp");
const celebrity2 = await readFile("assets/celebrity-2.webp");
await writeFile("dist/server/celebrity-data.js", `export const celebrity1 = "data:image/webp;base64,${celebrity1.toString("base64")}";\nexport const celebrity2 = "data:image/webp;base64,${celebrity2.toString("base64")}";\n`);
await cp(".openai/hosting.json", "dist/.openai/hosting.json");
console.log("Built Sites worker artifact.");
