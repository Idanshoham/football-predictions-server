import { Module } from '@nestjs/common';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';
import { TournamentModule } from '../tournament/tournament.module';

@Module({
  imports: [TournamentModule],
  controllers: [TeamsController],
  providers: [TeamsService],
})
export class TeamsModule {}
