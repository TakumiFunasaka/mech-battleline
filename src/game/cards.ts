import type { GameConfig } from './config'

/**
 * カードID = 社 × 1社の枚数 + 社内の通し番号。
 * 社ごとの番号の並びは cfg.companyNumbers（null なら全社が 1..maxNumber を1枚ずつ）。
 * デッキ制では、その試合のカード表 cfg.cardTable の添字がカードID。
 */
export type CardId = number

export const cardsPerCompany = (cfg: GameConfig): number =>
  cfg.companyNumbers ? cfg.companyNumbers[0].length : cfg.maxNumber

/** 社 company の番号 number のカード（同じ番号が2枚ある社では1枚目） */
export const cardId = (cfg: GameConfig, company: number, number: number): CardId => {
  const slot = cfg.companyNumbers ? cfg.companyNumbers[company].indexOf(number) : number - 1
  if (slot < 0) throw new Error(`company ${company} has no number ${number}`)
  return company * cardsPerCompany(cfg) + slot
}

export const companyOf = (cfg: GameConfig, id: CardId): number =>
  cfg.cardTable ? cfg.cardTable[id].company : Math.floor(id / cardsPerCompany(cfg))

export const numberOf = (cfg: GameConfig, id: CardId): number =>
  cfg.cardTable
    ? cfg.cardTable[id].number
    : cfg.companyNumbers
      ? cfg.companyNumbers[Math.floor(id / cfg.companyNumbers[0].length)][id % cfg.companyNumbers[0].length]
      : (id % cfg.maxNumber) + 1

/** 指定した社（既定は先頭から companies 社）の全カード */
export const allCards = (
  cfg: GameConfig,
  companies: readonly number[] = Array.from({ length: cfg.companies }, (_, i) => i),
): CardId[] => {
  const per = cardsPerCompany(cfg)
  return companies.flatMap((c) => Array.from({ length: per }, (_, i) => c * per + i))
}
