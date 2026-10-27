/*!
 * SSML Emotion Injector — European Portuguese prosody for the Web Speech API
 * -------------------------------------------------------------------------
 * Converts plain European Portuguese (pt-PT) text plus emotion annotations
 * into well-formed SSML, with prosodic profiles acoustically calibrated on
 * EP data (Santos & Cruz 2026; Cruz 2013; Julião, Abad & Moniz 2020) and
 * P-ToBI contour templates.
 *
 * The engine below (utilities, contour polyfill, P-ToBI templates, emotion
 * profiles, and the core builder) is the exact validated logic extracted
 * from the SSML Emotion Injector v9.3 tool. Only the public API wrapper at
 * the end is new; the prosodic behaviour is unchanged.
 *
 * Author: Davide Cogliati — https://github.com/D4VE99
 * License: MIT
 */

export const VERSION = "1.0.0";

// ══════════════════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════════════════
const _s = n => (n >= 0 ? "+" : "") + n;
const _clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const escXml = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");


// ══════════════════════════════════════════════════════════════════
// CONTOUR POLYFILL
// ══════════════════════════════════════════════════════════════════
function parseContour(str) {
  const t = []; const re = /\(\s*(\d+)\s*%\s*,\s*([+-]?\d+(?:\.\d+)?)\s*(st|Hz|%)\s*\)/g; let m;
  while ((m = re.exec(str)) !== null) t.push({ pos: parseInt(m[1]) / 100, value: parseFloat(m[2]), unit: m[3] });
  return t.sort((a, b) => a.pos - b.pos);
}
function interpolateContour(targets, pos) {
  if (!targets.length) return null; if (targets.length === 1) return targets[0];
  if (pos <= targets[0].pos) return targets[0]; if (pos >= targets[targets.length - 1].pos) return targets[targets.length - 1];
  for (let i = 0; i < targets.length - 1; i++) {
    if (pos >= targets[i].pos && pos <= targets[i + 1].pos) {
      const t = (pos - targets[i].pos) / (targets[i + 1].pos - targets[i].pos);
      return { value: Math.round((targets[i].value + t * (targets[i + 1].value - targets[i].value)) * 10) / 10, unit: targets[i].unit };
    }
  } return targets[targets.length - 1];
}


// ══════════════════════════════════════════════════════════════════
// P-ToBI CONTOUR TEMPLATES FOR EP
//
// Derivati da Cruz (2013) e Santos & Cruz (2026):
//   H+L* L%  = pre-nuclear rise, nuclear LOW, low boundary
//   H*+L L%  = nuclear HIGH peak then fall, low boundary
//   H*   L%  = simple high nuclear, gentle fall to low boundary
//
// Ogni emozione ha un template P-ToBI + offset di registro (st)
// che viene usato per generare il contour automatico.
// ══════════════════════════════════════════════════════════════════

