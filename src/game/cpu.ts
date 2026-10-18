// CPU（SPEC 第7節）。参考実装 reference/sim/sim3.py の play() 内の手選びと同じ評価。
import type { CardId } from './cards'
import { numberOf } from './cards'
import type { GameState, Move, Player } from './engine'
import { legalMoves, openFlags, other, potentialPool } from './engine'
import type { Contract } from './evaluate'
import { bestValue, formationValue } from './evaluate'
import type { Rng } from './rng'
import type { TerrainId } from './config'

export function chooseMove(state: GameState, rng: Rng): Move {
  const { cfg } = state
  const p = state.current
  const opp = other(p)
  const moves = legalMoves(state, p)
  if (moves.length === 0) throw new Error('no legal moves')

  // 自分が今後置きうるカード（自分の手札を含む）と、相手が置きうるカード
  const unseen = potentialPool(state, p, p)
  const oppPool = potentialPool(state, p, opp)
  const unseenWithout = (card: CardId) => unseen.filter((c) => c !== card)

  // 同じ手番の中では、地形・置いてある札・使える札が同じなら到達可能な最良値も同じなので使い回す
  const memo = new Map<string, number>()
  const best = (tag: string, side: readonly CardId[], pool: readonly CardId[], terrain: TerrainId, contract: Contract) => {
    const key = `${tag}|${terrain}|${[...side].sort((a, b) => a - b).join(',')}`
    let v = memo.get(key)
    if (v === undefined) {
      v = bestValue(cfg, side, pool, terrain, contract)
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
      o.length === cfg.slotsPerSide
        ? formationValue(cfg, o, f.terrain, state.contracts[opp])
        : best('opp', o, oppPool, f.terrain, state.contracts[opp]),
    )
    before.set(fi, best('before', f.sides[p], unseen, f.terrain, state.contracts[p]))
  }

  let bestScore = -Infinity
  let choice = moves[0]
  for (const m of moves) {
    const f = state.flags[m.flag]
    // 置いた札を除いた盤外の札。札ごとに決まるので、キーに札を含めれば使い回せる
    const after = best(`after${m.card}`, [...f.sides[p], m.card], unseenWithout(m.card), f.terrain, state.contracts[p])
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

/** 契約効果 scout：山札の上の候補から、どこかの戦場の伸びしろが最も大きくなる札を選ぶ */
export function pickDraw(state: GameState, p: Player, options: CardId[]): CardId {
  const { cfg } = state
  const pool = potentialPool(state, p, p)
  let bestGain = -Infinity
  let pick = options[0]
  for (const c of options) {
    for (const fi of openFlags(state, p)) {
      const f = state.flags[fi]
      if (f.sides[p].length >= cfg.slotsPerSide) continue
      const gain =
        bestValue(cfg, [...f.sides[p], c], pool, f.terrain, state.contracts[p]) -
        bestValue(cfg, f.sides[p], pool, f.terrain, state.contracts[p])
      if (gain > bestGain) {
        bestGain = gain
        pick = c
      }
    }
  }
  return pick
}
