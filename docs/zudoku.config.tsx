import type { ZudokuConfig } from "zudoku";

const config: ZudokuConfig = {
  site: {
    title: "Public AI Gateway",
    logo: {
      src: {
        light: "https://app.publicai.company/static/favicon.png",
        dark: "https://app.publicai.company/static/favicon.png",
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
              file: "example",
              label: "Quick Start Guide",
            }
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
              label: "GitHub",
              to: "https://github.com/publicai",
            },
            {
              type: "link",
              label: "Swiss AI",
              to: "https://www.swissai.cscs.ch",
            },
            {
              type: "doc",
              file: "inference-partners-faq",
              label: "Inference Partners FAQ",
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
  ],
  redirects: [{ from: "/", to: "/example" }],
  apis: [
    {
      type: "file",
      input: "../config/routes.oas.json",
      path: "api",
    },
  ],
  authentication: {
    // IMPORTANT: This is a demo Auth0 configuration.
    // In a real application, you should replace these values with your own
    // identity provider's configuration.
    // This configuration WILL NOT WORK with custom domains.
    // For more information, see:
    // https://zuplo.com/docs/dev-portal/zudoku/configuration/authentication
    type: "auth0",
    domain: "login.publicai.company",
    clientId: "GsHpOedTKzJpnKlQIIeXDBKjssyOmOsj",
    audience: "https://platform.publicai.company/api",
  },
  // authentication: {
  //   type: "supabase",
  //   provider: "google", // or any supported provider
  //   supabaseUrl: "https://gyokusiqtjaeofzkkkkd.supabase.co",
  //   supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5b2t1c2lxdGphZW9memtra2tkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyNDcxNzcsImV4cCI6MjA3MDgyMzE3N30.4uxPtnWPAX8_0E8_q45ZfEWzQZ0ZKoiwwyeQYKXrkwQ",
  //   redirectToAfterSignUp: "/",
  //   redirectToAfterSignIn: "/",
  //   redirectToAfterSignOut: "/",
  // },
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