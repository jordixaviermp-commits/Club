import json,sys
a=json.load(open(sys.argv[1])); b=json.load(open(sys.argv[2]))
bad=0; tot=0; scr=0
for k in sorted(set(a)|set(b)):
    x=a.get(k); y=b.get(k)
    if x is None or y is None: print('FALTA',k); bad+=1; continue
    if len(x)!=len(y): print('DISTINTO nº elementos',k,len(x),len(y)); scr+=1; continue
    d=[(i,p[0],p[1],q[1]) for i,(p,q) in enumerate(zip(x,y)) if p[1]!=q[1]]
    tot+=len(x)
    if d: scr+=1; bad+=len(d); print('DIF',k,len(d),'de',len(x),[e[1] for e in d[:3]])
print('pantallas con diferencias:',scr,'| elementos distintos:',bad,'| elementos comparados:',tot)
