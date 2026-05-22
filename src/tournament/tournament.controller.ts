import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { TournamentService } from './tournament.service';
import { TournamentPredictionsService } from './tournament-predictions.service';
import {
  UpsertBracketDto,
  UpsertGroupRankingDto,
  UpsertTournamentPredictionDto,
} from './dto/upsert-tournament.dto';
import type { User } from '@prisma/client';

@Controller('tournament')
@UseGuards(SupabaseAuthGuard)
export class TournamentController {
  constructor(
    private readonly tournament: TournamentService,
    private readonly predictions: TournamentPredictionsService,
  ) {}

  @Get('active')
  async getActive() {
    const t = await this.tournament.getActive();
    return {
      id: t.id,
      slug: t.slug,
      nameHe: t.nameHe,
      nameEn: t.nameEn,
      openerKickoffAt: t.openerKickoffAt,
      bracketLockState: await this.tournament.getBracketLockState(),
      tournamentLocked: await this.tournament.isLocked(),
    };
  }

  // Champion + Golden Boot
  @Get('predictions/mine')
  async getMyTournamentPrediction(@CurrentUser() user: User) {
    return this.predictions.getMyTournamentPrediction(user);
  }

  @Post('predictions')
  async upsertTournamentPrediction(
    @CurrentUser() user: User,
    @Body() body: UpsertTournamentPredictionDto,
  ) {
    return this.predictions.upsertTournamentPrediction(user, body);
  }

  // Group rankings
  @Get('groups/mine')
  async getMyGroupRankings(@CurrentUser() user: User) {
    return this.predictions.getMyGroupRankings(user);
  }

  @Post('groups')
  async upsertGroupRanking(
    @CurrentUser() user: User,
    @Body() body: UpsertGroupRankingDto,
  ) {
    return this.predictions.upsertGroupRanking(user, body);
  }

  // Bracket
  @Get('bracket/mine')
  async getMyBracket(@CurrentUser() user: User) {
    return this.predictions.getMyBracket(user);
  }

  @Post('bracket')
  async upsertBracket(
    @CurrentUser() user: User,
    @Body() body: UpsertBracketDto,
  ) {
    return this.predictions.upsertBracket(user, body);
  }
}
