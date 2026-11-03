import { createContext } from "react";

// Opens a monkey's pop-up from anywhere inside the main page (ShowPage
// provides it): e.g. tapping a monkey's photo on the Records pages.
// null: nowhere to open it (the photo's just a photo)
export const OpenMonkeyContext = createContext(null);
