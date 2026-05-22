import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { MatchesService, MatchFilter } from './matches.service';

const ALLOWED: ReadonlySet<MatchFilter> = new Set(['upcoming', 'live', 'past']);

@Controller('matches')
@UseGuards(SupabaseAuthGuard)
export class MatchesController {
  constructor(private readonly matches: MatchesService) {}

  @Get()
  list(@Query('status') status?: string) {
    if (status !== undefined && !ALLOWED.has(status as MatchFilter)) {
      throw new BadRequestException(
        `status must be one of upcoming|live|past (got: ${status})`,
      );
    }
    return this.matches.list(status as MatchFilter | undefined);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.matches.getById(id);
  }
}
