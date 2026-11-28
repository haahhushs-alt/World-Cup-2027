from pathlib import Path
import numpy as np
from scipy.signal import butter,sosfilt
from scipy.io.wavfile import write
import subprocess,base64,json,tempfile
ROOT=Path(__file__).resolve().parents[1]
import os
os.chdir(ROOT)
scratch=tempfile.TemporaryDirectory()
wav=Path(scratch.name)/'sample.wav'
sr=24000;rng=np.random.default_rng(2027);out=Path('game/audio');out.mkdir(parents=True,exist_ok=True)
def noise(n,lo=80,hi=6000):
 x=rng.normal(size=n);return sosfilt(butter(3,[lo,hi],fs=sr,btype='bandpass',output='sos'),x)
def echo(x):
 result=x.copy()
 for delay,amp in [(.063,.19),(.13,.13),(.26,.08),(.41,.045)]:
  k=int(delay*sr)
  if k<len(x):result[k:]+=x[:-k]*amp
 return result
def stereo(x):
 if x.ndim==2:return x
 return np.stack([x,np.roll(x,83)*.89+np.roll(x,1407)*.11],axis=1)
def save(name,x,peak=.8):
 x=stereo(x);x=x/max(np.max(np.abs(x)),.01)*peak
 write(wav,sr,(x*32767).astype('int16'))
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(wav),'-c:a','libmp3lame','-b:a','96k',str(out/(name+'.mp3'))],check=True)
def impact(duration,freq,decay,bite):
 t=np.arange(int(duration*sr))/sr
 return echo(np.sin(2*np.pi*(freq*t-45*t*t))*np.exp(-decay*t)+noise(len(t),100,6500)*np.exp(-90*t)*bite)
for name,args in {'pass':(.30,118,27,.7),'shot':(.48,92,20,1.1),'power':(.63,76,15,1.4),'save':(.40,140,27,1.7),'step':(.15,180,55,.45),'bounce':(.3,170,31,.4),'tackle':(.48,65,17,1.8)}.items():save(name,impact(*args),.7 if name!='step' else .38)
t=np.arange(sr)//1/sr
metal=np.zeros(sr)
for f in [690,1437,2196,3304]:metal+=np.sin(2*np.pi*f*t)*np.exp(-t*(5+f/700))*.25
save('post',echo(metal+noise(sr,800,5000)*np.exp(-t*70)*.22))
for name,pattern in [('whistle',[0]),('fulltime',[0,.32,.69])]:
 t=np.arange(int(sr*(.8+pattern[-1])))/sr;x=np.zeros(len(t))
 for start in pattern:
  u=t-start;mask=(u>=0)&(u<(.55 if start==pattern[-1] else .18));en=np.minimum(np.maximum(u,0)*100,1)*np.minimum(np.maximum(.55-u,0)*30,1)
  phase=2*np.pi*(2730*u+13*np.sin(2*np.pi*25*u));x+=mask*en*(np.sin(phase)+.44*np.sin(phase*1.34))*.32
 save(name,echo(x))
# Layer individual formant-shaped voices into a broad, decorrelated stadium bed.
def crowd(duration,roar=False):
 n=int(sr*duration);t=np.arange(n)/sr;x=np.zeros((n,2))
 for v in range(70):
  f=rng.uniform(92,255);phase=2*np.pi*f*t+.4*np.sin(2*np.pi*rng.uniform(3,7)*t)
  voice=np.sin(phase)*.22+np.sin(phase*2)*.3+np.sin(phase*3)*.38+np.sin(phase*5)*.12
  wav=(.35+.3*np.sin(2*np.pi*rng.uniform(.19,.7)*t+rng.uniform(0,7)))
  if roar:wav*=np.minimum(t*2,1)*np.exp(-t*.09)
  pan=rng.uniform(.1,.9);x[:,0]+=voice*wav*(1-pan);x[:,1]+=voice*wav*pan
 for c in range(2):x[:,c]+=noise(n,180,4100)*(.65 if roar else .18)
 if not roar:
  # Cross-fade both ends so the PCM loop is quiet at its seam.
  fade=np.minimum(1,np.minimum(t/1,(duration-t)/1));x*=fade[:,None]
 else:
  for k in range(105):
   at=rng.integers(0,n-3000);pop=noise(2200,700,5500)*np.exp(-np.arange(2200)/340)*.5
   x[at:at+2200,k%2]+=pop
  x*=np.minimum(t/.12,1)[:,None]*np.minimum((duration-t)/1.5,1)[:,None]
 return x
