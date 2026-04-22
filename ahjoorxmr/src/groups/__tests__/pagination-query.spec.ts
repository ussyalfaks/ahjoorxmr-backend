import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PaginationQueryDto } from '../dto/pagination-query.dto';

describe('PaginationQueryDto – boundary validation (#154)', () => {
  const toDto = (plain: Record<string, unknown>) =>
    plainToInstance(PaginationQueryDto, plain);

  it('accepts valid page and limit', async () => {
    const errors = await validate(toDto({ page: 1, limit: 20 }));
    expect(errors).toHaveLength(0);
  });

  it('rejects page=0', async () => {
    const errors = await validate(toDto({ page: 0, limit: 20 }));
    expect(errors.some((e) => e.property === 'page')).toBe(true);
  });

  it('rejects limit=0', async () => {
    const errors = await validate(toDto({ page: 1, limit: 0 }));
    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });

  it('rejects limit=101 (exceeds max)', async () => {
    const errors = await validate(toDto({ page: 1, limit: 101 }));
    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });

  it('accepts limit=100 (boundary max)', async () => {
    const errors = await validate(toDto({ page: 1, limit: 100 }));
    expect(errors).toHaveLength(0);
  });

  it('accepts limit=1 (boundary min)', async () => {
    const errors = await validate(toDto({ page: 1, limit: 1 }));
    expect(errors).toHaveLength(0);
  });

  it('uses defaults when no values provided', () => {
    const dto = toDto({});
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });
});
