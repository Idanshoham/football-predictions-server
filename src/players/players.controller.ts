import { Controller, Get, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { PlayersService } from './players.service';

@Controller('players')
@UseGuards(SupabaseAuthGuard)
export class PlayersController {
  constructor(private readonly players: PlayersService) {}

  @Get()
  list() {
    return this.players.listAllForActiveTournament();
  }
}
