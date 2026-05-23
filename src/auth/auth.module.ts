import { Global, Module } from '@nestjs/common';
import { SupabaseAuthGuard } from './supabase-auth.guard';
import { UsersModule } from '../users/users.module';

/**
 * Global so any controller can do `@UseGuards(SupabaseAuthGuard)` without
 * importing AuthModule. The guard depends on UsersService → UsersRepository
 * → TournamentService → TournamentRepository → PrismaService.
 */
@Global()
@Module({
  imports: [UsersModule],
  providers: [SupabaseAuthGuard],
  exports: [SupabaseAuthGuard],
})
export class AuthModule {}
