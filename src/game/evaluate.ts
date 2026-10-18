// 編成の評価（SPEC 第4節）と、盤外のカードから到達可能な最良の編成値の計算
import type { CardId } from './cards'
import { companyOf, numberOf } from './cards'
import type { CompanyEffect, GameConfig, TerrainId } from './config'

export type Formation = 'mixed' | 'pair' | 'straight' | 'flush' | 'triple' | 'straightFlush'

/** 役の順位（大きいほど強い）。共有山札ルール */
export const FORMATION_RANK: Record<Formation, number> = {
  mixed: 0,
  pair: 0, // 共有山札ルールでは使わない
  straight: 1,
  flush: 2,
  triple: 3,
  straightFlush: 4,
}

/** 役の順位。デッキ制は自社のデッキだけで組むので「同じ社」の役はなく、順位は設定 deckFormationRank（docs/SPEC_DECK.md） */
export const formationRank = (cfg: GameConfig, f: Formation): number =>
  cfg.variant === 'decks' ? (cfg.deckFormationRank[f] ?? 0) : FORMATION_RANK[f]

export const FORMATION_NAME: Record<Formation, string> = {
  straightFlush: '純正コンビネーション',
  triple: '同型機編隊',
  flush: '純正チーム',
  straight: '連携編成',
  pair: '二機編隊',
  mixed: '寄せ集め',
}

// 編成値 = 役の順位 × RANK_WEIGHT + (有利属性を含む ? FAVORED_BONUS : 0) + 番号の合計
// 合計の最大値 < FAVORED_BONUS < RANK_WEIGHT - FAVORED_BONUS になるよう取り、
// 「役 → 地形の有利属性 → 合計」の順の比較を1つの数値で表す。
// 参考実装（sim5.py）と同じ 100 / 50 を基本にする（CPUの評価の尺度を揃えるため）。
// 合計には契約効果の +1/機 が乗りうるので、その分も見込む
export const favoredBonus = (cfg: GameConfig) =>
  Math.max(50, cfg.slotsPerSide * (cfg.maxNumber + 1 + cfg.sumBonusPerUnit) + 1)
export const rankWeight = (cfg: GameConfig) => 2 * favoredBonus(cfg)

export function formationOf(cfg: GameConfig, cards: readonly CardId[], terrain: TerrainId = 'plain'): Formation {
  const n = cards.length
  // terrainEffect = 'wildCompany' のとき、有利属性の機体はどの社としても数える
  const wild = cfg.terrainEffect === 'wildCompany' ? cfg.favoredOf[terrain] : null
  const n0 = numberOf(cfg, cards[0])
  let company = -1
  let sameCompany = true
  let sameNumber = true
  let mask = 0
  let min = Infinity
  let max = -Infinity
  for (const id of cards) {
    const num = numberOf(cfg, id)
    if (cfg.attributeOf[num] !== wild) {
      const c = companyOf(cfg, id)
      if (company < 0) company = c
      else if (c !== company) sameCompany = false
    }
    if (num !== n0) sameNumber = false
    mask |= 1 << num
    if (num < min) min = num
    if (num > max) max = num
  }
  let distinct = 0
  for (let m = mask; m; m &= m - 1) distinct++
  const straight = distinct === n && max - min === n - 1
  if (cfg.variant === 'decks') {
    if (sameNumber) return 'triple'
    if (straight) return 'straight'
    if (distinct < n) return 'pair'
    return 'mixed'
  }
  if (sameCompany && straight) return 'straightFlush'
  if (sameNumber) return 'triple'
  if (sameCompany) return 'flush'
  if (straight) return 'straight'
  return 'mixed'
}

/** 編成の持ち主の契約社（なしは null） */
export type Contract = number | null

/** 編成の持ち主に効く効果。デッキ制では陣営効果、共有山札では契約効果（契約ありの設定のときだけ） */
export function contractEffect(cfg: GameConfig, contract: Contract): CompanyEffect {
  if (contract === null) return 'none'
  if (cfg.variant === 'decks') return cfg.factionEffects[contract]
  return cfg.contracts ? cfg.companyEffects[contract] : 'none'
}

