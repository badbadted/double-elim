/**
 * Core domain types for the double-elimination engine.
 *
 * Everything here is a plain serializable object (no class instances, no
 * functions) so a whole tournament can be JSON-stringified into localStorage
 * today and into a Firestore document later without any transform layer.
 */

/** A competitor entered into the tournament. */
export interface Player {
  id: string;
  name: string;
  /** Optional nickname; when set it is shown in the bracket instead of `name`. */
  nickname?: string;
  /** 1-based seed number assigned at draw time (used for bracket placement). */
  seed: number;
}

export type BracketKind = 'WB' | 'LB' | 'GF' | 'GF_RESET';

/**
 * How a match slot is filled. A slot is either a concrete player, a bye,
 * or a reference to the winner/loser of an upstream match (resolved lazily).
 */
export type SlotRef =
  | { type: 'player'; playerId: string }
  | { type: 'bye' }
  | { type: 'winner'; matchId: string }
  | { type: 'loser'; matchId: string };

/** A single match node in the bracket graph. */
export interface Match {
  id: string;
  bracket: BracketKind;
  /** 1-based round index within its bracket. */
  round: number;
  /** 0-based position within the round (top to bottom). */
  order: number;
  a: SlotRef;
  b: SlotRef;
  /** Decided side, or null while pending. Bye matches are auto-decided. */
  winner: 'a' | 'b' | null;
  /** Human-facing round label, e.g. "第一輪" / "勝部決賽" / "冠軍戰". */
  label: string;
}

export type TournamentStatus = 'DRAFT' | 'RUNNING' | 'FINISHED';

/** The full serializable tournament state. */
export interface Tournament {
  id: string;
  name: string;
  status: TournamentStatus;
  /** Whether the grand-final bracket reset (復活賽) is enabled. */
  resetEnabled: boolean;
  players: Player[];
  matches: Match[];
  /** nextPow2(playerCount) — the padded bracket size. */
  bracketSize: number;
  /** Number of winners-bracket rounds = log2(bracketSize). */
  wbRounds: number;
  createdAt: number;
  updatedAt: number;
}

/** A slot resolved against current results: a player, a bye, or not-yet-known. */
export type ResolvedSlot =
  | { state: 'player'; player: Player }
  | { state: 'bye' }
  | { state: 'tbd' };

/** A final standings row. Ties share the same rank number. */
export interface StandingRow {
  rank: number;
  player: Player;
  losses: number;
  /** e.g. "冠軍" / "亞軍" / "季軍" / undefined. */
  title?: string;
}
