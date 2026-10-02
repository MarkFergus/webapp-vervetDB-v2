// Stand-in for vite-plugin-pwa's "virtual:pwa-register/react" in tests,
// which run outside a browser (no service worker). No update is ever waiting.
import { useState } from "react";

export function useRegisterSW() {
    const needRefresh = useState(false);
    const offlineReady = useState(false);
    return { needRefresh, offlineReady, updateServiceWorker: async () => {} };
}
