import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CardId } from '../game/cards'
import type { GameConfig } from '../game/config'
import { DECK_CONFIG, DEFAULT_CONFIG } from '../game/config'
import { chooseMove, pickDraw } from '../game/cpu'
import type { FlagState, GameEvent, GameState, Move, Player } from '../game/engine'
import { deploy, drawPile, legalMoves, newGame, openFlags, other } from '../game/engine'
import { FORMATION_NAME, favoredCount, formationOf, formationRank, formationValue, rankWeight, sumOf } from '../game/evaluate'
import { createRng } from '../game/rng'
import { ATTRIBUTE_NAME, ATTRIBUTE_SHORT, COMPANY_SHORT, FACTIONS, TERRAIN_NAME, cardInfo, cardShort } from './labels'

type Mode = 'cpu' | 'local'

/** 勝利条件の説明。隣接条件が過半数以上なら過半数に含まれるので書かない */
function winText(cfg: GameConfig): string {
  const adj = cfg.winAdjacent < cfg.winMajority ? `、または隣り合う${cfg.winAdjacent}か所` : ''
  return `${cfg.winMajority}か所${adj}を確保した側の勝ち。`
}

const CPU_PLAYER: Player = 1
const CPU_DELAY_MS = 700

// 再現・確認用：?mode=cpu&seed=123&moves=10 で、そのシードのゲームを開始し、最初の moves 手をCPU同士で進める
// デッキ制では ?mode=pick で陣営選択の画面から始める
const params = new URLSearchParams(window.location.search)
const URL_MODE = params.get('mode') as Mode | null
const URL_SEED = params.has('seed') ? Number(params.get('seed')) : null
const URL_MOVES = Number(params.get('moves') ?? 0)

// デッキ制（試作）：/deck/ で開くか ?variant=deck を付けたとき（docs/SPEC_DECK.md）
const IS_DECK = /\/deck\/?$/.test(window.location.pathname) || params.get('variant') === 'deck'
const BASE_CFG: GameConfig = IS_DECK ? DECK_CONFIG : DEFAULT_CONFIG

type Factions = [number | null, number | null]

/** 1手進める。グリーンホロウの索敵（2枚から1枚選ぶ）は、人間の手番でもCPUと同じ考え方で自動で選ぶ */
const step = (g: GameState, move: Move) => deploy(g, move, pickDraw)

function initialGame(seed: number, factions: Factions): GameState {
  let g = newGame(seed, BASE_CFG, { factions })
  if (seed === URL_SEED) {
    const rng = createRng(seed)
    for (let i = 0; i < URL_MOVES && g.winner === null; i++) g = step(g, chooseMove(g, rng))
  }
  return g
}

interface Session {
  mode: Mode
  seed: number
  key: number
  factions: Factions
}

export function App() {
  const [session, setSession] = useState<Session | null>(() =>
    URL_MODE === 'cpu' || URL_MODE === 'local'
      ? { mode: URL_MODE, seed: URL_SEED ?? Math.floor(Math.random() * 2 ** 31), key: 0, factions: [null, null] }
      : null,
  )
  // デッキ制：陣営を選んでいる途中（どのモードで、何人目まで選んだか）
  const [picking, setPicking] = useState<{ mode: Mode; chosen: number[] } | null>(() =>
    IS_DECK && params.get('mode') === 'pick' ? { mode: 'cpu', chosen: [] } : null,
  )
  const [showRules, setShowRules] = useState(false)

  const launch = (mode: Mode, factions: Factions) =>
    setSession({ mode, seed: Math.floor(Math.random() * 2 ** 31), key: Date.now(), factions })

  const start = (mode: Mode) => {
    if (IS_DECK) setPicking({ mode, chosen: [] })
    else launch(mode, [null, null])
  }

  const onPick = (faction: number) => {
    if (!picking) return
    const chosen = [...picking.chosen, faction]
    // CPU戦は自分だけ選ぶ（CPUは別の社からランダム）。2人対戦は2人とも選ぶ
    if (picking.mode === 'cpu') {
      setPicking(null)
      launch('cpu', [faction, null])
    } else if (chosen.length === 2) {
      setPicking(null)
      launch('local', [chosen[0], chosen[1]])
    } else setPicking({ ...picking, chosen })
  }

  return (
    <div className="app">
      {session ? (
        <Game
          key={session.key}
          mode={session.mode}
          seed={session.seed}
          factions={session.factions}
          onRestart={() => launch(session.mode, session.factions)}
          onExit={() => setSession(null)}
          onRules={() => setShowRules(true)}
        />
      ) : picking ? (
        <FactionSelect
          title={picking.mode === 'cpu' ? 'あなたの陣営を選ぶ' : `プレイヤー${picking.chosen.length + 1}の陣営を選ぶ`}
          onPick={onPick}
          onBack={() => setPicking(null)}
        />
      ) : (
        <Menu onStart={start} onRules={() => setShowRules(true)} />
      )}
      {showRules && <Rules onClose={() => setShowRules(false)} />}
    </div>
  )
}

