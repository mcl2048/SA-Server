// Append-only game extensions share the album/GM presentation without changing
// the four mechanical pets' separate data contract or saved album identities.
import { AI_PET_CATALOG,                        } from "./ai-pet-catalog.js?v=abae3f174fa9bed4";
import { LILITH_CATALOG } from "./lilith-catalog.js?v=abae3f174fa9bed4";
import { LISARIDO_CATALOG } from "./lisarido-catalog.js?v=abae3f174fa9bed4";

export const PET_CATALOG                               = [...AI_PET_CATALOG, LILITH_CATALOG, LISARIDO_CATALOG];

export function petForSprite(sprite        )                                {
  return PET_CATALOG.find(p => p.sprite === sprite);
}
