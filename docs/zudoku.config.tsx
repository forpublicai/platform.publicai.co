import type { ZudokuConfig } from "zudoku";
import { billingPlugin } from "./src/billingPlugin";

const config: ZudokuConfig = {
  plugins: [billingPlugin],
  site: {
    title: "Public AI Gateway",
    logo: {
      src: {
        light: "https://chat.publicai.co/static/favicon.png",
        dark: "https://chat.publicai.co/static/favicon.png",
      },
    },
  },
  metadata: {
    title: "Public AI Gateway - Developer Portal",
    description: "Access open-source AI models through our unified gateway. Documentation, API reference, and tools for developers.",
  },
  navigation: [
    {
      type: "category",
      label: "Documentation",
      items: [
        {
          type: "category",
          label: "Getting Started",
          icon: "sparkles",
          items: [
            {
              type: "doc",
              file: "docs",
              label: "Quick Start Guide",
            },
            {
              type: "doc",
              file: "inference-partners-faq",
              label: "Inference Partners FAQ",
            },
          ],
        },
        {
          type: "category",
          label: "Resources",
          collapsible: false,
          icon: "link",
          items: [
            {
              type: "link",
              label: "Public AI Website",
              to: "https://publicai.co",
            },
            {
              type: "link",
              label: "Public AI Chat",
              to: "https://chat.publicai.co/",
            },
            {
              type: "link",
              label: "GitHub",
              to: "https://github.com/forpublicai",
            },
            {
              type: "link",
              label: "Swiss AI",
              to: "https://huggingface.co/swiss-ai",
            },
            {
              type: "link",
              label: "Terms & Privacy",
              to: "https://publicai.co/tc",
            },
            {
              type: "link",
              label: "Get Involved",
              to: "https://publicai.co/contributing",
            },
          ],
        },
      ],
    },
    {
      type: "link",
      to: "/api",
      label: "API Reference",
    },
    {
      type: "link",
      to: "/billing",
      label: "Billing",
    },
    {
      "type": "doc",
      "label": "Support Us",
      "file": "support-us"
    }
  ],
  redirects: [{ from: "/", to: "/docs" }],
  apis: [
    {
      type: "file",
      input: "../config/routes.oas.json",
      path: "api",
      options: {
        disablePlayground: true, // Disable the interactive API playground
      },
    },
  ],
  authentication: {
    type: "auth0",
    domain: "login.publicai.co",
    clientId: "GsHpOedTKzJpnKlQIIeXDBKjssyOmOsj",
    audience: "https://docs.publicai.company/api",
    protectedRoutes: ["/billing"],
  },
  apiKeys: {
    // enabled: true,
    deploymentName: process.env.ZUPLO_PUBLIC_DEPLOYMENT_NAME, // Note: Only required for local development
    createKey: async ({ apiKey, context, auth }) => {
      // process.env is used in config files and gets replaced at build time
      const serverUrl = process.env.ZUPLO_PUBLIC_SERVER_URL || import.meta.env.ZUPLO_SERVER_URL || window.location.origin;

      console.log("Creating API key with serverUrl:", serverUrl);

      const createApiKeyRequest = new Request(serverUrl + "/v1/developer/api-key", {
        method: "POST",
        body: JSON.stringify({
          ...apiKey,
          email: auth.profile?.email,
          metadata: {
            userId: auth.profile?.sub,
            name: auth.profile?.name,
          },
        }),
        headers: {
          "Content-Type": "application/json",
        },
      });

      try {
        const signedRequest = await context.signRequest(createApiKeyRequest);
        console.log("Signed request:", signedRequest.url);

        const createApiKey = await fetch(signedRequest);
        console.log("Response status:", createApiKey.status);

        if (!createApiKey.ok) {
          const errorText = await createApiKey.text();
          console.error("API Key creation failed:", errorText);
          throw new Error("Could not create API Key: " + errorText);
        }

        console.log("API Key created successfully");
        return true;
      } catch (error) {
        console.error("Error in createKey:", error);
        throw error;
      }
    },
  },
};

export default config;
