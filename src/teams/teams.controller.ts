import { Controller, Get, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { TeamsService } from './teams.service';

@Controller('teams')
@UseGuards(SupabaseAuthGuard)
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Get()
  list() {
    return this.teams.listAllForActiveTournament();
  }
}
