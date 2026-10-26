import { useEffect } from "react";

declare global {
  interface Window {
    chatwootSettings?: {
      position?: string;
      type?: string;
      launcherTitle?: string;
      [key: string]: unknown;
    };
    chatwootSDK?: {
      run: (config: { websiteToken: string; baseUrl: string }) => void;
      [key: string]: unknown;
    };
  }
}

export const ChatwootWidget = () => {
  useEffect(() => {
    window.chatwootSettings = {
      position: "right",
      type: "standard",
      launcherTitle: "",
    };

    const BASE_URL = "https://app.chatwoot.com";
    const scriptId = "chatwoot-sdk-script";

    // If already loaded and initialized, just ensure it runs
    if (document.getElementById(scriptId)) {
      if (window.chatwootSDK) {
        window.chatwootSDK.run({
          websiteToken: "AP6os8SLpF933WEnEzRqdfnT",
          baseUrl: BASE_URL,
        });
      }
      return;
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = `${BASE_URL}/packs/js/sdk.js`;
    script.async = true;

    script.onload = () => {
      window.chatwootSDK?.run({
        websiteToken: "AP6os8SLpF933WEnEzRqdfnT",
        baseUrl: BASE_URL,
      });
    };

    const firstScript = document.getElementsByTagName("script")[0];
    if (firstScript && firstScript.parentNode) {
      firstScript.parentNode.insertBefore(script, firstScript);
    } else {
      document.head.appendChild(script);
    }
  }, []);

  return null;
};
