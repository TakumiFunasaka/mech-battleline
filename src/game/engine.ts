// ゲームの状態と進行（SPEC 第2〜6節）。状態 + アクション → 新しい状態 の純粋関数。
import type { CardId } from './cards'
import { allCards, companyOf } from './cards'
import type { GameConfig, TerrainId } from './config'
import { DEFAULT_CONFIG } from './config'
import type { Contract } from './evaluate'
import { bestValue, contractEffect, formationValue } from './evaluate'
import { createRng, randInt, shuffle } from './rng'

export type Player = 0 | 1

export interface FlagState {
  terrain: TerrainId
  /** sides[p] = プレイヤー p が置いたカード（置いた順） */
  sides: [CardId[], CardId[]]
  /** 3枚目を置いた手番の通し番号（未完成は null） */
  completedAt: [number | null, number | null]
  owner: Player | null
  /** 確保の理由：両者完成での比較 / 証明による確保 */
  securedBy: 'compare' | 'proof' | null
}

export type WinReason = 'majority' | 'adjacent' | 'count'

export type GameEvent =
  | { type: 'deploy'; player: Player; card: CardId; flag: number; move: number }
  | { type: 'secure'; player: Player; flag: number; by: 'compare' | 'proof'; move: number }
  | { type: 'pass'; player: Player; move: number }
  | { type: 'end'; winner: Player | 'draw'; reason: WinReason; move: number }

export interface GameState {
  cfg: GameConfig
  seed: number
  /** この試合で使う社（社のインデックス、昇順） */
  companies: number[]
  /** 各プレイヤーの契約社（契約なしは null）。デッキ制では各自の陣営（使うデッキの社） */
  contracts: [Contract, Contract]
  /** 共有山札（デッキ制では空） */
  deck: CardId[]
  /** デッキ制：各自の山札（共有山札ルールでは null） */
  decks: [CardId[], CardId[]] | null
  hands: [CardId[], CardId[]]
  flags: FlagState[]
  current: Player
  /** 配備の通し番号（0始まり、配備するたびに+1） */
  moveCount: number
  winner: Player | 'draw' | null
  winReason: WinReason | null
  events: GameEvent[]
}

export interface Move {
  card: CardId
  flag: number
}

export const other = (p: Player): Player => (p === 0 ? 1 : 0)

export interface NewGameOptions {
  /** デッキ制：各プレイヤーの陣営（社のインデックス）。null ならランダム（相手と別の社） */
  factions?: [number | null, number | null]
}

export function newGame(seed: number, cfg: GameConfig = DEFAULT_CONFIG, opts: NewGameOptions = {}): GameState {
  const rng = createRng(seed)

  // 1. 特殊地形
  const terrains: TerrainId[] = Array(cfg.flagCount).fill('plain')
  const count = cfg.specialTerrainCounts[randInt(rng, cfg.specialTerrainCounts.length)]
  const positions = shuffle(
    rng,
    Array.from({ length: cfg.flagCount }, (_, i) => i),
  ).slice(0, count)
  for (const pos of positions) {
    terrains[pos] = cfg.specialTerrains[randInt(rng, cfg.specialTerrains.length)]
  }

  if (cfg.variant === 'decks') return newDeckGame(seed, cfg, rng, terrains, opts)

  // 2. 使う社を選んで配札
  const pool = Array.from({ length: cfg.companyPool }, (_, i) => i)
  const companies =
    cfg.companyPool > cfg.companies ? shuffle(rng, pool).slice(0, cfg.companies).sort((a, b) => a - b) : pool
  const deck = shuffle(rng, allCards(cfg, companies))
  const hands: [CardId[], CardId[]] = [deck.splice(0, cfg.handSize), deck.splice(0, cfg.handSize)]

  // 3. 先手
  const current = randInt(rng, 2) as Player

  // 4. 契約（実験中）：効果のある社から、両者に別々の社をランダムに割り当てる
  let contracts: [Contract, Contract] = [null, null]
  if (cfg.contracts) {
    const candidates = shuffle(
      rng,
      companies.filter((c) => cfg.companyEffects[c] !== 'none'),
    )
    contracts = [candidates[0] ?? null, candidates[1] ?? null]
  }

  return {
    cfg,
    seed,
    companies,
    contracts,
    deck,
    decks: null,
    hands,
    flags: terrains.map((terrain) => ({
      terrain,
      sides: [[], []],
      completedAt: [null, null],
      owner: null,
      securedBy: null,
    })),
    current,
    moveCount: 0,
    winner: null,
    winReason: null,
    events: [],
  }
}

