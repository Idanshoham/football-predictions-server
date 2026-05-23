import { Injectable } from '@nestjs/common';
import { PlayersRepository } from './players.repository';
import { TournamentService } from '../tournament/tournament.service';

@Injectable()
export class PlayersService {
  constructor(
    private readonly players: PlayersRepository,
    private readonly tournament: TournamentService,
  ) {}

  async listAllForActiveTournament() {
    const t = await this.tournament.getActive();
    return this.players.listActiveForTournament(t.id);
  }
}
