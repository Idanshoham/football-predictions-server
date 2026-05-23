import { Module, forwardRef } from '@nestjs/common';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';
import { TeamsRepository } from './teams.repository';
import { TournamentModule } from '../tournament/tournament.module';

@Module({
  imports: [forwardRef(() => TournamentModule)],
  controllers: [TeamsController],
  providers: [TeamsService, TeamsRepository],
  exports: [TeamsRepository],
})
export class TeamsModule {}
