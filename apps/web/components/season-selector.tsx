'use client';

import type { CatalogContext } from '@camp-registration/contracts';
import { useRouter } from 'next/navigation';

export function SeasonSelector({
  seasons,
  selectedSeasonId,
}: {
  seasons: CatalogContext['seasons'];
  selectedSeasonId: string;
}) {
  const router = useRouter();

  return (
    <label className="seasonControl">
      <span>Season</span>
      <select
        value={selectedSeasonId}
        aria-label="Active season"
        onChange={(event) => router.push(`/sessions?seasonId=${event.target.value}`)}
      >
        {seasons.map((season) => (
          <option key={season.id} value={season.id}>
            {season.name}
          </option>
        ))}
      </select>
    </label>
  );
}
