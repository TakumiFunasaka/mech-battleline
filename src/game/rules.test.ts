import { describe, expect, it } from 'vitest'
import type { CardId } from './cards'
import { allCards, cardId, companyOf, numberOf } from './cards'
import { DECK_CONFIG, DEFAULT_CONFIG } from './config'
import type { TerrainId } from './config'
import { chooseMove, pickDraw } from './cpu'
import type { GameState, Player } from './engine'
import { checkWinner, deploy, legalMoves, newGame, openFlags } from './engine'
import { bestValue, formationOf, formationValue } from './evaluate'
import { createRng } from './rng'

// 盤面を組み立てるテストは7戦場（過半数4）で書いている。地形の効果は既定（2枚で格上げ）
const cfg = { ...DEFAULT_CONFIG, companies: 6, companyPool: 6, flagCount: 7, winMajority: 4 }

// 社の色 → 社のインデックス（data/units.json の並び順）
const COLOR: Record<string, number> = { 赤: 0, 青: 1, 黄: 2, 緑: 3, 白: 4, 黒: 5 }
/** '赤7' → CardId */
const c = (s: string): CardId => cardId(cfg, COLOR[s[0]], Number(s.slice(1)))
const cs = (...xs: string[]) => xs.map(c)
/** 証明による確保を有効にした設定（既定では不採用） */
const PROOF = { ...cfg, proofSecuring: true }
const val = (cards: CardId[], terrain: TerrainId = 'plain') => formationValue(cfg, cards, terrain)

describe('編成の評価（SPEC 第8節）', () => {
  it('純正コンビ > 同型機', () => {
    expect(formationOf(cfg, cs('赤7', '赤8', '赤9'))).toBe('straightFlush')
    expect(formationOf(cfg, cs('青5', '赤5', '黒5'))).toBe('triple')
    expect(val(cs('赤7', '赤8', '赤9'))).toBeGreaterThan(val(cs('青5', '赤5', '黒5')))
  })
  it('同型機 > 純正チーム', () => {
    expect(formationOf(cfg, cs('青2', '青6', '青9'))).toBe('flush')
    expect(val(cs('青5', '赤5', '黒5'))).toBeGreaterThan(val(cs('青2', '青6', '青9')))
  })
  it('純正チーム > 連携', () => {
    expect(formationOf(cfg, cs('黄3', '赤4', '白5'))).toBe('straight')
    expect(val(cs('青2', '青6', '青9'))).toBeGreaterThan(val(cs('黄3', '赤4', '白5')))
  })
  it('連携 > 寄せ集め（合計26）', () => {
    expect(formationOf(cfg, cs('赤9', '青9', '黄8'))).toBe('mixed')
    expect(val(cs('黄3', '赤4', '白5'))).toBeGreaterThan(val(cs('赤9', '青9', '黄8')))
  })
  it('赤8・青9・黄1 は連番ではない（9→1の循環なし）', () => {
    expect(formationOf(cfg, cs('赤8', '青9', '黄1'))).toBe('mixed')
  })
  it('置いた順に関係なく連番を判定する', () => {
    expect(formationOf(cfg, cs('赤9', '赤7', '赤8'))).toBe('straightFlush')
  })
  it('空域：同型機どうしなら飛行（6）を含む側が勝つ', () => {
    expect(val(cs('赤6', '青6', '黄6'), 'sky')).toBeGreaterThan(val(cs('赤2', '青2', '黄2'), 'sky'))
  })
  it('空域でも役の順位が優先：純正コンビ > 飛行を含む純正チーム', () => {
    expect(val(cs('青7', '青8', '青9'), 'sky')).toBeGreaterThan(val(cs('赤1', '赤3', '赤5'), 'sky'))
  })
  it('空域：同役なら飛行を含む側が合計で負けていても勝つ', () => {
    expect(val(cs('赤1', '赤2', '赤4'), 'sky')).toBeGreaterThan(val(cs('青2', '青5', '青8'), 'sky'))
  })
  it('悪路：履帯（3・4）を含む側が勝つ', () => {
    expect(val(cs('赤3', '青3', '黄3'), 'rough')).toBeGreaterThan(val(cs('赤9', '青9', '黄9'), 'rough'))
  })
  it('平原では属性は関係ない', () => {
    expect(val(cs('赤9', '青9', '黄9'))).toBeGreaterThan(val(cs('赤6', '青6', '黄6')))
  })
})