save('crowd',crowd(18),.52);save('cheer',crowd(7,True),.85)
t=np.arange(sr*4)/sr
chant=np.zeros(len(t))
for start in [0,.65,1.3,2.4,3.05]:
 u=t-start;env=np.maximum(0,1-np.abs(u-.23)/.24)
 for f in [123.47,146.83,185]:
  for h in range(1,7):chant+=np.sin(2*np.pi*f*h*u+.16*np.sin(2*np.pi*5*u))*env/(h*8)
save('chant',echo(chant)+noise(len(t),200,1900)*.06,.6)
# Original 16-bar instrumental electronic menu loop.
bpm=112;beat=60/bpm;dur=32*beat;n=int(dur*sr);t=np.arange(n)/sr;music=np.zeros(n)
for i in range(32):
 u=t-i*beat;hit=(u>=0)&(u<.3);music+=hit*np.sin(2*np.pi*(52*u+2.8*(1-np.exp(-35*np.maximum(u,0)))))*np.exp(-np.maximum(u,0)*22)*.33
 if i%2:
  music+=hit*noise(n,1000,6500)*np.exp(-np.maximum(u,0)*28)*.19
 for off in [0,.5]:
  a=u-off*beat;music+=((a>=0)&(a<.055))*noise(n,6500,10500)*np.exp(-np.maximum(a,0)*100)*.1
 roots=[146.83,130.81,174.61,110];root=roots[(i//8)%4]
 a=t-i*beat;env=((a>=0)&(a<beat*.8))*np.exp(-np.maximum(a,0)*8)
 note=root*[1,1.5,2,1.25,1.5,1,2,1.5][i%8];music+=env*(np.sin(2*np.pi*note*a)+.17*np.sin(2*np.pi*note*2*a))*.18
save('music',music,.72)
t=np.arange(int(sr*.13))/sr;save('ui',np.sin(2*np.pi*(880*t+1800*t*t))*np.exp(-t*38),.25)
# Close boot contact, then a separate nylon mesh impact and crowd reaction to a narrow miss.
t=np.arange(int(sr*.18))/sr
save('dribble',np.sin(2*np.pi*(151*t-190*t*t))*np.exp(-44*t)+noise(len(t),350,2100)*np.exp(-110*t)*.34,.38)
t=np.arange(int(sr*.61))/sr
net=noise(len(t),760,5600)*np.exp(-t*18)*.7
for start in [.008,.024,.047,.086,.122]:
 u=np.maximum(t-start,0)
 net+=(t>=start)*np.sin(2*np.pi*(rng.uniform(220,530)*u-55*u*u))*np.exp(-19*u)*.21
save('net',echo(net),.68)
t=np.arange(int(sr*1.85))/sr
breath=np.minimum(t/.23,1)*np.exp(-t*1.9)*np.clip((1.85-t)/.3,0,1)
sigh=noise(len(t),210,2800)*.42
for f in rng.uniform(105,255,44):
 phase=2*np.pi*f*(t-.065*t*t)+rng.uniform(0,6)
 sigh+=(np.sin(phase)+.54*np.sin(2*phase)+.3*np.sin(3*phase))*.046
save('near-miss',echo(sigh*breath),.62)
# Embed the decoded-source bytes for file:// WKWebView without network or fetch.
assets={p.stem:base64.b64encode(p.read_bytes()).decode() for p in sorted(out.glob('*.mp3'))}
Path('game/audio-data.js').write_text('window.WC=window.WC||{};WC.audioData='+json.dumps(assets,separators=(',',':'))+';\n')
print({k:round(len(v)*.75/1024) for k,v in assets.items()})
