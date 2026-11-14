// Append-only game extensions share the album/GM presentation without changing
// the four mechanical pets' separate data contract or saved album identities.
import { AI_PET_CATALOG,                        } from "./ai-pet-catalog.js?v=9256777782deda32";
import { LILITH_CATALOG } from "./lilith-catalog.js?v=9256777782deda32";
import { LISARIDO_CATALOG } from "./lisarido-catalog.js?v=9256777782deda32";
import { PRIMAL_CLAWS_CATALOG } from "./primal-claws-catalog.js?v=9256777782deda32";

export const PET_CATALOG                               = [...AI_PET_CATALOG, LILITH_CATALOG, LISARIDO_CATALOG, ...PRIMAL_CLAWS_CATALOG];

export function petForSprite(sprite        )                                {
  return PET_CATALOG.find(p => p.sprite === sprite);
}
