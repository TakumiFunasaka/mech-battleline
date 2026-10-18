import { describe, expect, it } from 'vitest'
import type { CardId } from './cards'
import { allCards, cardId, companyOf } from './cards'
import { DEFAULT_CONFIG } from './config'
import type { TerrainId } from './config'
import { chooseMove } from './cpu'
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