function Menu({ onStart, onRules }: { onStart: (m: Mode) => void; onRules: () => void }) {
  return (
    <div className="menu">
      <div className="menu-title">
        <small>{IS_DECK ? 'MECH · デッキ制（試作）' : 'MECH'}</small>
        <h1>メカ・バトルライン</h1>
        <p>
          {IS_DECK && '6社から1社を選び、その社のデッキで戦う。'}
          {BASE_CFG.flagCount}つの戦場に3機ずつ。{winText(BASE_CFG)}
        </p>
      </div>
      <button className="btn primary" onClick={() => onStart('cpu')}>
        CPUと対戦
      </button>
      <button className="btn" onClick={() => onStart('local')}>
        2人で対戦（同じ端末）
      </button>
      <button className="btn ghost" onClick={onRules}>
        ルール
      </button>
      <p className="menu-note">
        {IS_DECK ? (
          <>
            デッキ制 たたき台 v0.1 ・ <a href="../">共有山札版へ</a>
          </>
        ) : (
          <>
            Web仮組み版 v0.1 ・ <a href="deck/">デッキ制（試作）へ</a>
          </>
        )}
      </p>
    </div>
  )
}

function FactionSelect(props: { title: string; onPick: (f: number) => void; onBack: () => void }) {
  return (
    <div className="factions">
      <header className="hud">
        <button className="icon-btn" onClick={props.onBack} aria-label="戻る">
          ‹
        </button>
        <h2>{props.title}</h2>
        <span />
      </header>
      {FACTIONS.map((f) => (
        <button key={f.index} className="faction" onClick={() => props.onPick(f.index)}>
          <span className={`chip c-${f.color}`}>{f.colorName}</span>
          <span className="faction-body">
            <b>{f.name}</b>
            <span className="faction-effect">{f.effectText}</span>
            <span className="faction-deck">デッキ：{f.deckText}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

function Game(props: {
  mode: Mode
  seed: number
  factions: Factions
  onRestart: () => void
  onExit: () => void
  onRules: () => void
}) {
  const { mode, seed } = props
  const [game, setGame] = useState<GameState>(() => initialGame(seed, props.factions))
  const [selected, setSelected] = useState<CardId | null>(null)
  const [inspect, setInspect] = useState<number | null>(null)
  const [showLog, setShowLog] = useState(false)
  // 2人対戦：手札を隠す画面を出す相手（null なら非表示）
  const [cover, setCover] = useState<Player | null>(() => (mode === 'local' ? game.current : null))
  const cpuRng = useRef(createRng(seed ^ 0x5bd1e995))
  const cfg = game.cfg

  const names: [string, string] = mode === 'cpu' ? ['あなた', 'CPU'] : ['プレイヤー1', 'プレイヤー2']
  const viewer: Player = mode === 'cpu' ? 0 : game.current
  const opp = other(viewer)
  const cpuThinking = mode === 'cpu' && game.current === CPU_PLAYER && game.winner === null
  const myTurn = game.winner === null && !cpuThinking && cover === null

  // CPU の手番
  useEffect(() => {
    if (!cpuThinking) return
    const t = setTimeout(() => {
      setGame(step(game, chooseMove(game, cpuRng.current)))
    }, CPU_DELAY_MS)
    return () => clearTimeout(t)
  }, [game, cpuThinking])

  const legalFlags = useMemo(
    () => (myTurn ? new Set(openFlags(game, game.current)) : new Set<number>()),
    [game, myTurn],
  )

  const onCard = (id: CardId) => {
    if (!myTurn) return
    setInspect(null)
    setSelected(selected === id ? null : id)
  }

  const onFlag = (fi: number) => {
    if (selected !== null && legalFlags.has(fi)) {
      const next = step(game, { card: selected, flag: fi })
      setGame(next)
      setSelected(null)
      setInspect(null)
      if (mode === 'local' && next.winner === null && next.current !== game.current) setCover(next.current)
      return
    }
    setSelected(null)
    setInspect(inspect === fi ? null : fi)
  }

  // 直近の配備以降の出来事
  const recent = useMemo(() => {
    let i = game.events.length - 1
    while (i >= 0 && game.events[i].type !== 'deploy') i--
    return i < 0 ? [] : game.events.slice(i)
  }, [game.events])

  const eventText = (e: GameEvent): string => {
    switch (e.type) {
      case 'deploy':
        return `${names[e.player]}：${cardShort(cfg, e.card)} を戦場${e.flag + 1}に配備`
      case 'secure':
        return `${names[e.player]}が戦場${e.flag + 1}を確保${e.by === 'proof' ? '（証明）' : ''}`
      case 'pass':
        return `${names[e.player]}は置ける場所がないのでパス`
      case 'end':
        return e.winner === 'draw' ? '引き分け' : `${names[e.winner]}の勝利`
    }
  }

  const lastDeployed = recent[0]?.type === 'deploy' ? recent[0].card : null
  const owned = (p: Player) => game.flags.filter((f) => f.owner === p).length
  const hand = game.hands[viewer]

  // 勝利を決めた戦場（隣接勝利ならその連続部分、それ以外は勝者の確保した戦場）
  const winningFlags = useMemo(() => {
    const w = game.winner
    if (w === null || w === 'draw') return new Set<number>()
    if (game.winReason === 'adjacent') {
      let run = 0
      for (let i = 0; i < game.flags.length; i++) {
        run = game.flags[i].owner === w ? run + 1 : 0
        if (run >= game.cfg.winAdjacent) {
          return new Set(Array.from({ length: run }, (_, k) => i - k))
        }
      }
    }
    return new Set(game.flags.flatMap((f, i) => (f.owner === w ? [i] : [])))
  }, [game])

  let resultTitle = ''
  let resultTone = ''
  if (game.winner === 'draw') resultTitle = '引き分け'
  else if (game.winner !== null && mode === 'cpu') {
    resultTitle = game.winner === 0 ? '勝利！' : '敗北…'
    resultTone = game.winner === 0 ? 'win' : 'lose'
  } else if (game.winner !== null) resultTitle = `${names[game.winner]}の勝利`

  const companiesText = game.companies.map((c) => COMPANY_SHORT[c]).join('・')

  let turnLabel: string
  if (game.winner !== null) turnLabel = '終了'
  else if (cpuThinking) turnLabel = 'CPU 思考中…'
  else if (mode === 'cpu') turnLabel = 'あなたの番'
  else turnLabel = `${names[game.current]}の番`

  return (
    <div className="game">
      <header className="hud">
        <button className="icon-btn" onClick={props.onExit} aria-label="メニューへ">
          ‹
        </button>
        <div className="hud-score">
          <span className="me">{names[viewer]} {owned(viewer)}</span>
          <span className="sep">–</span>
          <span className="op">{owned(opp)} {names[opp]}</span>
        </div>
        <button className="icon-btn" onClick={props.onRules} aria-label="ルール">
          ?
        </button>
      </header>

      <div className="subhud">
        <span>山札 {drawPile(game, viewer).length}</span>
        <span className={`turn ${myTurn ? 'active' : ''}`}>{turnLabel}</span>
        <span>
          {names[opp]}の手札 {game.hands[opp].length}
          {game.decks && `・山札 ${drawPile(game, opp).length}`}
        </span>
      </div>
      {game.decks && (
        <div className="faction-bar">
          <span className="me">
            {names[viewer]}：{FACTIONS[game.contracts[viewer]!].shortName}（{FACTIONS[game.contracts[viewer]!].effectShort}）
          </span>
          <span className="op">
            {names[opp]}：{FACTIONS[game.contracts[opp]!].shortName}（{FACTIONS[game.contracts[opp]!].effectShort}）
          </span>
        </div>
      )}

      <div className="board" style={{ '--flags': game.flags.length } as CSSProperties}>
        {game.flags.map((f, i) => (
          <FlagColumn
            key={i}
            index={i}
            flag={f}
            game={game}
            viewer={viewer}
            legal={selected !== null && legalFlags.has(i)}
            inspected={inspect === i}
            lastDeployed={lastDeployed}
            winning={winningFlags.has(i)}
            onClick={() => onFlag(i)}
          />
        ))}
      </div>

      <div className="info">
        {selected !== null ? (
          <CardDetail game={game} id={selected} />
        ) : inspect !== null ? (
          <FlagDetail game={game} index={inspect} viewer={viewer} names={names} />
        ) : recent.length > 0 ? (
          <ul className="events">
            {recent.map((e, i) => (
              <li key={i} className={`ev-${e.type}`}>
                {eventText(e)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">
            {mode === 'cpu' && game.current === CPU_PLAYER ? 'CPUの先手です' : '手札を選んで、置く戦場をタップ'}
            {!game.decks && (
              <>
                <br />
                今回の{game.companies.length}社：{companiesText}
              </>
            )}
          </p>
        )}
        <button className="log-btn" onClick={() => setShowLog(true)}>
          履歴
        </button>
      </div>

      {game.winner !== null ? (
        // 決着後は手札の位置に結果を出し、盤面は見えたままにする（戦場をタップで内訳を確認できる）
        <div className="result">
          <div className="result-head">
            <h2 className={resultTone}>{resultTitle}</h2>
            <p>
              {game.winReason === 'majority' && `${game.cfg.winMajority}つの戦場を確保`}
              {game.winReason === 'adjacent' && `隣り合う${game.cfg.winAdjacent}つの戦場を確保`}
              {game.winReason === 'count' && '置ける場所がなくなり、確保数で決着'}
              （{game.moveCount}手）
            </p>
          </div>
          <div className="result-actions">
            <button className="btn primary" onClick={props.onRestart}>
              もう一度
            </button>
            <button className="btn" onClick={props.onExit}>
              メニュー
            </button>
          </div>
          <p className="seed">戦場をタップで内訳を確認できます　seed {seed}</p>
        </div>
      ) : (
        <div className={`hand ${myTurn ? '' : 'disabled'}`}>
          {cover === null &&
            hand.map((id) => (
              <HandCard key={id} game={game} id={id} selected={selected === id} onClick={() => onCard(id)} />
            ))}
        </div>
      )}
      {myTurn && legalMoves(game).length > 0 && selected === null && (
        <p className="hand-hint">手札をタップで選択 → 光った戦場をタップで配備</p>
      )}

      {cover !== null && game.winner === null && (
        <div className="overlay" onClick={() => setCover(null)}>
          <div className="panel">
            <h2>{names[cover]}の番です</h2>
            {recent.length > 0 && (
              <ul className="events">
                {recent.map((e, i) => (
                  <li key={i}>{eventText(e)}</li>
                ))}
              </ul>
            )}
            <p>端末を{names[cover]}に渡して、タップで手札を表示</p>
          </div>
        </div>
      )}

      {showLog && (
        <div className="overlay" onClick={() => setShowLog(false)}>
          <div className="panel log" onClick={(e) => e.stopPropagation()}>
            <h2>履歴</h2>
            {!game.decks && <p className="seed">今回の{game.companies.length}社：{companiesText}</p>}
            <ol>
              {game.events.map((e, i) => (
                <li key={i} className={`ev-${e.type}`}>
                  {eventText(e)}
                </li>
              ))}
            </ol>
            <p className="seed">seed {seed}</p>
            <button className="btn" onClick={() => setShowLog(false)}>
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function FlagColumn(props: {
  index: number
  flag: FlagState
  game: GameState
  viewer: Player
  legal: boolean
  inspected: boolean
  lastDeployed: CardId | null
  winning: boolean
  onClick: () => void
}) {
  const { flag, game, viewer, index } = props
  const opp = other(viewer)
  const slots = game.cfg.slotsPerSide
  const ownerCls = flag.owner === null ? '' : flag.owner === viewer ? 'own-me' : 'own-op'
  const renderSide = (p: Player) =>
    Array.from({ length: slots }, (_, k) => {
      const id = flag.sides[p][k]
      return id === undefined ? (
        <div key={k} className="slot" />
      ) : (
        <MiniCard key={k} game={game} id={id} last={id === props.lastDeployed} />
      )
    })
  return (
    <button
      className={`flag t-${flag.terrain} ${ownerCls} ${props.legal ? 'legal' : ''} ${props.inspected ? 'inspected' : ''} ${props.winning ? 'winning' : ''}`}
      onClick={props.onClick}
    >
      <div className="side top">{renderSide(opp)}</div>
      <div className="marker">
        <span className="flag-no">{index + 1}</span>
        <span className="terrain">{TERRAIN_NAME[flag.terrain]}</span>
        {flag.owner !== null && (
          <span className="owner">{flag.owner === viewer ? '確保' : '喪失'}</span>
        )}
      </div>
      <div className="side bottom">{renderSide(viewer)}</div>
    </button>
  )
}

function MiniCard({ game, id, last }: { game: GameState; id: CardId; last: boolean }) {
  const info = cardInfo(game.cfg, id)
  return (
    <div className={`mini c-${info.color} ${last ? 'last' : ''}`}>
      <b>{info.number}</b>
      {ATTRIBUTE_SHORT[info.attribute] && <i>{ATTRIBUTE_SHORT[info.attribute]}</i>}
    </div>
  )
}

function HandCard(props: { game: GameState; id: CardId; selected: boolean; onClick: () => void }) {
  const info = cardInfo(props.game.cfg, props.id)
  return (
    <button className={`card c-${info.color} ${props.selected ? 'selected' : ''}`} onClick={props.onClick}>
      <span className="num">{info.number}</span>
      {info.attribute !== 'ground' && <span className="attr">{ATTRIBUTE_NAME[info.attribute]}</span>}
      <span className="co">{info.companyId}</span>
    </button>
  )
}

function CardDetail({ game, id }: { game: GameState; id: CardId }) {
  const info = cardInfo(game.cfg, id)
  return (
    <div className="detail">
      <div className="detail-title">
        <span className={`chip c-${info.color}`}>{cardShort(game.cfg, id)}</span>
        {info.name}
        <small>{info.model}</small>
      </div>
      <div className="detail-sub">
        {info.companyName}／{info.type}・{ATTRIBUTE_NAME[info.attribute]}
      </div>
    </div>
  )
}

function FlagDetail(props: { game: GameState; index: number; viewer: Player; names: [string, string] }) {
  const { game, index, viewer, names } = props
  const f = game.flags[index]
  const fav = game.cfg.favoredOf[f.terrain]
  const sideText = (p: Player) => {
    const cards = f.sides[p]
    if (cards.length === 0) return 'なし'
    const list = cards.map((c) => cardShort(game.cfg, c)).join('・')
    if (cards.length < game.cfg.slotsPerSide) return list
    const owner = game.contracts[p]
    const fc = favoredCount(game.cfg, cards, f.terrain, owner)
    const upgraded =
      formationValue(game.cfg, cards, f.terrain, owner) >=
      rankWeight(game.cfg) * (formationRank(game.cfg, formationOf(game.cfg, cards, f.terrain)) + 1)
    const favMark = fc > 0 ? `・有利機${fc}枚${upgraded ? '（格上げ）' : ''}` : ''
    return `${list}（${FORMATION_NAME[formationOf(game.cfg, cards, f.terrain)]}・合計${sumOf(game.cfg, cards)}${favMark}）`
  }
  return (
    <div className="detail">
      <div className="detail-title">
        戦場{index + 1}：{TERRAIN_NAME[f.terrain]}
        {fav && <small>同じ役なら{ATTRIBUTE_NAME[fav]}を含む側が勝つ</small>}
      </div>
      <div className="detail-sub">
        {names[viewer]}：{sideText(viewer)}
        <br />
        {names[other(viewer)]}：{sideText(other(viewer))}
        {f.owner !== null && (
          <>
            <br />→ {names[f.owner]}が確保{f.securedBy === 'proof' ? '（証明：相手がもう上回れない）' : ''}
          </>
        )}
      </div>
    </div>
  )
}

function Rules({ onClose }: { onClose: () => void }) {
  if (IS_DECK) return <DeckRules onClose={onClose} />
  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel rules" onClick={(e) => e.stopPropagation()}>
        <h2>ルール</h2>
        <p>
          {DEFAULT_CONFIG.companyPool}社のうち毎試合{DEFAULT_CONFIG.companies}社を使い、{DEFAULT_CONFIG.companies}社×機種1〜{DEFAULT_CONFIG.maxNumber}の{DEFAULT_CONFIG.companies * DEFAULT_CONFIG.maxNumber}枚で遊びます。手札{DEFAULT_CONFIG.handSize}枚から毎手番1枚を、まだ決着していない戦場の自分側に置き（各戦場3枚まで）、山札から1枚引きます。置ける場所がある限りパスはできません。
        </p>
        <h3>勝利条件</h3>
        <p>{winText(DEFAULT_CONFIG)}</p>
        <h3>編成の強さ（3枚）</h3>
        <ol className="ranks">
          <li><b>純正コンビネーション</b> 同じ社の連番</li>
          <li><b>同型機編隊</b> 3枚とも同じ番号</li>
          <li><b>純正チーム</b> 同じ社</li>
          <li><b>連携編成</b> 連番（社は問わない）</li>
          <li><b>寄せ集め</b> それ以外</li>
        </ol>
        <p>同じ役なら番号の合計が大きい方。それも同じなら先に3枚目を置いた側の勝ち。9→1はつながりません。</p>
        <h3>特殊地形</h3>
        <p>
          <b>空域</b>は飛行（1・6）、<b>悪路</b>は履帯（3・4）が有利。
        </p>
        <p>
          ・有利機を<b>1枚</b>含む：同じ役どうしなら、合計に関係なく勝つ
          <br />・有利機を<b>2枚以上</b>含む：さらに役が1段上がる（例：純正チームが同型機と同格に）
        </p>
        <h3>決着</h3>
        {DEFAULT_CONFIG.proofSecuring ? (
          <p>
            両者が3枚そろえたら比べて決着。片方だけ3枚そろえたときも、まだ盤面に出ていないカードを全部使って相手が上回れないなら、その場で確保されます（自動で判定）。
          </p>
        ) : (
          <p>両者が3枚ずつそろえた時点で比べて決着します。決着した戦場にはもう置けません。</p>
        )}
        <button className="btn" onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  )
}

function DeckRules({ onClose }: { onClose: () => void }) {
  const cfg = DECK_CONFIG
  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel rules" onClick={(e) => e.stopPropagation()}>
        <h2>ルール（デッキ制・試作）</h2>
        <p>
          6社から1社を選び、その社の18枚のデッキで戦います（相手とは別の山札）。手札{cfg.handSize}枚から毎手番1枚を、まだ決着していない戦場の自分側に置き（各戦場3枚まで）、自分の山札から1枚引きます。
        </p>
        <h3>勝利条件</h3>
        <p>{winText(cfg)}</p>
        <h3>編成の強さ（3枚）</h3>
        <ol className="ranks">
          <li><b>同型機編隊</b> 3枚とも同じ番号</li>
          <li><b>連携編成</b> 連番</li>
          <li><b>二機編隊</b> 2枚が同じ番号</li>
          <li><b>寄せ集め</b> それ以外</li>
        </ol>
        <p>同じ役なら番号の合計が大きい方。それも同じなら先に3枚目を置いた側の勝ち。各社のデッキで同型機を作れるのは3機種までです。</p>
        <h3>特殊地形</h3>
        <p>
          <b>空域</b>は飛行（1・6）、<b>悪路</b>は履帯（3・4）が有利。有利機1枚で同じ役なら優先、2枚以上で役が1段上がる。
        </p>
        <h3>陣営効果</h3>
        <ul className="ranks">
          {FACTIONS.map((f) => (
            <li key={f.index}>
              <b>{f.shortName}</b> {f.effectText}
            </li>
          ))}
        </ul>
        <button className="btn" onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  )
}
