import { createContext } from "react";

export const ViewerCardArtIdsContext = createContext<ReadonlySet<string> | undefined>(undefined);
