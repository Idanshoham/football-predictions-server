import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PredictionsService } from './predictions.service';
import { UpsertPredictionDto } from './dto/upsert-prediction.dto';
import type { User } from '@prisma/client';

@Controller('predictions')
@UseGuards(SupabaseAuthGuard)
export class PredictionsController {
  constructor(private readonly predictions: PredictionsService) {}

  @Post()
  upsert(@CurrentUser() user: User, @Body() body: UpsertPredictionDto) {
    return this.predictions.upsert(user, body);
  }

  @Get('mine')
  listMine(@CurrentUser() user: User) {
    return this.predictions.listMine(user);
  }

  @Get('match/:matchId')
  getForMatch(@CurrentUser() user: User, @Param('matchId') matchId: string) {
    return this.predictions.getForMatch(user, matchId);
  }
}