// b = pitch base offset (st), il registro in cui il pattern opera
function ptobi_HplusLstar_L(b) {
  // H+L* L% — salita pre-nucleare, nucleo BASSO, confine basso
  // Tipico di: dichiarative neutre EP, disprezzo, noia
  return [
    { pos: 0, value: b, unit: "st" },        // onset neutro
    { pos: 0.35, value: b + 1, unit: "st" }, // leggera salita pre-nucleare
    { pos: 0.65, value: b + 2, unit: "st" }, // H: picco pre-nucleare
    { pos: 0.82, value: b - 1, unit: "st" }, // L*: nucleo basso
    { pos: 1.0, value: b - 3, unit: "st" },  // L%: confine basso
  ];
}
function ptobi_HstarPlusL_L(b, peak) {
  // H*+L L% — nucleo ALTO con caduta dopo, confine basso
  // Tipico di: gioia EP, rabbia EP (Santos & Cruz 2026)
  const p = peak || 2;
  return [
    { pos: 0, value: b, unit: "st" },
    { pos: 0.40, value: b + 1, unit: "st" },
    { pos: 0.72, value: b + p, unit: "st" },     // H*: picco sul nucleo
    { pos: 0.86, value: b + p - 3, unit: "st" }, // +L: caduta post-nucleare
    { pos: 1.0, value: b - 2, unit: "st" },      // L%: confine basso
  ];
}
function ptobi_Hstar_L(b) {
  // H* L% — accento alto semplice, caduta dolce al confine
  // Tipico di: tristezza EP (Santos & Cruz 2026)
  return [
    { pos: 0, value: b, unit: "st" },
    { pos: 0.45, value: b, unit: "st" },     // regione pre-nucleare piatta
    { pos: 0.72, value: b + 1, unit: "st" }, // H*: leggero rialzo nucleare
    { pos: 1.0, value: b - 2, unit: "st" },  // L%: caduta dolce al confine
  ];
}
function ptobi_LstarPlusH_H(b) {
  // L*+H H% — nucleo basso con salita post-nucleare e confine ALTO
  // Tipico di: domanda sì/no EP (yes-no question)
  // Calibrato su dati audio: F0 media 307Hz, contour ascendente,
  // range 10-12st (leite_e01, ovo_e01 del corpus Julião et al. 2020)
  return [
    { pos: 0, value: b - 1, unit: "st" },
    { pos: 0.30, value: b, unit: "st" },
    { pos: 0.55, value: b - 1, unit: "st" }, // L*: nucleo basso
    { pos: 0.80, value: b + 4, unit: "st" }, // +H: salita post-nucleare
    { pos: 1.0, value: b + 7, unit: "st" },  // H%: confine alto (salita ~11st totale)
  ];
}
function ptobi_HstarPlusL_L_wide(b, peak) {
  // H*+L L% versione AMPIA — rise-fall con caduta post-nucleare
  // Escursione fissata a ~12st (percentile 5-95 del corpus) per euforia/pleasure.
  const p = peak || 7;
  return [
    { pos: 0, value: b - 2, unit: "st" },
    { pos: 0.28, value: b + 2, unit: "st" },
    { pos: 0.58, value: b + p, unit: "st" },     // H*: picco nucleare
    { pos: 0.80, value: b + p - 6, unit: "st" }, // +L: caduta post-nucleare
    { pos: 1.0, value: b - 5, unit: "st" },      // L%: confine basso (escursione ~12st)
  ];
}
function ptobi_flat_fall(b) {
  // Contour sostenuto-piatto con caduta finale decisa (dispiacere EP).
  // Registro SOSTENUTO in alto, assenza della salita pre-nucleare della
  // dichiarativa neutra, caduta finale che scende SOTTO il confine del neutro.
  return [
    { pos: 0, value: b, unit: "st" },        // onset già in registro alto
    { pos: 0.30, value: b, unit: "st" },     // piatto — NIENTE picco pre-nucleare
    { pos: 0.60, value: b - 1, unit: "st" }, // cedimento graduale
    { pos: 0.82, value: b - 3, unit: "st" }, // inizio caduta
    { pos: 1.0, value: b - 6, unit: "st" },  // confine SOTTO quello del neutro
  ];
}


// ══════════════════════════════════════════════════════════════════
// EMOTION PROFILES — ancorati al portoghese europeo
// (Santos & Cruz 2026, Table 1; corpus Julião, Abad & Moniz 2020)
// ══════════════════════════════════════════════════════════════════

function _e(label, pitchBase, rate, volume, contourFn, source, pauseScale) {
  return { label, pitchBase, rate, volume, contourFn, source, pauseScale: pauseScale || 1.0 };
}

export const EMOTIONS = {
  //                      label                                         pitch rate  vol  contourFn
  neutro: _e("Neutro (H+L* L%)", 0, 0, 70, b => ptobi_HplusLstar_L(b),
    "Santos&Cruz2026: F0=206Hz Int=66.1dB Rate=6.57 | Audio: affirmation F0≈210Hz range≈2-17st"),
  euforia: _e("Euforia / Happiness EP (H*+L L% wide)", +7, -15, 88, b => ptobi_HstarPlusL_L_wide(b, 7),
    "Santos&Cruz2026: F0=305.9Hz Int=75.2dB Rate=5.27 | Audio: pleasure, escursione mediana 11.8st; rate -15% (attenuato)", 0.85),
  tristezza: _e("Tristezza / Sadness EP (H* L%)", 0, -10, 55, b => ptobi_Hstar_L(b),
    "Santos&Cruz2026: F0=209.5Hz Int=58.5dB Rate=5.14 | rate -22→-10 per evitare stiramento; rallentamento reso con pause (pauseScale 1.9)", 1.9),
  rabbia: _e("Rabbia / Hot anger EP (H*+L L%)", +6, -18, 88, b => ptobi_HstarPlusL_L(b, 2),
    "Santos&Cruz2026: F0=297.7Hz Int=78.0dB Rate=4.69 | rate limitato a -18 per evitare artefatti", 1.3),

  // ── Derivati dai dati audio del corpus (Julião, Abad & Moniz 2020) ──
  domanda: _e("Domanda sì/no EP (L*+H H%)", +7, -5, 75, b => ptobi_LstarPlusH_H(b),
    "Audio: question F0≈307Hz range=10-12st contour ascendente | jitter 1.4-2.6% shimmer 10-17%"),
  dispiacere: _e("Dispiacere / Displeasure EP (sustained-fall)", +2, -14, 52, b => ptobi_flat_fall(b),
    "Audio: displeasure F0 +2.1/+2.2st sul neutro, registro sostenuto senza picco pre-nucleare | intensità -5dB≈vol 52 | rate -14%", 1.8),
};

