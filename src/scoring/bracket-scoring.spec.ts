import {
  allBracketSlots,
  BRACKET_MATCH_COUNT,
  BRACKET_MAX_POINTS,
  calculateBracketPoints,
} from './bracket-scoring';

describe('allBracketSlots', () => {
  it('returns exactly 32 slots (16 R32 + 8 R16 + 4 QF + 2 SF + 1 final + 1 third)', () => {
    const slots = allBracketSlots();
    expect(slots.length).toBe(BRACKET_MATCH_COUNT);
    expect(slots.length).toBe(32);
  });

  it('starts with r32_1 and ends with third', () => {
    const slots = allBracketSlots();
    expect(slots[0]).toBe('r32_1');
    expect(slots[slots.length - 1]).toBe('third');
  });

  it('contains exactly one "final" and one "third"', () => {
    const slots = allBracketSlots();
    expect(slots.filter((s) => s === 'final').length).toBe(1);
    expect(slots.filter((s) => s === 'third').length).toBe(1);
  });

  it('all slots are unique', () => {
    const slots = allBracketSlots();
    expect(new Set(slots).size).toBe(slots.length);
  });
});

describe('calculateBracketPoints', () => {
  it('empty actual → 0 points', () => {
    expect(
      calculateBracketPoints(
        { winnersBySlot: { r32_1: 'BR' } },
        { winnersBySlot: {} },
      ),
    ).toBe(0);
  });

  it('one match correct → +5', () => {
    expect(
      calculateBracketPoints(
        { winnersBySlot: { r32_1: 'BR' } },
        { winnersBySlot: { r32_1: 'BR' } },
      ),
    ).toBe(5);
  });

  it('one match wrong → 0', () => {
    expect(
      calculateBracketPoints(
        { winnersBySlot: { r32_1: 'BR' } },
        { winnersBySlot: { r32_1: 'AR' } },
      ),
    ).toBe(0);
  });

  it('partial: 3 of 5 matches correct → +15', () => {
    expect(
      calculateBracketPoints(
        {
          winnersBySlot: {
            r32_1: 'BR',
            r32_2: 'AR',
            r32_3: 'FR',
            r32_4: 'EN',
            r32_5: 'ES',
          },
        },
        {
          winnersBySlot: {
            r32_1: 'BR', // correct
            r32_2: 'AR', // correct
            r32_3: 'BE', // wrong
            r32_4: 'EN', // correct
            r32_5: 'PT', // wrong
          },
        },
      ),
    ).toBe(15);
  });

  it('user did not predict a slot the tournament has decided → no points for that slot', () => {
    expect(
      calculateBracketPoints(
        { winnersBySlot: { r32_1: 'BR' } },
        { winnersBySlot: { r32_1: 'BR', r32_2: 'AR' } },
      ),
    ).toBe(5);
  });

  it('full perfect bracket (32/32) → BRACKET_MAX_POINTS', () => {
    const all = allBracketSlots();
    const winners = Object.fromEntries(all.map((slot) => [slot, `team-${slot}`]));
    expect(
      calculateBracketPoints({ winnersBySlot: winners }, { winnersBySlot: winners }),
    ).toBe(BRACKET_MAX_POINTS);
    expect(BRACKET_MAX_POINTS).toBe(160);
  });

  it('final + third correct → +10', () => {
    expect(
      calculateBracketPoints(
        { winnersBySlot: { final: 'BR', third: 'EN' } },
        { winnersBySlot: { final: 'BR', third: 'EN' } },
      ),
    ).toBe(10);
  });
});
