import { IsOptional, IsString } from 'class-validator';

export class UpsertTournamentPredictionDto {
  @IsOptional()
  @IsString()
  championTeamId?: string | null;

  @IsOptional()
  @IsString()
  goldenBootPlayerId?: string | null;
}

export class UpsertGroupRankingDto {
  @IsString()
  groupName!: string;

  @IsString({ each: true })
  ranking!: string[];
}

export class UpsertBracketDto {
  // Map of slot id → winner team id, e.g. { r32_1: "BR", r32_2: "AR", ... }
  // Caller may submit any subset of slots; server merges into current version.
  winnersBySlot!: Record<string, string>;
}