describe('特殊地形：1枚で優先・2枚で格上げ', () => {
  it('悪路：履帯1枚の純正チームは、履帯なしの同型機に負ける（役が上がらない）', () => {
    expect(val(cs('赤3', '赤7', '赤9'), 'rough')).toBeLessThan(val(cs('青8', '黄8', '白8'), 'rough'))
  })
  it('悪路：履帯2枚の純正チームは、履帯なしの同型機に勝つ（同格になり、有利属性で勝つ）', () => {
    expect(val(cs('赤3', '赤4', '赤9'), 'rough')).toBeGreaterThan(val(cs('青8', '黄8', '白8'), 'rough'))
  })
  it('悪路：履帯3枚の同型機（3-3-3）は純正コンビと同格になり、履帯2枚の純正チームに勝つ', () => {
    expect(val(cs('青3', '黄3', '白3'), 'rough')).toBeGreaterThan(val(cs('赤3', '赤4', '赤9'), 'rough'))
  })
  it('悪路：同じく格上げされた者どうしは合計で比べる', () => {
    expect(val(cs('赤3', '赤4', '赤9'), 'rough')).toBeGreaterThan(val(cs('青3', '青4', '青8'), 'rough'))
  })
  it('悪路：履帯2枚の純正コンビ（2-3-4）は、平原最強の7-8-9より強い', () => {
    expect(val(cs('赤2', '赤3', '赤4'), 'rough')).toBeGreaterThan(val(cs('青7', '青8', '青9'), 'rough'))
  })
  it('空域：飛行3枚の同型機（6-6-6）は、飛行なしの純正コンビに勝つ', () => {
    expect(val(cs('赤6', '青6', '黄6'), 'sky')).toBeGreaterThan(val(cs('白7', '白8', '白9'), 'sky'))
  })
  it('平原では枚数に関係なく役は上がらない', () => {
    expect(val(cs('赤3', '赤4', '赤9'))).toBeLessThan(val(cs('青8', '黄8', '白8')))
  })
})

describe('到達可能な最良の編成', () => {
  it('盤外の札が足りなければ -1', () => {
    expect(bestValue(cfg, cs('赤1'), cs('赤2'), 'plain')).toBe(-1)
  })
  it('全札から作れる最良は平原なら純正コンビ7-8-9', () => {
    expect(bestValue(cfg, [], allCards(cfg), 'plain')).toBe(val(cs('赤7', '赤8', '赤9')))
  })
  it('空域なら飛行を含む純正コンビ（6-7-8）が最良', () => {
    expect(bestValue(cfg, [], allCards(cfg), 'sky')).toBe(val(cs('赤6', '赤7', '赤8'), 'sky'))
  })
})

// ---- エンジン（状態を組み立てて検証） ----

/** 空の盤面。手札・山札は空、地形は全部平原（上書き可） */
function blank(terrains: Partial<Record<number, TerrainId>> = {}, cfgOverride = cfg): GameState {
  const s = newGame(1, cfgOverride)
  s.deck = []
  s.hands = [[], []]
  s.current = 0
  s.flags.forEach((f, i) => (f.terrain = terrains[i] ?? 'plain'))
  return s
}
/** 残りの全カードを山札に入れる（盤面・手札にあるものを除く） */
function fillDeck(s: GameState) {
  const used = new Set([...s.hands[0], ...s.hands[1], ...s.flags.flatMap((f) => [...f.sides[0], ...f.sides[1]])])
  s.deck = allCards(s.cfg).filter((x) => !used.has(x))
}
function setOwner(s: GameState, flag: number, p: Player) {
  s.flags[flag].owner = p
  s.flags[flag].securedBy = 'compare'
}

