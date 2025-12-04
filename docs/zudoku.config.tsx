import type { ZudokuConfig } from "zudoku";
import { BillingPage } from "./src/BillingPage";

const config: ZudokuConfig = {
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
      type: "custom-page",
      path: "/billing",
      element: <BillingPage />,
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
    enabled: true,
    deploymentName: process.env.ZUPLO_PUBLIC_DEPLOYMENT_NAME, // Note: Only required for local development
    createKey: async ({ apiKey, context, auth }) => {
      // process.env.ZUPLO_PUBLIC_SERVER_URL is only required for local development
      // import.meta.env.ZUPLO_SERVER_URL is automatically set when using a deployed environment, you do not need to set it
      const serverUrl = process.env.ZUPLO_PUBLIC_SERVER_URL || import.meta.env.ZUPLO_SERVER_URL; 
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

      const createApiKey = await fetch(
        await context.signRequest(createApiKeyRequest),
      );

      if (!createApiKey.ok) {
        throw new Error("Could not create API Key");
      } 

      return true;
    },
  },
};

export default config;