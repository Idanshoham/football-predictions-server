import { Module, forwardRef } from '@nestjs/common';
import { PlayersController } from './players.controller';
import { PlayersService } from './players.service';
import { PlayersRepository } from './players.repository';
import { TournamentModule } from '../tournament/tournament.module';

@Module({
  imports: [forwardRef(() => TournamentModule)],
  controllers: [PlayersController],
  providers: [PlayersService, PlayersRepository],
  exports: [PlayersRepository],
})
export class PlayersModule {}