describe('戦場の決着', () => {
  it('平原で同役・同合計なら先に3枚目を置いた側が勝つ', () => {
    const s = blank()
    // 寄せ集め・合計16 どうし。相手（1）が先に完成させている
    s.flags[0].sides = [cs('赤2', '青5'), cs('黒2', '白5', '緑9')]
    s.flags[0].completedAt = [null, 3]
    s.hands[0] = cs('黄9')
    fillDeck(s)
    s.moveCount = 10
    const t = deploy(s, { card: c('黄9'), flag: 0 })
    expect(t.flags[0].owner).toBe(1)
    expect(t.flags[0].securedBy).toBe('compare')
  })

  it('両者完成：役が強い方が勝つ（後から完成させても）', () => {
    const s = blank()
    s.flags[0].sides = [cs('赤7', '赤8'), cs('青9', '黄9', '白8')]
    s.flags[0].completedAt = [null, 0]
    s.hands[0] = cs('赤9')
    fillDeck(s)
    s.moveCount = 5
    const t = deploy(s, { card: c('赤9'), flag: 0 })
    expect(t.flags[0].owner).toBe(0)
  })

  it('既定（証明なし）：片側だけ完成しても、相手が3枚そろえるまで決着しない', () => {
    const s = blank()
    s.flags[0].sides = [cs('赤7', '赤8'), []]
    s.hands[0] = cs('赤9')
    fillDeck(s)
    const t = deploy(s, { card: c('赤9'), flag: 0 })
    expect(t.flags[0].owner).toBeNull()
    expect(openFlags(t, 1)).toContain(0)
  })

  it('証明による確保（平原）：赤7・赤8・赤9 は相手が空でも即確保', () => {
    const s = blank({}, PROOF)
    s.flags[0].sides = [cs('赤7', '赤8'), []]
    s.hands[0] = cs('赤9')
    fillDeck(s)
    const t = deploy(s, { card: c('赤9'), flag: 0 })
    expect(t.flags[0].owner).toBe(0)
    expect(t.flags[0].securedBy).toBe('proof')
  })

  it('証明による確保（空域）：盤外に飛行を含む純正コンビが残っていれば確保できない', () => {
    const s = blank({ 0: 'sky' }, PROOF)
    s.flags[0].sides = [cs('赤7', '赤8'), []]
    s.hands[0] = cs('赤9')
    fillDeck(s)
    const t = deploy(s, { card: c('赤9'), flag: 0 })
    expect(t.flags[0].owner).toBeNull()
  })

  it('証明による確保（空域）：飛行を含む純正コンビの道が全部断たれていれば確保できる', () => {
    const s = blank({ 0: 'sky' }, PROOF)
    s.flags[0].sides = [cs('赤7', '赤8'), []]
    s.hands[0] = cs('赤9')
    // 飛行（全社の1と6）を他の戦場に置いて盤外から消す
    s.flags[1].sides = [cs('赤6', '青6', '黄6'), cs('緑6', '白6', '黒6')]
    s.flags[1].owner = 0
    s.flags[2].sides = [cs('赤1', '青1', '黄1'), cs('緑1', '白1', '黒1')]
    s.flags[2].owner = 1
    fillDeck(s)
    const t = deploy(s, { card: c('赤9'), flag: 0 })
    expect(t.flags[0].owner).toBe(0)
    expect(t.flags[0].securedBy).toBe('proof')
  })

  it('証明できないときは確保しない（相手がまだ上回りうる）', () => {
    const s = blank({}, PROOF)
    s.flags[0].sides = [cs('赤1', '青5'), cs('黄9')]
    s.hands[0] = cs('緑9')
    fillDeck(s)
    const t = deploy(s, { card: c('緑9'), flag: 0 })
    expect(t.flags[0].owner).toBeNull()
  })

  it('確保済みの戦場には置けない', () => {
    const s = blank()
    setOwner(s, 0, 1)
    s.hands[0] = cs('赤1')
    fillDeck(s)
    expect(legalMoves(s).some((m) => m.flag === 0)).toBe(false)
    expect(() => deploy(s, { card: c('赤1'), flag: 0 })).toThrow()
  })
})

