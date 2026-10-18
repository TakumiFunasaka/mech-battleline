import sys; sys.argv=["x","50"]
import sim3, sim5
def go(lbl,fly,crw,k,G):
    sim5.B=50
    sim3.run(G,f'{lbl} 特殊地形{k}/7',[('空域','buff',frozenset(fly)),('悪路','buff',frozenset(crw))],k=k,M=6,N=9)
    for t,attr in (('空域',fly),('悪路',crw)):
        on=[x for x in sim3.INC if x[0]==t]; pl=[x for x in sim3.INC if x[0]=='平原']
        r=lambda L:sum(any(n in attr for n in x[2]) for x in L)/max(1,len(L))
        print(f"   {t}: 有利属性含有 {r(on):.2f} / 平原 {r(pl):.2f} (n={len(on)})",flush=True)
which=sys.argv_extra if hasattr(sys,'argv_extra') else None
