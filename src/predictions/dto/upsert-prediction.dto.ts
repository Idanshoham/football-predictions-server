import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpsertPredictionDto {
  @IsString()
  matchId!: string;

  @IsInt()
  @Min(0)
  @Max(20)
  homeScorePred!: number;

  @IsInt()
  @Min(0)
  @Max(20)
  awayScorePred!: number;

  // null means "no first-scorer prediction"; otherwise must be a player id
  // belonging to one of the match's two teams.
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  firstScorerPlayerId?: string | null;
}
