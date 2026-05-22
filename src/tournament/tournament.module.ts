import { Module } from '@nestjs/common';
import { TournamentController } from './tournament.controller';
import { TournamentService } from './tournament.service';
import { TournamentPredictionsService } from './tournament-predictions.service';

@Module({
  controllers: [TournamentController],
  providers: [TournamentService, TournamentPredictionsService],
  exports: [TournamentService, TournamentPredictionsService],
})
export class TournamentModule {}