describe('勝利条件', () => {
  it('隣接する3つの戦場を確保で勝利', () => {
    const s = blank()
    setOwner(s, 0, 0)
    setOwner(s, 1, 0)
    s.flags[2].sides = [cs('赤7', '赤8'), cs('青1', '黄2', '白4')]
    s.flags[2].completedAt = [null, 0]
    s.hands[0] = cs('赤9')
    fillDeck(s)
    const t = deploy(s, { card: c('赤9'), flag: 2 })
    expect(t.winner).toBe(0)
    expect(t.winReason).toBe('adjacent')
  })

  it('隣接していない4つの戦場を確保で勝利', () => {
    const s = blank()
    setOwner(s, 0, 0)
    setOwner(s, 2, 0)
    setOwner(s, 4, 0)
    s.flags[6].sides = [cs('赤7', '赤8'), cs('青1', '黄2', '白4')]
    s.flags[6].completedAt = [null, 0]
    s.hands[0] = cs('赤9')
    fillDeck(s)
    const t = deploy(s, { card: c('赤9'), flag: 6 })
    expect(t.winner).toBe(0)
    expect(t.winReason).toBe('majority')
  })

  it('既定（5戦場）：離れた3つの戦場を確保で勝利', () => {
    const s = blank({}, DEFAULT_CONFIG)
    expect(s.flags.length).toBe(5)
    setOwner(s, 0, 0)
    setOwner(s, 2, 0)
    s.flags[4].sides = [cs('赤7', '赤8'), cs('青1', '黄2', '白4')]
    s.flags[4].completedAt = [null, 0]
    s.hands[0] = cs('赤9')
    fillDeck(s)
    const t = deploy(s, { card: c('赤9'), flag: 4 })
    expect(t.winner).toBe(0)
    expect(t.winReason).toBe('majority')
  })

  it('3つ確保でも隣接していなければまだ勝利ではない', () => {
    const s = blank()
    setOwner(s, 0, 0)
    setOwner(s, 2, 0)
    setOwner(s, 4, 0)
    expect(checkWinner(s, 0)).toBeNull()
  })

  it('両者が同時に勝利条件を満たしたら手番側の勝ち（未決事項の仮決め）', () => {
    const s = blank()
    ;[0, 1, 2].forEach((i) => setOwner(s, i, 1))
    ;[4, 5, 6].forEach((i) => setOwner(s, i, 0))
    expect(checkWinner(s, 0)?.winner).toBe(0)
    expect(checkWinner(s, 1)?.winner).toBe(1)
  })
})