/** デッキ制の準備：陣営を決め、各自のデッキを作って配る */
function newDeckGame(
  seed: number,
  baseCfg: GameConfig,
  rng: () => number,
  terrains: TerrainId[],
  opts: NewGameOptions,
): GameState {
  const all = baseCfg.factionDecks.map((_, i) => i)
  const want = opts.factions ?? [null, null]
  const f0 = want[0] ?? shuffle(rng, all.filter((c) => c !== want[1]))[0]
  const f1 = want[1] ?? shuffle(rng, all.filter((c) => c !== f0))[0]
  const factions: [number, number] = [f0, f1]

  // その試合のカード表：プレイヤー0のデッキ、続けてプレイヤー1のデッキ
  const cardTable = factions.flatMap((f) => baseCfg.factionDecks[f].map((number) => ({ company: f, number })))
  const cfg: GameConfig = { ...baseCfg, cardTable }
  const size0 = baseCfg.factionDecks[f0].length
  const decks: [CardId[], CardId[]] = [
    shuffle(rng, Array.from({ length: size0 }, (_, i) => i)),
    shuffle(rng, Array.from({ length: cardTable.length - size0 }, (_, i) => size0 + i)),
  ]
  const handSize = (p: Player) => (cfg.factionEffects[factions[p]] === 'handSeven' ? cfg.handSize + cfg.factionHandBonus : cfg.handSize)
  const hands: [CardId[], CardId[]] = [decks[0].splice(0, handSize(0)), decks[1].splice(0, handSize(1))]
  const current = randInt(rng, 2) as Player

  return {
    cfg,
    seed,
    companies: [...new Set(factions)],
    contracts: factions,
    deck: [],
    decks,
    hands,
    flags: terrains.map((terrain) => ({
      terrain,
      sides: [[], []],
      completedAt: [null, null],
      owner: null,
      securedBy: null,
    })),
    current,
    moveCount: 0,
    winner: null,
    winReason: null,
    events: [],
  }
}

/** プレイヤー p が補充する山札 */
export function drawPile(state: GameState, p: Player): CardId[] {
  return state.decks ? state.decks[p] : state.deck
}

/**
 * 見る側 viewer から見て、target が今後その戦場に置きうるカード。
 * 共有山札：盤面に出ていない札（viewer 自身が target でなければ viewer の手札は除く）。
 * デッキ制：target のデッキと手札（デッキの中身は公開なので、順番以外は分かる）。
 */
export function potentialPool(state: GameState, viewer: Player, target: Player): CardId[] {
  if (state.decks) return [...state.decks[target], ...state.hands[target]]
  const unseen = unseenCards(state)
  if (viewer === target) return unseen
  const mine = new Set(state.hands[viewer])
  return unseen.filter((c) => !mine.has(c))
}

/** 盤面に出ていない全カード（山札 + 両者の手札） */
export function unseenCards(state: GameState): CardId[] {
  return [...state.deck, ...(state.decks ? [...state.decks[0], ...state.decks[1]] : []), ...state.hands[0], ...state.hands[1]]
}

/** プレイヤー p が置ける戦場 */
export function openFlags(state: GameState, p: Player): number[] {
  const out: number[] = []
  state.flags.forEach((f, i) => {
    if (f.owner === null && f.sides[p].length < state.cfg.slotsPerSide) out.push(i)
  })
  return out
}

export function legalMoves(state: GameState, p: Player = state.current): Move[] {
  if (state.winner !== null) return []
  const flags = openFlags(state, p)
  return state.hands[p].flatMap((card) => flags.map((flag) => ({ card, flag })))
}

function cloneState(s: GameState): GameState {
  return {
    ...s,
    deck: s.deck.slice(),
    decks: s.decks ? [s.decks[0].slice(), s.decks[1].slice()] : null,
    hands: [s.hands[0].slice(), s.hands[1].slice()],
    flags: s.flags.map((f) => ({
      ...f,
      sides: [f.sides[0].slice(), f.sides[1].slice()],
      completedAt: [f.completedAt[0], f.completedAt[1]],
    })),
    events: s.events.slice(),
  }
}

