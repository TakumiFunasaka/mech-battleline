"""地形=配置禁止ではなく『機能停止』型の検証（7戦場・6社×1〜8・手札6）"""
import sim2, random
from sim2 import CATS, mk, best_by_cat, cat_of
from collections import Counter
FLY={1,5,7}; HEAVY={6,8}
def ev(cards,f):
    o=f.order
    if f.mode and any(n in f.dis for c,n in cards):
        if f.mode in('broken','zero'):
            return o['SUM']*100+sum((0 if (f.mode=='zero' and n in f.dis) else n) for c,n in cards)
        if f.mode=='colorless':
            cat,s=cat_of([(c if n not in f.dis else 100+i,n) for i,(c,n) in enumerate(cards)])
            return o[cat]*100+s
    return sim2.evaluate(cards,o)
def pot(P,pool,M,N,f):
    if len(P)==3: return ev(P,f)
    o=f.order; need=3-len(P)
    def sumbest(vals):
        vals=sorted(vals,reverse=True)[:need]
        return None if len(vals)<need else sum(vals)
    if f.mode in('broken','zero'):
        sval=lambda c,n:0 if (f.mode=='zero' and n in f.dis) else n
        base=sum(sval(c,n) for c,n in P)
        sb=sumbest([sval(c,n) for c,n in pool]); s_only=-1 if sb is None else o['SUM']*100+base+sb
        if any(n in f.dis for c,n in P): return s_only
        d=best_by_cat(P,pool,M,N,frozenset(f.dis)); d.pop('SUM',None)
        return max([o[c]*100+s for c,s in d.items()]+[s_only])
    if f.mode=='colorless':
        hasdis=any(n in f.dis for c,n in P)
        d=best_by_cat(P,pool,M,N,frozenset())
        if hasdis: d.pop('SF',None); d.pop('FL',None)
        # SF/FL は機能停止機を含まない形で再計算
        d2=best_by_cat(P,pool,M,N,frozenset(f.dis)) if not hasdis else {}
        for k in('SF','FL'):
            d.pop(k,None)
            if k in d2: d[k]=d2[k]
        return max((o[c]*100+s for c,s in d.items()),default=-1)
    return sim2.pot(P,pool,M,N,f)
class Flag(sim2.Flag):
    def __init__(s,name,mode=None,dis=frozenset()):
        super().__init__(mk(),frozenset(),name); s.mode=mode; s.dis=dis
def play(M,N,F,hand,terr,k,seed):
    rng=random.Random(seed)
    deck=[(c,n) for c in range(M) for n in range(1,N+1)];rng.shuffle(deck)
    hands=[[deck.pop() for _ in range(hand)] for _ in range(2)]
    unseen=set(deck)|set(hands[0])|set(hands[1])
    specs=[rng.choice(terr) for _ in range(k)]+[('平原',None,frozenset())]*(F-k);rng.shuffle(specs)
    flags=[Flag(*s) for s in specs]
    need=F//2+1;turn=0;p=0;cp=0;passes=0;win=None;cl=[];dumped=0
    while True:
        h=hands[p]
        legal=[(ci,fi) for fi,f in enumerate(flags) if f.owner is None and len(f.sides[p])<3 for ci in range(len(h))]
        if not legal:
            passes+=1;cp+=1
            if (cp>=2 and not deck) or cp>=4: break
            p=1-p;continue
        cp=0;popp=unseen-set(h);opp={};bef={}
        for fi in {fi for _,fi in legal}:
            f=flags[fi];o=f.sides[1-p]
            opp[fi]=ev(o,f) if len(o)==3 else pot(o,popp,M,N,f); bef[fi]=pot(f.sides[p],unseen,M,N,f)
        bs=-1e9
        for ci,fi in legal:
            f=flags[fi];c=h[ci];unseen.discard(c);a=pot(f.sides[p]+[c],unseen,M,N,f);unseen.add(c);o=f.sides[1-p]
            if a<0: sc=-2000
            elif len(o)==3 and a<=opp[fi]: sc=-1000-c[1]
            else: sc=(a-opp[fi])+0.6*(a-bef[fi])
            sc+=rng.random()*0.01
            if sc>bs: bs,best=sc,(ci,fi)
        ci,fi=best;c=h.pop(ci);f=flags[fi];f.sides[p].append(c);unseen.discard(c)
        if f.mode and c[1] in f.dis: dumped+=1
        if len(f.sides[p])==3: f.done[p]=turn
        if deck: h.append(deck.pop())
        turn+=1
        for f in flags:
            if f.owner is not None: continue
            a,b=f.sides
            if len(a)==3 and len(b)==3:
                va,vb=ev(a,f),ev(b,f); f.owner=(0 if va>vb else 1) if va!=vb else (0 if f.done[0]<f.done[1] else 1)
            else:
                for s in(0,1):
                    if len(f.sides[s])==3 and len(f.sides[1-s])<3 and pot(f.sides[1-s],unseen,M,N,f)<=ev(f.sides[s],f): f.owner=s;break
            if f.owner is not None:
                w=f.sides[f.owner]
                tag='機能停止' if (f.mode in('broken','zero') and any(n in f.dis for c,n in w)) else cat_of(w)[0]
                cl.append((f.name,tag,tuple(n for c,n in w)))
        for s in(0,1):
            if sum(x.owner==s for x in flags)>=need: win=s
            run=0
            for x in flags:
                run=run+1 if x.owner==s else 0
                if run>=3: win=s
        if win is not None: break
        p=1-p
    if win is None:
        c0=sum(x.owner==0 for x in flags);c1=sum(x.owner==1 for x in flags);win=0 if c0>c1 else 1 if c1>c0 else -1
    return dict(win=win,turns=turn,passes=passes,cl=cl,dumped=dumped)
INC=[]
def run(G,label,terr,k=3,M=6,N=8,F=7,hand=6):
    INC.clear()
    W=Counter();T=0;P=0;D=0;bt=Counter()
    for g in range(G):
        r=play(M,N,F,hand,terr,k,hash((label,g))&0xffffffff)
        W[r['win']]+=1;T+=r['turns'];P+=r['passes']>0;D+=r['dumped'];bt.update((a,b) for a,b,_ in r['cl']);INC.extend(r['cl'])
    print(f"{label} 先手{W[0]/G:.3f} 引分{W[-1]/G:.3f} 手数{T/G:.1f} パス発生{P/G:.2f} 機能停止機の配置/試合{D/G:.2f}",flush=True)
    for n in sorted({n for n,c in bt}):
        tot=sum(v for (nm,c),v in bt.items() if nm==n)
        print("   ",n,{c:round(v/tot,2) for (nm,c),v in sorted(bt.items(),key=lambda x:-x[1]) if nm==n})
if __name__=='__main__':
    G=2000
    run(G,'A 地形なし',[('平原',None,frozenset())])
    for mode,lab in [('broken','B 役なし・数字は残る'),('zero','C 役なし・数字0'),('colorless','D 通信障害(メーカー無効)')]:
        run(G,lab,[('濃霧',mode,frozenset(FLY)),('湿地',mode,frozenset(HEAVY))])