describe('手番の進行', () => {
  it('配備後に山札から1枚補充して手番が移る', () => {
    const s = blank()
    s.hands[0] = cs('赤1')
    s.hands[1] = cs('青1')
    fillDeck(s)
    const top = s.deck[0]
    const t = deploy(s, { card: c('赤1'), flag: 3 })
    expect(t.hands[0]).toEqual([top])
    expect(t.deck.length).toBe(s.deck.length - 1)
    expect(t.current).toBe(1)
  })

  it('相手が置けなければパスして（補充なし）自分の手番が続く', () => {
    const s = blank()
    // 相手（1）の側は未決着の全戦場で3枚埋まっている
    s.flags.forEach((f, i) => {
      if (i < 4) f.sides[1] = cs(`黒${i + 1}`, `白${i + 1}`, `緑${i + 1}`)
      else f.owner = i % 2 === 0 ? 0 : 1
    })
    // 0: 4,6 → 自分, 5 → 相手
    s.hands[0] = cs('赤1')
    s.hands[1] = cs('青1')
    fillDeck(s)
    const t = deploy(s, { card: c('赤1'), flag: 0 })
    expect(t.events.some((e) => e.type === 'pass' && e.player === 1)).toBe(true)
    expect(t.current).toBe(0)
    expect(t.hands[1]).toEqual(cs('青1'))
  })

  it('山札が尽きたら補充しない', () => {
    const s = blank()
    s.hands[0] = cs('赤1', '赤2')
    s.hands[1] = cs('青1')
    const t = deploy(s, { card: c('赤1'), flag: 3 })
    expect(t.hands[0]).toEqual(cs('赤2'))
  })

  it('両者とも置けなくなったら確保数で終了（勝利条件を無効にした設定で検証）', () => {
    const s = blank({}, { ...cfg, winMajority: 99, winAdjacent: 99 })
    // 戦場0だけ未決着。相手側は完成済み、自分は2枚。他は 3対3 で確保済み
    s.flags.forEach((f, i) => {
      if (i > 0) f.owner = i <= 4 ? 0 : 1
    })
    s.flags[0].sides = [cs('赤1', '赤2'), cs('青9', '黄9', '白9')]
    s.flags[0].completedAt = [null, 0]
    s.hands[0] = cs('黒5')
    s.moveCount = 3
    const t = deploy(s, { card: c('黒5'), flag: 0 })
    expect(t.flags[0].owner).toBe(1)
    expect(t.winReason).toBe('count')
    expect(t.winner).toBe(0) // 4 対 3
  })
})

describe('CPU対CPUの通し対戦', () => {
  it('同じシードなら同じ展開になり、必ず勝敗がつく', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const play = () => {
        let s = newGame(seed)
        const rng = createRng(seed * 7919)
        while (s.winner === null) s = deploy(s, chooseMove(s, rng))
        return s
      }
      const a = play()
      const b = play()
      expect(a.events).toEqual(b.events)
      expect(a.winner === 0 || a.winner === 1).toBe(true)
      // 証明なしなら空き枠は消えないので、パスは起きない
      expect(a.events.some((e) => e.type === 'pass')).toBe(false)
      // カードの総数は保存される
      const onBoard = a.flags.flatMap((f) => [...f.sides[0], ...f.sides[1]])
      expect(onBoard.length + a.deck.length + a.hands[0].length + a.hands[1].length).toBe(45)
      // 6社から5社を選んで使う
      expect(a.companies.length).toBe(5)
      expect(new Set([...onBoard, ...a.deck, ...a.hands[0], ...a.hands[1]].map((x) => companyOf(a.cfg, x))).size).toBe(5)
      // 特殊地形は1〜2か所
      const special = a.flags.filter((f) => f.terrain !== 'plain').length
      expect(special).toBeGreaterThanOrEqual(1)
      expect(special).toBeLessThanOrEqual(2)
    }
  })
})

