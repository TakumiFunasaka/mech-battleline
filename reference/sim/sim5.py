import sys, sim3, sim2
from sim3 import FLY,HEAVY
GROUND={2,3,4}
B=int(sys.argv[1])
_ev=sim3.ev;_pot=sim3.pot
def ev(cards,f):
    v=_ev(cards,f)
    return v+B if f.mode=='buff' and any(n in f.dis for c,n in cards) else v
def pot(P,pool,M,N,f):
    if f.mode!='buff': return _pot(P,pool,M,N,f)
    if len(P)==3: return ev(P,f)
    d=sim2.best_by_cat(P,pool,M,N,frozenset()); best=max(f.order[c]*100+s for c,s in d.items())
    if any(n in f.dis for c,n in P): return best+B
    alt=-1
    for c,n in list(pool):
        if n in f.dis:
            pool.discard((c,n)); alt=max(alt,pot(P+[(c,n)],pool,M,N,f)); pool.add((c,n))
    return max(best,alt)
sim3.ev=ev;sim3.pot=pot
A={'空域':FLY,'要塞':HEAVY,'市街地':GROUND}
if __name__=="__main__": sim3.run(1500,f'bonus+{B}',[('空域','buff',frozenset(FLY)),('要塞','buff',frozenset(HEAVY)),('市街地','buff',frozenset(GROUND))])
if __name__=="__main__":
 for t,attr in A.items():
    on=[x for x in sim3.INC if x[0]==t]; pl=[x for x in sim3.INC if x[0]=='平原']
    r=lambda L:sum(any(n in attr for n in x[2]) for x in L)/max(1,len(L))
    print(f"   {t}: 勝利編成に有利属性を含む率 {r(on):.2f} (平原での同属性含有率 {r(pl):.2f})")
