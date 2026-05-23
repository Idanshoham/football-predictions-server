import { Module } from '@nestjs/common';
import { RescoreService } from './rescore.service';
import { MatchesModule } from '../matches/matches.module';
import { PredictionsModule } from '../predictions/predictions.module';
import { TournamentModule } from '../tournament/tournament.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [MatchesModule, PredictionsModule, TournamentModule, AuditModule],
  providers: [RescoreService],
  exports: [RescoreService],
})
export class ScoringModule {}