describe('契約企業の効果（実験中）', () => {
  const K = { ...cfg, contracts: true }
  const RED = 0, BLUE = 1, YELLOW = 2, GREEN = 3, WHITE = 4
  const v = (cards: CardId[], contract: number | null, terrain: TerrainId = 'plain') =>
    formationValue(K, cards, terrain, contract)

  it('剛炎（赤）：自分の契約社の機体は合計で1機+1。役は変わらない', () => {
    // 寄せ集め 赤2・青5・黄9（16+1）> 寄せ集め 緑8・白8・黒1（17）は同値→ 赤契約なら上回る
    expect(v(cs('赤2', '青5', '黄9'), RED)).toBeGreaterThan(v(cs('緑8', '白7', '黒1'), null))
    expect(v(cs('赤2', '青5', '黄9'), null)).toBeLessThan(v(cs('緑8', '白7', '黒2'), null))
    // 相手の契約社の機体を使っても効果はない
    expect(v(cs('赤2', '青5', '黄9'), BLUE)).toBe(v(cs('赤2', '青5', '黄9'), null))
  })
  it('セレスタイン（青）：青の1・6は平原でも有利機。平原では同じ役で優先まで（格上げはしない）', () => {
    expect(v(cs('青1', '青2', '青9'), BLUE)).toBeGreaterThan(v(cs('赤5', '赤8', '赤9'), null))
    expect(v(cs('青1', '青6', '青9'), BLUE)).toBeLessThan(v(cs('黄9', '緑9', '白9'), null))
    // 他社の飛行機は対象外
    expect(v(cs('赤1', '赤6', '赤9'), BLUE)).toBeLessThan(v(cs('黄9', '緑9', '白9'), null))
  })
  it('アルビオン（白）：白を2機以上含めば同じ役で優先', () => {
    expect(v(cs('白2', '白3', '赤9'), WHITE)).toBeGreaterThan(v(cs('赤8', '青8', '緑7'), null))
    expect(v(cs('白2', '赤3', '青9'), WHITE)).toBeLessThan(v(cs('赤8', '青8', '緑7'), null))
  })
  it('トライレール（黄）：黄を置いた手番は2枚引き、上限7枚', () => {
    const s = blank({}, K)
    s.contracts = [YELLOW, null]
    s.hands[0] = cs('黄1', '赤1', '赤2', '赤3', '赤4', '赤5')
    s.hands[1] = cs('青1')
    fillDeck(s)
    const t = deploy(s, { card: c('黄1'), flag: 0 })
    expect(t.hands[0].length).toBe(7)
    // 契約社以外を置いたら通常どおり1枚
    const u = deploy({ ...t, current: 0 }, { card: c('赤1'), flag: 1 })
    expect(u.hands[0].length).toBe(7)
  })
  it('グリーンホロウ（緑）：緑を置いた手番は上2枚から1枚を選び、残りは山札の下へ', () => {
    const s = blank({}, K)
    s.contracts = [GREEN, null]
    s.hands[0] = cs('緑1')
    s.hands[1] = cs('青1')
    fillDeck(s)
    const [a, b] = s.deck
    const t = deploy(s, { card: c('緑1'), flag: 0 }, () => b)
    expect(t.hands[0]).toEqual([b])
    expect(t.deck[t.deck.length - 1]).toBe(a)
    expect(t.deck.length).toBe(s.deck.length - 1)
  })
  it('契約なしの設定では効果が出ない', () => {
    expect(formationValue(cfg, cs('赤2', '青5', '黄9'), 'plain', RED)).toBe(val(cs('赤2', '青5', '黄9')))
  })
})

describe('社ごとの番号構成（実験中）', () => {
  const LINEUP = [
    [3, 5, 6, 7, 7, 8, 8, 9, 9],
    [1, 1, 2, 3, 5, 6, 6, 7, 8],
    [2, 3, 3, 4, 4, 5, 6, 8, 9],
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
    [2, 4, 5, 5, 6, 7, 8, 8, 9],
    [1, 1, 2, 2, 4, 5, 6, 7, 7],
  ]
  const L = { ...cfg, companyNumbers: LINEUP }
  it('同じ社に同じ番号が2枚あってよく、IDから番号・社が引ける', () => {
    const red7s = allCards(L, [0]).filter((x) => numberOf(L, x) === 7)
    expect(red7s.length).toBe(2)
    expect(red7s.every((x) => companyOf(L, x) === 0)).toBe(true)
    expect(allCards(L, [0, 1, 2, 3, 4, 5]).length).toBe(54)
  })
  it('同じ社の 7・7・8 は純正チーム（連番ではない）', () => {
    const [a, b] = allCards(L, [0]).filter((x) => numberOf(L, x) === 7)
    const e = cardId(L, 0, 8)
    expect(formationOf(L, [a, b, e])).toBe('flush')
  })
  it('同じ社の 7・7 と他社の 7 で同型機', () => {
    const [a, b] = allCards(L, [0]).filter((x) => numberOf(L, x) === 7)
    expect(formationOf(L, [a, b, cardId(L, 1, 7)])).toBe('triple')
  })
  it('持っていない番号のカードは作れない', () => {
    expect(() => cardId(L, 0, 1)).toThrow()
  })
})

