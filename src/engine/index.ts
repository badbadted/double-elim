/** Public engine surface. */
export * from './types';
export * from './rng';
export {
  nextPow2,
  standardSeedOrder,
  generateBracket,
  drawSeeds,
  GRAND_FINAL_ID,
  GRAND_FINAL_RESET_ID,
} from './bracket';
export {
  indexMatches,
  indexPlayers,
  resolveSlot,
  resolveMatch,
  winnerOf,
  loserOf,
  classifyMatch,
} from './resolve';
export type { MatchState } from './resolve';
export {
  createTournament,
  reseed,
  setPlayers,
  addPlayer,
  removePlayer,
  renamePlayer,
  setResetEnabled,
  lockAndStart,
  resetToDraft,
  advanceWinner,
  settleByes,
  playableMatches,
  getChampion,
  isResetActive,
} from './engine';
export { computeStandings } from './standings';
