import { marketFilter, MARKETS } from '../store/data';

export function MarketChips() {
  return (
    <div class="market-chips">
      <span class="chip-label">Market</span>
      {MARKETS.value.map(m => (
        <button
          key={m}
          class={`chip ${marketFilter.value === m ? 'active' : ''}`}
          onClick={() => marketFilter.value = m}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