describe('デッキ制（試作）', () => {
  const GOE = 0, TRL = 2, GHC = 3, ALB = 4, NMS = 5
  /** 陣営を指定して始め、番号の並びからカードを取り出す */
  const game = (f0: number, f1: number, seed = 1) => newGame(seed, DECK_CONFIG, { factions: [f0, f1] })
  const pick = (s: GameState, p: Player, nums: number[]) => {
    const pool = [...s.decks![p], ...s.hands[p]]
    return nums.map((n) => {
      const i = pool.findIndex((c) => numberOf(s.cfg, c) === n)
      if (i < 0) throw new Error(`no ${n}`)
      return pool.splice(i, 1)[0]
    })
  }

  it('各自の18枚のデッキから6枚配られ、トライレールは8枚', () => {
    const s = game(GOE, TRL)
    expect(s.decks![0].length + s.hands[0].length).toBe(18)
    expect(s.hands[0].length).toBe(6)
    expect(s.hands[1].length).toBe(8)
    expect([...s.decks![1], ...s.hands[1]].every((c) => companyOf(s.cfg, c) === TRL)).toBe(true)
  })
  it('陣営を指定しなければ、両者は別々の社になる', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = newGame(seed, DECK_CONFIG)
      expect(s.contracts[0]).not.toBe(s.contracts[1])
    }
  })
  it('役：同型機 > 連携 > 二機編隊 > 寄せ集め', () => {
    const s = game(ALB, NMS)
    const v = (nums: number[]) => formationValue(s.cfg, pick(s, 0, nums), 'plain', null)
    expect(formationOf(s.cfg, pick(s, 0, [4, 4, 9]))).toBe('pair')
    expect(v([5, 5, 5])).toBeGreaterThan(v([7, 8, 9]))
    expect(v([1, 2, 3])).toBeGreaterThan(v([9, 9, 8]))
    expect(v([4, 4, 1])).toBeGreaterThan(v([9, 7, 5]))
  })
  it('剛炎：合計+1/機。アルビオン：同じ役なら優先', () => {
    const s = game(GOE, ALB)
    const red = pick(s, 0, [2, 5, 9])
    expect(formationValue(s.cfg, red, 'plain', GOE)).toBe(formationValue(s.cfg, red, 'plain', null) + 3)
    // 合計が小さくても、同じ役（連携）ならアルビオンの勝ち
    const white = pick(s, 1, [1, 2, 3])
    const redStraight = pick(s, 0, [7, 8, 9])
    expect(formationValue(s.cfg, white, 'plain', ALB)).toBeGreaterThan(formationValue(s.cfg, redStraight, 'plain', GOE))
  })
  it('ネメシス：同じ役なら合計が小さいほうが強い', () => {
    const s = game(NMS, GHC)
    const light = pick(s, 0, [1, 1, 1])
    const heavy = pick(s, 1, [6, 6, 6])
    expect(formationValue(s.cfg, light, 'plain', NMS)).toBeGreaterThan(formationValue(s.cfg, heavy, 'plain', GHC))
  })
  it('CPU同士で最後まで進み、勝敗がつく', () => {
    for (let seed = 1; seed <= 6; seed++) {
      let s = newGame(seed, DECK_CONFIG)
      const rng = createRng(seed)
      while (s.winner === null) s = deploy(s, chooseMove(s, rng), pickDraw)
      expect(s.winner === 0 || s.winner === 1).toBe(true)
      // 置かれた札は、置いた側の陣営の札だけ
      for (const f of s.flags) for (const p of [0, 1] as Player[]) for (const c of f.sides[p]) expect(companyOf(s.cfg, c)).toBe(s.contracts[p])
    }
  })
})
