
import numpy as np, re, subprocess, json, os, torch, torchaudio, parselmouth
from parselmouth.praat import call
ROM={'a':'a','A':'aa','i':'i','I':'ii','u':'u','U':'uu','f':'ri','F':'rii','x':'li','X':'lii','e':'e','E':'ai','o':'o','O':'au',
 'k':'k','K':'kh','g':'g','G':'gh','N':'n','c':'c','C':'ch','j':'j','J':'jh','Y':'n','w':'t','W':'th','q':'d','Q':'dh','R':'n',
 't':'t','T':'th','d':'d','D':'dh','n':'n','p':'p','P':'ph','b':'b','B':'bh','m':'m','y':'y','r':'r','l':'l','v':'v','S':'sh','z':'sh',
 's':'s','h':'h','L':'l','M':'m','H':'h','~':'n',"'":''}
def syl_rom(units):
    s=''.join(units).replace('jY','gy')
    return ''.join(ROM.get(c,'') for c in s) or 'a'
def strip_acc(d): return re.sub(r'[\u0951\u0952]','',d)
def load(path,sr):
    out=subprocess.run(['ffmpeg','-v','error','-i',path,'-ac','1','-ar',str(sr),'-f','f32le','-'],capture_output=True,timeout=60).stdout
    return np.frombuffer(out,dtype=np.float32).copy()
def save_wav(path,y,sr):
    subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(sr),'-ac','1','-i','-',path],input=y.astype(np.float32).tobytes(),timeout=60,check=True)
def frame_db(y,sr,hop=0.01):
    fr=int(hop*sr); n=len(y)//fr
    return np.array([20*np.log10(np.sqrt(np.mean(y[i*fr:(i+1)*fr]**2))+1e-9) for i in range(n)])
def trim(y,sr,lead=0.15,tail=0.5,th_db=-45):
    e=frame_db(y,sr); fr=int(0.01*sr)
    idx=np.where(e>e.max()+th_db)[0]
    a=max(0,idx[0]*fr-int(lead*sr)); b=min(len(y),(idx[-1]+3)*fr)
    seg=y[a:b].copy()
    pad=max(0,int(lead*sr)-(idx[0]*fr-a))
    seg=np.concatenate([np.zeros(pad,np.float32),seg,np.zeros(int(tail*sr),np.float32)])
    f=int(0.006*sr); seg[:f]*=np.linspace(0,1,f)
    return seg
class Aligner:
    def __init__(self):
        from torchaudio.pipelines import MMS_FA as b
        self.m=b.get_model(with_star=False).eval(); self.d=b.get_dict(star=None)
    def __call__(self,y16,sylls):
        toks=[];owner=[]
        for i,s in enumerate(sylls):
            for c in s:
                if c in self.d and c!='-': toks.append(self.d[c]); owner.append(i)
        with torch.inference_mode():
            em,_=self.m(torch.from_numpy(y16).unsqueeze(0))
        em=torch.log_softmax(em,dim=-1)
        ali,sc=torchaudio.functional.forced_align(em,torch.tensor([toks],dtype=torch.int32),blank=0)
        ali=ali[0].tolist(); sc=sc[0].exp().tolist()
        ratio=len(y16)/16000/em.shape[1]
        spans=[];prev=0
        for t,lab in enumerate(ali):
            if lab!=0 and (lab!=prev): spans.append([t,t+1,[sc[t]]])
            elif lab!=0: spans[-1][1]=t+1; spans[-1][2].append(sc[t])
            prev=lab
        # note: repeated identical tokens are separated by blanks in CTC, so lab!=prev handles them only if blank between
        assert len(spans)==len(toks),(len(spans),len(toks))
        out=[[None,None,[]] for _ in sylls]
        for (a,b,s),o in zip(spans,owner):
            if out[o][0] is None: out[o][0]=a*ratio
            out[o][1]=b*ratio; out[o][2]+=s
        return [(a,b,float(np.mean(c))) for a,b,c in out]
GENTLE={'U':1.6,'P':1.0,'A':-1.0,'sannatara':-1.5,'S':(2.0,-0.8)}
def offset_curve(times, sylls, tones, gentle=GENTLE):
    # sylls: [(start,end)], tones: list of tone dicts; returns semitone offset at each time (smooth)
    pts=[]
    for (a,b),t in zip(sylls,tones):
        tn=t['tone']; 
        if tn=='A' and t.get('sannatara'): v=gentle['sannatara']
        elif tn=='S': v=None
        else: v=gentle.get(tn,0)
        d=b-a
        if v is None:
            hi,lo=gentle['S']; pts+= [(a+0.15*d,hi),(b-0.1*d,lo)]
        else:
            pts+= [(a+0.2*d,v),(b-0.2*d,v)]
    px=np.array([p[0] for p in pts]); py=np.array([p[1] for p in pts])
    o=np.interp(times,px,py)
    # smooth with 50 ms moving average
    return o
def accentuate(wav_in, wav_out, sylls, tones, compress=0.55, gentle=GENTLE):
    snd=parselmouth.Sound(wav_in)
    man=call(snd,"To Manipulation",0.01,70,320)
    pt=call(man,"Extract pitch tier")
    n=call(pt,"Get number of points")
    ts=np.array([call(pt,"Get time from index",i+1) for i in range(n)])
    fs=np.array([call(pt,"Get value at index",i+1) for i in range(n)])
    med=np.median(fs)
    off=offset_curve(ts,sylls,tones,gentle)
    # smooth offsets over neighbouring points (~40 ms)
    k=5; off=np.convolve(np.pad(off,(k//2,k//2),mode='edge'),np.ones(k)/k,mode='valid')
    newf=med*(fs/med)**compress*2**(off/12)
    npt=call("Create PitchTier","new",snd.xmin,snd.xmax)
    for t,f in zip(ts,newf): call(npt,"Add point",float(t),float(f))
    call([man,npt],"Replace pitch tier")
    out=call(man,"Get resynthesis (overlap-add)")
    out.save(wav_out,"WAV")
def f0_track(wav, rate=50):
    snd=parselmouth.Sound(wav)
    p=snd.to_pitch(time_step=1/rate,pitch_floor=70,pitch_ceiling=320)
    f=p.selected_array['frequency']; t=p.xs()
    return t,f
