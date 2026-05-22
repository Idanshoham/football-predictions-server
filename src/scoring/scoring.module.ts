import { Module } from '@nestjs/common';
import { RescoreService } from './rescore.service';

@Module({
  providers: [RescoreService],
  exports: [RescoreService],
})
export class ScoringModule {}
