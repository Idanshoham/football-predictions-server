import { Module } from '@nestjs/common';
import { PlayersController } from './players.controller';
import { PlayersService } from './players.service';
import { TournamentModule } from '../tournament/tournament.module';

@Module({
  imports: [TournamentModule],
  controllers: [PlayersController],
  providers: [PlayersService],
})
export class PlayersModule {}
