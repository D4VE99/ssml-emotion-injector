import { generate, EMOTIONS, VERSION } from "../src/index.js";

const text = `Esta mesa é de madeira.
Queres um gelado?
Não acredito que isto aconteceu!
Que desilusão, não era isto que esperava.`;

const ann = [
  { da: "Queres", a: "gelado?", emozione: "domanda" },
  { da: "Não acredito", a: "aconteceu!", emozione: "euforia" },
  { da: "Que desilusão", a: "esperava.", emozione: "desapontado" }, // alias → dispiacere
];

const ssml = generate(text, ann);
console.log("VERSION:", VERSION);
console.log("emotions:", Object.keys(EMOTIONS).join(", "));
console.log("--- SSML (first 600 chars) ---");
console.log(ssml.slice(0, 600));
console.log("...");
// assertions
if (!ssml.startsWith('<speak')) throw new Error("no <speak> root");
if (!ssml.includes('xml:lang="pt-PT"')) throw new Error("no lang");
if (!/<prosody /.test(ssml)) throw new Error("no prosody tags");
// alias resolution works (desapontado → dispiacere profile exists)
// unknown emotion should throw
let threw = false;
try { generate("ola", [{ da: "ola", emozione: "banana" }]); } catch { threw = true; }
if (!threw) throw new Error("unknown emotion did not throw");
console.log("\nALL CHECKS PASSED");
