"""軽量版検証: 戦場数・札構成の縮小 + 地形を『禁止』から『役の序列変更』へ"""
import random
from collections import Counter
CATS=('SF','3K','FL','ST','SUM')
BASE={'SF':4,'3K':3,'FL':2,'ST':1,'SUM':0}
def mk(top=None, sumonly=False):
    if sumonly: return {c:0 for c in CATS}
    o=dict(BASE)
    if top: o[top]=5
    return o
def cat_of(cards):
    ns=sorted(n for c,n in cards); fl=len({c for c,n in cards})==1
    st=ns[1]==ns[0]+1 and ns[2]==ns[1]+1; tk=ns[0]==ns[2]
    return ('SF' if fl and st else '3K' if tk else 'FL' if fl else 'ST' if st else 'SUM'), sum(ns)
def evaluate(cards,order):
    c,s=cat_of(cards); return order[c]*100+s
def best_by_cat(P,pool,M,N,banned):
    k=len(P); need=3-k; Pn=[n for c,n in P]; Pc={c for c,n in P}; distinct=len(set(Pn))==k
    out={}
    if len(Pc)<=1 and distinct:
        for s in range(N-2,0,-1):
            nums=(s,s+1,s+2)
            if any(n not in nums for n in Pn) or any(n in banned for n in nums): continue
            if any(all(n in Pn or (c,n) in pool for n in nums) for c in (Pc or range(M))):
                out['SF']=3*s+3; break
    if len(set(Pn))<=1:
        for n in ([Pn[0]] if Pn else range(N,0,-1)):
            if n in banned: continue
            if sum(1 for c in range(M) if (c,n) in pool)>=need: out['3K']=3*n; break
    if len(Pc)<=1:
        b=-1
        for c in (Pc or range(M)):
            got=t=0
            for n in range(N,0,-1):
                if got==need: break
                if n not in banned and (c,n) in pool: got+=1;t+=n
            if got==need: b=max(b,sum(Pn)+t)
        if b>=0: out['FL']=b
    if distinct:
        for s in range(N-2,0,-1):
            nums=(s,s+1,s+2)
            if any(n not in nums for n in Pn) or any(n in banned for n in nums): continue
            if all(n in Pn or any((c,n) in pool for c in range(M)) for n in nums): out['ST']=3*s+3; break
    got=t=0
    for n in range(N,0,-1):
        if n in banned: continue
        cnt=sum(1 for c in range(M) if (c,n) in pool); take=min(cnt,need-got); got+=take;t+=take*n
        if got==need: out['SUM']=sum(Pn)+t; break
    return out
def pot(P,pool,M,N,f):
    if len(P)==3: return evaluate(P,f.order)
    d=best_by_cat(P,pool,M,N,f.banned)
    return max((f.order[c]*100+s for c,s in d.items()),default=-1)
class Flag:
    def __init__(s,order,banned=frozenset(),name='plain'):
        s.sides=[[],[]];s.done=[None,None];s.owner=None;s.order=order;s.banned=banned;s.name=name
def play(M,N,F,hand,terrain=lambda rng,F:[('plain',mk(),frozenset())]*F,seed=0):
    rng=random.Random(seed)
    deck=[(c,n) for c in range(M) for n in range(1,N+1)];rng.shuffle(deck)
    hands=[[deck.pop() for _ in range(hand)] for _ in range(2)]
    unseen=set((c,n) for c in range(M) for n in range(1,N+1))
    flags=[Flag(o,b,nm) for nm,o,b in terrain(rng,F)]
    need=F//2+1; turn=0;p=0;cp=0;passes=0;win=None;wt=None;cl=[]
    while True:
        h=hands[p]
        legal=[(ci,fi) for fi,f in enumerate(flags) if f.owner is None and len(f.sides[p])<3 for ci,c in enumerate(h) if c[1] not in f.banned]
        if not legal:
            passes+=1;cp+=1
            if (cp>=2 and not deck) or cp>=4: break
            p=1-p;continue
        cp=0
        popp=unseen-set(h); opp={};bef={}
        for fi in {fi for _,fi in legal}:
            f=flags[fi];o=f.sides[1-p]
            opp[fi]=evaluate(o,f.order) if len(o)==3 else pot(o,popp,M,N,f)
            bef[fi]=pot(f.sides[p],unseen,M,N,f)
        bs=-1e9
        for ci,fi in legal:
            f=flags[fi];c=h[ci];unseen.discard(c);a=pot(f.sides[p]+[c],unseen,M,N,f);unseen.add(c)
            o=f.sides[1-p]
            if a<0: sc=-2000
            elif len(o)==3 and a<=opp[fi]: sc=-1000-c[1]
            else: sc=(a-opp[fi])+0.6*(a-bef[fi])
            sc+=rng.random()*0.01
            if sc>bs: bs,best=sc,(ci,fi)
        ci,fi=best;c=h.pop(ci);f=flags[fi];f.sides[p].append(c);unseen.discard(c)
        if len(f.sides[p])==3: f.done[p]=turn
        if deck: h.append(deck.pop())
        turn+=1
        for f in flags:
            if f.owner is not None: continue
            a,b=f.sides
            if len(a)==3 and len(b)==3:
                va,vb=evaluate(a,f.order),evaluate(b,f.order)
                f.owner=(0 if va>vb else 1) if va!=vb else (0 if f.done[0]<f.done[1] else 1)
            else:
                for s in (0,1):
                    if len(f.sides[s])==3 and len(f.sides[1-s])<3 and pot(f.sides[1-s],unseen,M,N,f)<=evaluate(f.sides[s],f.order):
                        f.owner=s;break
            if f.owner is not None: cl.append((f.name,cat_of(f.sides[f.owner])[0]))
        for s in (0,1):
            if sum(f.owner==s for f in flags)>=need: win,wt=s,'maj'
            run=0
            for f in flags:
                run=run+1 if f.owner==s else 0
                if run>=3: win,wt=s,'adj'
        if win is not None: break
        p=1-p
    if win is None:
        c0=sum(f.owner==0 for f in flags);c1=sum(f.owner==1 for f in flags)
        win=0 if c0>c1 else 1 if c1>c0 else -1
    return dict(win=win,turns=turn,passes=passes,deck=len(deck),cl=cl)
def run(n,label,**kw):
    W=Counter();T=0;D=0;cats=Counter();byterr=Counter();P=0
    for g in range(n):
        r=play(seed=hash((label,g))&0xffffffff,**kw)
        W[r['win']]+=1;T+=r['turns'];D+=r['deck']==0;P+=r['passes']>0
        for nm,c in r['cl']: cats[c]+=1;byterr[(nm,c)]+=1
    tc=sum(cats.values())
    return dict(label=label,p1=W[0]/n,draw=W[-1]/n,turns=T/n,deckout=D/n,stuck=P/n,
                cats={c:round(cats[c]/tc,2) for c in CATS},byterr=byterr)
