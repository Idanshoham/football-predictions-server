import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';
import { MatchesModule } from './matches/matches.module';
import { PredictionsModule } from './predictions/predictions.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { TournamentModule } from './tournament/tournament.module';
import { ScoringModule } from './scoring/scoring.module';
import { JobsModule } from './jobs/jobs.module';
import { InternalModule } from './internal/internal.module';
import { PlayersModule } from './players/players.module';
import { TeamsModule } from './teams/teams.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    MatchesModule,
    PredictionsModule,
    IntegrationsModule,
    LeaderboardModule,
    TournamentModule,
    ScoringModule,
    JobsModule,
    InternalModule,
    PlayersModule,
    TeamsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