/** 第5節：全戦場の決着処理（state を直接変更する） */
export function resolveFlags(state: GameState): void {
  const { cfg } = state
  const full = cfg.slotsPerSide
  let unseen: CardId[] | null = null
  state.flags.forEach((f, i) => {
    if (f.owner !== null) return
    const [a, b] = f.sides
    if (a.length === full && b.length === full) {
      const va = formationValue(cfg, a, f.terrain, state.contracts[0])
      const vb = formationValue(cfg, b, f.terrain, state.contracts[1])
      let w: Player
      if (va !== vb) w = va > vb ? 0 : 1
      else {
        // 同値：先に完成させた側の勝ち。ただし陣営効果 tieWin を持つ側が片方だけなら、その側の勝ち
        const tie0 = contractEffect(cfg, state.contracts[0]) === 'tieWin'
        const tie1 = contractEffect(cfg, state.contracts[1]) === 'tieWin'
        if (tie0 !== tie1) w = tie0 ? 0 : 1
        else w = (f.completedAt[0] as number) < (f.completedAt[1] as number) ? 0 : 1
      }
      f.owner = w
      f.securedBy = 'compare'
    } else if (cfg.proofSecuring) {
      for (const s of [0, 1] as Player[]) {
        const mine = f.sides[s]
        const theirs = f.sides[other(s)]
        if (mine.length !== full || theirs.length >= full) continue
        unseen ??= unseenCards(state)
        const v = formationValue(cfg, mine, f.terrain, state.contracts[s])
        // 相手の最良が v 以下なら（同値は先に完成した側の勝ち）確保
        if (bestValue(cfg, theirs, unseen, f.terrain, state.contracts[other(s)], v) <= v) {
          f.owner = s
          f.securedBy = 'proof'
        }
        break
      }
    }
    if (f.owner !== null) {
      state.events.push({ type: 'secure', player: f.owner, flag: i, by: f.securedBy!, move: state.moveCount })
    }
  })
}

/** 第6節：勝利条件を満たしたプレイヤー。両者同時なら手番側を優先（SPEC 未決事項） */
export function checkWinner(state: GameState, mover: Player): { winner: Player; reason: WinReason } | null {
  for (const p of [mover, other(mover)]) {
    const owned = state.flags.filter((f) => f.owner === p).length
    if (owned >= state.cfg.winMajority) return { winner: p, reason: 'majority' }
    let run = 0
    for (const f of state.flags) {
      run = f.owner === p ? run + 1 : 0
      if (run >= state.cfg.winAdjacent) return { winner: p, reason: 'adjacent' }
    }
  }
  return null
}

function endByCount(state: GameState): void {
  const c0 = state.flags.filter((f) => f.owner === 0).length
  const c1 = state.flags.filter((f) => f.owner === 1).length
  state.winner = c0 > c1 ? 0 : c1 > c0 ? 1 : 'draw'
  state.winReason = 'count'
  state.events.push({ type: 'end', winner: state.winner, reason: 'count', move: state.moveCount })
}

/** 手番プレイヤーが配備する。決着・勝利判定・補充・手番交代（置けない側の自動パス）まで進める。 */
/** scout の効果で山札の上2枚から1枚を選ぶ関数。省略時は上の1枚を取る */
export type PickDraw = (state: GameState, player: Player, options: CardId[]) => CardId

export function deploy(prev: GameState, move: Move, pickDraw?: PickDraw): GameState {
  if (prev.winner !== null) throw new Error('game is over')
  const p = prev.current
  const handIdx = prev.hands[p].indexOf(move.card)
  if (handIdx < 0) throw new Error('card not in hand')
  if (!openFlags(prev, p).includes(move.flag)) throw new Error('flag not open')

  const state = cloneState(prev)
  const flag = state.flags[move.flag]

  // 1. 配備
  state.hands[p].splice(handIdx, 1)
  flag.sides[p].push(move.card)
  if (flag.sides[p].length === state.cfg.slotsPerSide) flag.completedAt[p] = state.moveCount
  state.events.push({ type: 'deploy', player: p, card: move.card, flag: move.flag, move: state.moveCount })

  // 2. 決着処理
  resolveFlags(state)

  // 3. 勝利判定
  const win = checkWinner(state, p)
  if (win) {
    state.winner = win.winner
    state.winReason = win.reason
    state.events.push({ type: 'end', winner: win.winner, reason: win.reason, move: state.moveCount })
    state.moveCount++
    return state
  }

  // 4. 補充（自分の契約社の機体を置いたときは契約効果が効く）
  const contract = state.contracts[p]
  const placedOwn = contract !== null && companyOf(state.cfg, move.card) === contract
  const effect = placedOwn ? contractEffect(state.cfg, contract) : 'none'
  const hand = state.hands[p]
  const pile = drawPile(state, p)
  if (effect === 'drawTwo') {
    for (let k = 0; k < 2 && hand.length < state.cfg.contractHandLimit && pile.length > 0; k++) {
      hand.push(pile.shift()!)
    }
  } else if (effect === 'scout' && pile.length >= 2) {
    const options = pile.splice(0, 2)
    const picked = pickDraw ? pickDraw(state, p, options) : options[0]
    hand.push(picked)
    pile.push(...options.filter((c) => c !== picked))
  } else {
    const drawn = pile.shift()
    if (drawn !== undefined) hand.push(drawn)
  }
  state.moveCount++

  // 手番交代。置けない側はパス（補充なし）。両者置けなければ確保数で終了。
  const next = other(p)
  if (legalMoves(state, next).length > 0) {
    state.current = next
  } else {
    state.events.push({ type: 'pass', player: next, move: state.moveCount })
    if (legalMoves(state, p).length > 0) state.current = p
    else endByCount(state)
  }
  return state
}
