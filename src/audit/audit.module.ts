import { Module } from '@nestjs/common';
import { AuditRepository } from './audit.repository';

@Module({
  providers: [AuditRepository],
  exports: [AuditRepository],
})
export class AuditModule {}