const ownCount = (cfg: GameConfig, cards: readonly CardId[], contract: Contract) =>
  contract === null ? 0 : cards.filter((id) => companyOf(cfg, id) === contract).length

export function favoredCount(
  cfg: GameConfig,
  cards: readonly CardId[],
  terrain: TerrainId,
  contract: Contract = null,
): number {
  const fav = cfg.favoredOf[terrain]
  let n = fav ? cards.filter((id) => cfg.attributeOf[numberOf(cfg, id)] === fav).length : 0
  // 共有山札の契約効果は平原だけ。デッキ制の陣営効果は空域以外（平原・悪路）
  const flyingAnywhere = cfg.variant === 'decks' ? terrain !== 'sky' : terrain === 'plain'
  if (flyingAnywhere && contractEffect(cfg, contract) === 'flyingOnPlain') {
    const flying = cards.filter((id) => companyOf(cfg, id) === contract && cfg.attributeOf[numberOf(cfg, id)] === 'flying').length
    // 空域以外では「同じ役なら優先」まで（1枚分として数え、格上げはしない）
    n += Math.min(flying, 1)
  }
  return n
}

export function hasFavored(cfg: GameConfig, cards: readonly CardId[], terrain: TerrainId): boolean {
  return favoredCount(cfg, cards, terrain) > 0
}

/** 地形の効果で上がる役の段数 */
function terrainRankUp(cfg: GameConfig, favored: number): number {
  if (cfg.terrainEffect === 'rankUp') return favored > 0 ? cfg.terrainRankBonus : 0
  if (cfg.terrainEffect === 'countRankUp') return favored >= 2 ? cfg.terrainRankBonus : 0
  return 0
}

export function sumOf(cfg: GameConfig, cards: readonly CardId[]): number {
  let s = 0
  for (const id of cards) s += numberOf(cfg, id)
  return s
}

/** 完成した編成の値。大きいほど強い。同値は「先に完成させた側」が勝つ（呼び出し側で判定）。 */
export function formationValue(
  cfg: GameConfig,
  cards: readonly CardId[],
  terrain: TerrainId,
  contract: Contract = null,
): number {
  const fav = favoredCount(cfg, cards, terrain, contract)
  // 地形の効果で役が上がる（純正コンビはさらに上の段になる）
  const formation = formationOf(cfg, cards, terrain)
  const effect = contractEffect(cfg, contract)
  const rank =
    formationRank(cfg, formation) +
    terrainRankUp(cfg, fav) +
    (effect === 'straightUp' && formation === 'straight' ? 1 : 0)
  const edge = fav > 0 || (effect === 'eliteTie' && ownCount(cfg, cards, contract) >= 2)
  const bonus = effect === 'sumBonus' ? ownCount(cfg, cards, contract) * cfg.sumBonusPerUnit : 0
  // lowSum：合計を反転（3機なら 30 - 合計）。1・1・1 が 9・9・9 と同じ強さになる
  const sum = effect === 'lowSum' ? cards.length * (cfg.maxNumber + 1) - sumOf(cfg, cards) : sumOf(cfg, cards)
  return rank * rankWeight(cfg) + (edge ? favoredBonus(cfg) : 0) + sum + bonus
}

/**
 * 置いてある partial に pool から残りを足して到達できる最良の編成値。
 * 完成できない（pool の枚数が足りない）なら -1。
 * stopAbove を超える値が見つかった時点で打ち切る（証明判定用）。
 */
export function bestValue(
  cfg: GameConfig,
  partial: readonly CardId[],
  pool: readonly CardId[],
  terrain: TerrainId,
  contract: Contract = null,
  stopAbove = Infinity,
): number {
  const k0 = partial.length
  const need = cfg.slotsPerSide - k0
  if (need <= 0) return formationValue(cfg, partial, terrain, contract)
  if (pool.length < need) return -1
  const buf = partial.slice()
  let best = -1
  const rec = (start: number, k: number): boolean => {
    if (k === need) {
      const v = formationValue(cfg, buf, terrain, contract)
      if (v > best) best = v
      return best > stopAbove
    }
    for (let i = start; i <= pool.length - (need - k); i++) {
      buf[k0 + k] = pool[i]
      if (rec(i + 1, k + 1)) return true
    }
    return false
  }
  rec(0, 0)
  return best
}
