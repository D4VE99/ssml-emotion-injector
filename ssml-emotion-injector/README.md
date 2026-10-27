# SSML Emotion Injector

Emotional prosody for **European Portuguese (pt-PT)** speech synthesis. The library turns plain text plus a small set of emotion annotations into well-formed **SSML**, using prosodic profiles acoustically calibrated on European Portuguese data and P-ToBI contour templates. It is dependency-free, runs entirely in the browser (or Node), and is designed to feed the Web Speech API or any SSML-compatible TTS engine.

Developed as part of a master's thesis on prosody in web speech synthesis (Cogliati, University of Milan), with prosodic profiles grounded in Santos & Cruz (2026), Cruz (2013), and the corpus of Julião, Abad & Moniz (2020).

## Install / load

**Via CDN (jsDelivr), as a global for a `<script>` tag:**

```html
<script src="https://cdn.jsdelivr.net/gh/D4VE99/ssml-emotion-injector@v1.0.0/dist/ssml-emotion-injector.min.js"></script>
<script>
  const ssml = SSMLEmotionInjector.generate("Queres um gelado?", [
    { da: "Queres", a: "gelado?", emozione: "pergunta" }
  ]);
  console.log(ssml);
</script>
```

**As an ES module (CDN or bundler):**

```js
import { generate } from "https://cdn.jsdelivr.net/gh/D4VE99/ssml-emotion-injector@v1.0.0/dist/ssml-emotion-injector.esm.js";

const ssml = generate("Não acredito que isto aconteceu!", [
  { da: "Não acredito", a: "aconteceu!", emozione: "euforia" }
]);
```

## API

### `generate(text, annotations?, options?) → string`

- **`text`** — plain pt-PT text; may span multiple lines.
- **`annotations`** — array of emotion spans. Each entry is either
  - `{ da, a?, emozione, contour? }` — tag the text from the marker `da` to the end of marker `a` (or just the `da` string if `a` is omitted); or
  - `{ righe, emozione, contour? }` — tag a 1-based line range, e.g. `"2"` or `"2-4"`.
- **`options.lang`** — value of `xml:lang` (default `"pt-PT"`).

Any text **not** covered by an annotation automatically receives the neutral EP declarative profile (`H+L* L%`), so the whole utterance is rendered within one consistent prosodic system. Returns a well-formed SSML string. Throws if an annotation names an unknown emotion or a marker string absent from the text.

An optional `contour` field overrides the auto-generated pitch contour for that span, e.g. `"contour": "(0%,+5st)(75%,+10st)(100%,-2st)"`.

### `EMOTIONS`

An object whose keys are the available emotion identifiers, each with its label, base pitch, rate, volume, and source note.

## Emotions

| Key | Label | P-ToBI tune | Portuguese aliases |
|---|---|---|---|
| `neutro` | Neutral | H+L* L% | `neutral` |
| `euforia` | Euphoria / Happiness | H*+L L% (wide) | `euphoria` |
| `tristezza` | Sadness | H* L% | `triste`, `sadness` |
| `rabbia` | Hot anger | H*+L L% | — |
| `domanda` | Yes-no question | L*+H H% | `pergunta`, `question` |
| `dispiacere` | Disappointment | sustained-fall | `desapontado`, `disappointment` |

The Portuguese aliases used in the perceptual validation (`triste`, `desapontado`, `pergunta`) map onto the validated profiles without changing their logic.

## Note on engine compatibility

The library emits standard SSML. Local engines reached through the Web Speech API (Windows SAPI / OneCore) ignore the `contour` attribute, so pitch movement is expressed here as a per-word stepped `pitch` sequence (a contour polyfill) rather than a single `contour` attribute, which keeps the output compatible with those engines.

## License

MIT © 2026 Davide Cogliati
