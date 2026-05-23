import { Injectable } from '@nestjs/common';
import { TeamsRepository } from './teams.repository';
import { TournamentService } from '../tournament/tournament.service';

@Injectable()
export class TeamsService {
  constructor(
    private readonly teams: TeamsRepository,
    private readonly tournament: TournamentService,
  ) {}

  async listAllForActiveTournament() {
    const t = await this.tournament.getActive();
    return this.teams.listByTournament(t.id);
  }
}
