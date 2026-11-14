// Append-only game extensions share the album/GM presentation without changing
// the four mechanical pets' separate data contract or saved album identities.
import { AI_PET_CATALOG,                        } from "./ai-pet-catalog.js?v=befcbe62a17abfb2";
import { LILITH_CATALOG } from "./lilith-catalog.js?v=befcbe62a17abfb2";

export const PET_CATALOG                               = [...AI_PET_CATALOG, LILITH_CATALOG];

export function petForSprite(sprite        )                                {
  return PET_CATALOG.find(p => p.sprite === sprite);
}
