import { Module } from '@nestjs/common';
import { FootballDataOrgProvider } from './football-data-org.provider';
import { TheSportsDbProvider } from './the-sports-db.provider';
import { ProviderFailover } from './failover';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  providers: [FootballDataOrgProvider, TheSportsDbProvider, ProviderFailover],
  exports: [ProviderFailover],
})
export class IntegrationsModule {}