// Alias in portoghese per gli identificatori usati nel test percettivo.
// Mappano sui profili validati senza duplicarne la logica.
const ALIASES = {
  triste: "tristezza",
  desapontado: "dispiacere",
  pergunta: "domanda",
  euphoria: "euforia",
  sadness: "tristezza",
  disappointment: "dispiacere",
  question: "domanda",
  neutral: "neutro",
};
function resolveEmotion(name) {
  const k = String(name || "").toLowerCase().trim();
  if (EMOTIONS[k]) return k;
  if (ALIASES[k] && EMOTIONS[ALIASES[k]]) return ALIASES[k];
  return null;
}


// ══════════════════════════════════════════════════════════════════
// CORE ENGINE
// ══════════════════════════════════════════════════════════════════

const FUNC_WORDS = new Set([
  "a", "o", "as", "os", "um", "uma", "uns", "umas", "de", "do", "da", "dos", "das", "dum", "duma",
  "em", "no", "na", "nos", "nas", "num", "numa", "e", "ou", "que", "se", "com", "por", "para", "pra", "pro",
  "ao", "aos", "à", "às", "me", "te", "lhe", "vos", "lhes", "mais", "já", "não", "sim", "é", "são", "foi",
  "este", "esta", "esse", "essa", "isto", "isso", "aquele", "aquela"
]);
function isContent(w) { return !FUNC_WORDS.has(w.toLowerCase().replace(/[^a-zà-ÿ]/g, "")); }

// Pause dalla punteggiatura, scalate col rate dell'emozione
const PAUSE_BASE = { '.': 250, '!': 220, '?': 230, ';': 180, ':': 170, ',': 120, '…': 300, '—': 200, '–': 180 };
function getPauseMs(word, emoRate, pauseScale) {
  const c = word.slice(-1), c2 = word.length > 1 ? word.slice(-2, -1) : '';
  let base = 0;
  if (word.endsWith('...')) base = PAUSE_BASE['…'];
  else if (PAUSE_BASE[c]) base = PAUSE_BASE[c];
  else if (PAUSE_BASE[c2] && /["'»)"]/.test(c)) base = PAUSE_BASE[c2];
  if (!base) return 0;
  return Math.round(base * _clamp((100 - emoRate) / 100, 0.5, 1.8) * (pauseScale || 1));
}
function preBoundaryAdj(pauseMs) {
  if (!pauseMs) return 0;
  if (pauseMs >= 200) return -4; if (pauseMs >= 120) return -3; return -2;
}
const RATE_FLOOR = -28, RATE_CEIL = 25;

function computeCharEmotions(text, instructions) {
  const charEmo = new Array(text.length).fill(null);
  const charContour = new Array(text.length).fill(null);
  const errors = [];
  for (let i = 0; i < instructions.length; i++) {
    const ins = instructions[i]; const emo = resolveEmotion(ins.emozione);
    if (!emo) { errors.push(`#${i + 1}: emozione "${ins.emozione}" sconosciuta`); continue; }
    if (ins.da !== undefined) {
      const da = String(ins.da), si = text.indexOf(da);
      if (si === -1) { errors.push(`#${i + 1}: "${da}" non trovato`); continue; }
      let ei;
      if (ins.a !== undefined) { const a = String(ins.a), ap = text.indexOf(a, si); if (ap === -1) { errors.push(`#${i + 1}: "${a}" non trovato`); continue; } ei = ap + a.length; }
      else ei = si + da.length;
      const ct = ins.contour ? parseContour(ins.contour) : null;
      for (let c = si; c < ei && c < text.length; c++) { if (charEmo[c] === null) { charEmo[c] = emo; if (ct) charContour[c] = ct; } }
    } else if (ins.righe !== undefined) {
      const lines = text.split("\n"), p = String(ins.righe).split("-").map(s => parseInt(s.trim(), 10));
      const ls = p[0] - 1, le = (p.length > 1 ? p[1] : p[0]) - 1; let cp = 0;
      const ct = ins.contour ? parseContour(ins.contour) : null;
      for (let li = 0; li < lines.length; li++) {
        if (li >= ls && li <= le && lines[li].trim()) for (let c = cp; c < cp + lines[li].length; c++) { if (charEmo[c] === null) { charEmo[c] = emo; if (ct) charContour[c] = ct; } }
        cp += lines[li].length + 1;
      }
    } else errors.push(`#${i + 1}: serve "da" oppure "righe"`);
  }
  return { charEmo, charContour, errors };
}

