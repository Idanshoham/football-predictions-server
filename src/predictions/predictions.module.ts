import { Module } from '@nestjs/common';
import { PredictionsController } from './predictions.controller';
import { PredictionsService } from './predictions.service';
import { PredictionsRepository } from './predictions.repository';
import { MatchesModule } from '../matches/matches.module';
import { PlayersModule } from '../players/players.module';

@Module({
  imports: [MatchesModule, PlayersModule],
  controllers: [PredictionsController],
  providers: [PredictionsService, PredictionsRepository],
  exports: [PredictionsService, PredictionsRepository],
})
export class PredictionsModule {}
