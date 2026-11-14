// Append-only game extensions share the album/GM presentation without changing
// the four mechanical pets' separate data contract or saved album identities.
import { AI_PET_CATALOG, type AiPetCatalogEntry } from "./ai-pet-catalog.ts";
import { LILITH_CATALOG } from "./lilith-catalog.ts";
import { LISARIDO_CATALOG } from "./lisarido-catalog.ts";

export const PET_CATALOG: readonly AiPetCatalogEntry[] = [...AI_PET_CATALOG, LILITH_CATALOG, LISARIDO_CATALOG];

export function petForSprite(sprite: number): AiPetCatalogEntry | undefined {
  return PET_CATALOG.find(p => p.sprite === sprite);
}
