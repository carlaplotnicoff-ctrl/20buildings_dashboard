import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Fetch all rows from a table, paginating past the 1000-row limit.
 * Returns the full array of rows.
 */
export async function fetchAll(table, { select = '*', filters = [], order } = {}) {
  const PAGE_SIZE = 1000;
  let allRows = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase.from(table).select(select).range(from, from + PAGE_SIZE - 1);

    for (const [col, op, val] of filters) {
      query = query.filter(col, op, val);
    }

    if (order) {
      query = query.order(order.column, { ascending: order.ascending ?? true });
    }

    const { data, error } = await query;
    if (error) throw error;

    allRows = allRows.concat(data);
    hasMore = data.length === PAGE_SIZE;
    from += PAGE_SIZE;
  }

  return allRows;
}
