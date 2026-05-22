import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Idempotent seed: creates the WC2026 tournament + a handful of teams + the
 * opener match. Re-running is safe — every record is upserted by a stable
 * external slug.
 *
 * For the real tournament, extend this with all 48 teams + 104 matches.
 * Easiest way: keep teams.json and fixtures.json next to this file and
 * iterate them.
 */
async function main(): Promise<void> {
  const tournament = await prisma.tournament.upsert({
    where: { slug: 'wc2026' },
    create: {
      slug: 'wc2026',
      nameHe: 'מונדיאל 2026',
      nameEn: 'World Cup 2026',
      openerKickoffAt: new Date('2026-06-11T18:00:00Z'),
      isActive: true,
    },
    update: {},
  });

  const teamSeeds = [
    { slug: 'BR', nameHe: 'ברזיל', nameEn: 'Brazil', group: 'A', flag: '🇧🇷' },
    { slug: 'NL', nameHe: 'הולנד', nameEn: 'Netherlands', group: 'A', flag: '🇳🇱' },
    { slug: 'AR', nameHe: 'ארגנטינה', nameEn: 'Argentina', group: 'B', flag: '🇦🇷' },
    { slug: 'BE', nameHe: 'בלגיה', nameEn: 'Belgium', group: 'B', flag: '🇧🇪' },
    { slug: 'FR', nameHe: 'צרפת', nameEn: 'France', group: 'C', flag: '🇫🇷' },
    { slug: 'HR', nameHe: 'קרואטיה', nameEn: 'Croatia', group: 'C', flag: '🇭🇷' },
    { slug: 'EN', nameHe: 'אנגליה', nameEn: 'England', group: 'D', flag: '🏴' },
    { slug: 'UY', nameHe: 'אורוגוואי', nameEn: 'Uruguay', group: 'D', flag: '🇺🇾' },
  ];

  const teamsBySlug: Record<string, { id: string }> = {};
  for (const t of teamSeeds) {
    const existing = await prisma.team.findFirst({
      where: { tournamentId: tournament.id, apiIds: { equals: { slug: t.slug } as never } },
    });
    const row = existing
      ? existing
      : await prisma.team.create({
          data: {
            tournamentId: tournament.id,
            nameHe: t.nameHe,
            nameEn: t.nameEn,
            groupName: t.group,
            apiIds: { slug: t.slug },
            flagEmoji: t.flag,
          },
        });
    teamsBySlug[t.slug] = row;
  }

  // Opener fixture: Brazil vs Argentina at the tournament openerKickoff
  await ensureFixture({
    homeSlug: 'BR',
    awaySlug: 'AR',
    kickoffAt: tournament.openerKickoffAt,
    groupName: 'A',
  });

  // A few more group-stage fixtures for the demo to feel alive
  await ensureFixture({
    homeSlug: 'FR',
    awaySlug: 'EN',
    kickoffAt: new Date('2026-06-12T19:00:00Z'),
    groupName: 'C',
  });
  await ensureFixture({
    homeSlug: 'NL',
    awaySlug: 'HR',
    kickoffAt: new Date('2026-06-13T19:00:00Z'),
    groupName: 'A',
  });

  console.log(
    `Seeded tournament ${tournament.slug} with ${teamSeeds.length} teams and 3 fixtures.`,
  );

  async function ensureFixture(args: {
    homeSlug: string;
    awaySlug: string;
    kickoffAt: Date;
    groupName: string;
  }): Promise<void> {
    const home = teamsBySlug[args.homeSlug];
    const away = teamsBySlug[args.awaySlug];
    if (!home || !away) throw new Error(`Missing team in seed: ${args.homeSlug} or ${args.awaySlug}`);

    const existing = await prisma.match.findFirst({
      where: {
        tournamentId: tournament.id,
        homeTeamId: home.id,
        awayTeamId: away.id,
        kickoffAt: args.kickoffAt,
      },
    });
    if (existing) return;

    await prisma.match.create({
      data: {
        tournamentId: tournament.id,
        homeTeamId: home.id,
        awayTeamId: away.id,
        kickoffAt: args.kickoffAt,
        status: 'scheduled',
        stage: 'group',
        groupName: args.groupName,
        apiIds: {},
      },
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
