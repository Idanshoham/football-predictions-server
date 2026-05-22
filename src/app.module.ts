import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';
import { MatchesModule } from './matches/matches.module';
import { PredictionsModule } from './predictions/predictions.module';
import { IntegrationsModule } from './integrations/integrations.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    MatchesModule,
    PredictionsModule,
    IntegrationsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
