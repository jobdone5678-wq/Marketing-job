// Matching must see every row: Supabase's default response limit can hide an ambiguous match.
export async function readAllRows<T>(page: (from: number, to: number) => PromiseLike<T[]>): Promise<T[]> {
  const result: T[] = [];
  const size = 500;
  for (let start = 0; ; start += size) {
    const rows = await page(start, start + size - 1);
    result.push(...rows);
    if (rows.length < size) return result;
  }
}