// ── VOLUME DINAMICO ──────────────────────────────────────────
function calcWordVolume(baseVol, posInSpan, spanLen, content, pauseAfter) {
  const progress = spanLen > 1 ? posInSpan / (spanLen - 1) : 0;
  const accent = content ? 4 : -4;                 // contenuto +4, funzionale -4
  const decl = -Math.round(progress * 3);          // declinazione lungo la frase
  const preB = pauseAfter > 0 ? 2 : 0;             // pre-boundary boost
  return _clamp(baseVol + accent + decl + preB, 20, 100);
}

function buildWordSSML(text, charEmo, charContour, lang) {
  let out = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${escXml(lang)}">\n`;
  const lines = text.split("\n"); let pos = 0;
  for (const line of lines) {
    if (!line.trim()) { pos += line.length + 1; continue; }
    out += "  <s>\n";
    const tokens = []; const re = /\S+/g; let mm;
    while ((mm = re.exec(line)) !== null) tokens.push({ word: mm[0], start: pos + mm.index });
    const lastIdx = tokens.length - 1;

    for (let ti = 0; ti < tokens.length; ti++) {
      const { word, start } = tokens[ti];
      const emo = charEmo[start];
      const manualContour = charContour[start];

      // Testo non taggato → profilo "neutro" (prosodia EP su tutto il testo)
      const effectiveEmo = emo || "neutro";
      const def = EMOTIONS[effectiveEmo];

      let ss = ti, se = ti;
      while (ss > 0 && (charEmo[tokens[ss - 1].start] || "neutro") === effectiveEmo) ss--;
      while (se < lastIdx && (charEmo[tokens[se + 1].start] || "neutro") === effectiveEmo) se++;
      const spanLen = se - ss + 1, posInSpan = ti - ss;
      const content = isContent(word);
      const wordPos = spanLen > 1 ? posInSpan / (spanLen - 1) : 0.5;

      const contour = manualContour || def.contourFn(def.pitchBase);
      const interpResult = interpolateContour(contour, wordPos);
      const pitchVal = interpResult ? Math.round(interpResult.value) + (content ? 1 : -1) : 0;
      const pitch = _s(pitchVal) + (interpResult ? interpResult.unit : "st");

      const pause = getPauseMs(word, def.rate, def.pauseScale);

      const pba = preBoundaryAdj(pause);
      const rateAdj = _clamp(def.rate + (content ? -3 : +5) + pba, RATE_FLOOR, RATE_CEIL);
      const rate = _s(rateAdj) + "%";

      const vol = calcWordVolume(def.volume, posInSpan, spanLen, content, pause);

      out += `    <prosody pitch="${pitch}" rate="${rate}" volume="${vol}">${escXml(word)}</prosody>\n`;
      if (pause > 0) out += `    <break time="${pause}ms"/>\n`;
    }
    out += "  </s>\n"; pos += line.length + 1;
  }
  return out + "</speak>";
}


// ══════════════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════════════

/**
 * Generate SSML markup from European Portuguese text and emotion annotations.
 *
 * @param {string} text  Plain pt-PT text (may contain multiple lines).
 * @param {Array<Object>} [annotations=[]]  Emotion spans. Each entry is either
 *        { da, a?, emozione, contour? } (string markers) or
 *        { righe, emozione, contour? } (1-based line range "2" or "2-4").
 *        Untagged text automatically receives the neutral EP profile.
 * @param {Object} [options]
 * @param {string} [options.lang="pt-PT"]  Value of the xml:lang attribute.
 * @returns {string}  Well-formed SSML document.
 * @throws {Error}  If an annotation references an unknown emotion or a marker
 *                  string that is not found in the text.
 */
export function generate(text, annotations = [], options = {}) {
  if (typeof text !== "string") throw new TypeError("generate(text): text must be a string");
  if (!Array.isArray(annotations)) throw new TypeError("generate(text, annotations): annotations must be an array");
  const lang = (options && options.lang) ? String(options.lang) : "pt-PT";
  const { charEmo, charContour, errors } = computeCharEmotions(text, annotations);
  if (errors.length) throw new Error("SSML Emotion Injector:\n" + errors.join("\n"));
  return buildWordSSML(text, charEmo, charContour, lang);
}

export default { generate, EMOTIONS, VERSION };
