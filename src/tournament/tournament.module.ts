import { Module, forwardRef } from '@nestjs/common';
import { TournamentController } from './tournament.controller';
import { TournamentService } from './tournament.service';
import { TournamentPredictionsService } from './tournament-predictions.service';
import { TournamentRepository } from './tournament.repository';
import { TournamentPredictionsRepository } from './tournament-predictions.repository';
import { GroupPredictionsRepository } from './group-predictions.repository';
import { BracketPredictionsRepository } from './bracket-predictions.repository';
import { MatchesModule } from '../matches/matches.module';
import { TeamsModule } from '../teams/teams.module';
import { PlayersModule } from '../players/players.module';

/**
 * Note the forwardRef on Teams/Players — those modules import TournamentModule
 * (for TournamentService.getActive in their own services), so we have a
 * mutual dependency. forwardRef breaks the load-time cycle; runtime is fine
 * because the actual service-to-repository wiring isn't circular.
 */
@Module({
  imports: [
    MatchesModule,
    forwardRef(() => TeamsModule),
    forwardRef(() => PlayersModule),
  ],
  controllers: [TournamentController],
  providers: [
    TournamentService,
    TournamentPredictionsService,
    TournamentRepository,
    TournamentPredictionsRepository,
    GroupPredictionsRepository,
    BracketPredictionsRepository,
  ],
  exports: [
    TournamentService,
    TournamentPredictionsService,
    TournamentRepository,
    TournamentPredictionsRepository,
    GroupPredictionsRepository,
    BracketPredictionsRepository,
  ],
})
export class TournamentModule {}
