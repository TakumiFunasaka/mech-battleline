import type { GameConfig } from './config'

/** カードID = 社 × maxNumber + (番号 - 1) */
export type CardId = number

export const cardId = (cfg: GameConfig, company: number, number: number): CardId =>
  company * cfg.maxNumber + (number - 1)

export const companyOf = (cfg: GameConfig, id: CardId): number => Math.floor(id / cfg.maxNumber)

export const numberOf = (cfg: GameConfig, id: CardId): number => (id % cfg.maxNumber) + 1

/** 指定した社（既定は先頭から companies 社）の全カード */
export const allCards = (
  cfg: GameConfig,
  companies: readonly number[] = Array.from({ length: cfg.companies }, (_, i) => i),
): CardId[] => companies.flatMap((c) => Array.from({ length: cfg.maxNumber }, (_, n) => cardId(cfg, c, n + 1)))
