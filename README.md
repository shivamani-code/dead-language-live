# Dead Language Live

Speak Sanskrit out loud: type a phrase, get it in Sanskrit with Vedic pitch accents, and hear it in a clear voice with live syllable highlighting. Plus an Indus script lab to explore the undeciphered seals.

Live: https://dead-language-live.sites.tab.bot/

## What's inside
- `site/`: the web app
  - `vedic.js` + `lexicon.txt`: transliteration and accent marking (accented headwords from the Monier-Williams dictionary via the Cologne Digital Sanskrit Lexicon)
  - `translate.js`: phrase book + translation to Sanskrit
  - `voice.js`: the voice player (pre-rendered clips + syllable timing)
  - `indus.html`, `indus.js`, `indus-data.js`: the Indus script lab
  - `_worker.js`: two small edge routes, `/api/tr` (translation relay) and `/api/tts` (fallback speech relay); no keys
- `voice-host/`: the pre-rendered voice clips (`c/*.mp3`) and the edge worker that serves them with CORS
- `tools/`: offline scripts used to build/check the voice: syllable aligner (`dllvoice.py`, `align1.py`), Whisper-based judge (`judge.py`), Playwright QA (`qa2.py`), phrase dump (`dump.js`), and `serve.py`, a local server that proxies `/api/*` to the live site

## Run locally
```bash
python3 tools/serve.py site 8080
# open http://localhost:8080
```
Or with Cloudflare: `npx wrangler pages dev site` (runs `_worker.js` locally too).

## Tech
Vanilla JS, Canvas, Web Audio, Cloudflare Workers (edge routes). Voice tooling in Python (PyTorch/torchaudio, Praat via parselmouth, faster-whisper).

## Sources and licences
Full source list is on the app's About page. `site/indus-data.js` is derived from Yajnadevam's indus-website inscription database (GPL-3.0), so that file stays under GPL-3.0. Seal photos are from Wikimedia Commons (credited in the app).
