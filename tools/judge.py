
import sys, json, os
from faster_whisper import WhisperModel
model, lang = sys.argv[1], sys.argv[2]
files=sys.argv[3:]
wm=WhisperModel(model, device='cpu', compute_type=sys.argv.pop(1) if False else os.environ.get('CT','int8'), cpu_threads=int(os.environ.get('TH','4')))
out={}
for f in files:
    segs,_=wm.transcribe(f, language=lang, beam_size=5, vad_filter=os.environ.get('VAD','1')=='1', condition_on_previous_text=False, temperature=0.0)
    out[f]=' '.join(s.text.strip() for s in segs)
    print(json.dumps({f:out[f]},ensure_ascii=False), flush=True)
