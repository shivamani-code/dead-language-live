
import sys, json, numpy as np
sys.path.insert(0, sys.argv[1])
import dllvoice
wav, roms = sys.argv[2], json.loads(sys.argv[3])
AL=dllvoice.Aligner()
y=dllvoice.load(wav,16000)
print(json.dumps(AL(y,roms)))
