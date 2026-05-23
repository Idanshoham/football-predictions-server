import { Module } from '@nestjs/common';
import { LeaderboardController } from './leaderboard.controller';
import { LeaderboardService } from './leaderboard.service';
import { UsersModule } from '../users/users.module';
import { PredictionsModule } from '../predictions/predictions.module';
import { TournamentModule } from '../tournament/tournament.module';

@Module({
  imports: [UsersModule, PredictionsModule, TournamentModule],
  controllers: [LeaderboardController],
  providers: [LeaderboardService],
  exports: [LeaderboardService],
})
export class LeaderboardModule {}
