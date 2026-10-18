// CPU（SPEC 第7節）。参考実装 reference/sim/sim3.py の play() 内の手選びと同じ評価。
import type { CardId } from './cards'
import { numberOf } from './cards'
import type { GameState, Move } from './engine'
import { legalMoves, other, unseenCards } from './engine'
import { bestValue, formationValue } from './evaluate'
import type { Rng } from './rng'
import type { TerrainId } from './config'

export function chooseMove(state: GameState, rng: Rng): Move {
  const { cfg } = state
  const p = state.current
  const opp = other(p)
  const moves = legalMoves(state, p)
  if (moves.length === 0) throw new Error('no legal moves')

  const hand = state.hands[p]
  // CPU から見て盤面に出ていないカード（自分の手札を含む）
  const unseen = unseenCards(state)
  // 相手が使いうるカード（自分の手札を除く）
  const handSet = new Set(hand)
  const oppPool = unseen.filter((c) => !handSet.has(c))
  const unseenWithout = (card: CardId) => unseen.filter((c) => c !== card)

  // 同じ手番の中では、地形・置いてある札・使える札が同じなら到達可能な最良値も同じなので使い回す
  const memo = new Map<string, number>()
  const best = (tag: string, side: readonly CardId[], pool: readonly CardId[], terrain: TerrainId) => {
    const key = `${tag}|${terrain}|${[...side].sort((a, b) => a - b).join(',')}`
    let v = memo.get(key)
    if (v === undefined) {
      v = bestValue(cfg, side, pool, terrain)
      memo.set(key, v)
    }
    return v
  }

  const oppVal = new Map<number, number>()
  const before = new Map<number, number>()
  for (const fi of new Set(moves.map((m) => m.flag))) {
    const f = state.flags[fi]
    const o = f.sides[opp]
    oppVal.set(
      fi,
      o.length === cfg.slotsPerSide ? formationValue(cfg, o, f.terrain) : best('opp', o, oppPool, f.terrain),
    )
    before.set(fi, best('before', f.sides[p], unseen, f.terrain))
  }

  let bestScore = -Infinity
  let choice = moves[0]
  for (const m of moves) {
    const f = state.flags[m.flag]
    // 置いた札を除いた盤外の札。札ごとに決まるので、キーに札を含めれば使い回せる
    const after = best(`after${m.card}`, [...f.sides[p], m.card], unseenWithout(m.card), f.terrain)
    const ov = oppVal.get(m.flag)!
    let score: number
    if (after < 0) score = -2000
    else if (f.sides[opp].length === cfg.slotsPerSide && after <= ov) score = -1000 - numberOf(cfg, m.card)
    else score = after - ov + 0.6 * (after - before.get(m.flag)!)
    score += rng() * 0.01
    if (score > bestScore) {
      bestScore = score
      choice = m
    }
  }
  return choice
}
