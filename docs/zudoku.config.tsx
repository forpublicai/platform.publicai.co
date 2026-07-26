import "./styles/theme.css";
import type { ZudokuConfig } from "zudoku";
import { accountPlugin } from "./src/accountPlugin";
import { createApiKey } from "./src/apiKeyHandlers";

const config: ZudokuConfig = {
  plugins: [accountPlugin],
  site: {
    title: "",
    logo: {
      src: {
        light: "/public-ai-inference-utility-logo.svg",
        dark: "/public-ai-inference-utility-logo.svg",
      },
      alt: "Public AI Inference Utility",
      width: "180px",
    },
    footer: {
      position: "start",
      columns: [
        {
          title: "Public AI",
          links: [
            { label: "Website", href: "https://publicai.co" },
            { label: "Chat", href: "https://chat.publicai.co" },
            { label: "GitHub", href: "https://github.com/forpublicai" },
            { label: "Get Involved", href: "https://publicai.co/contributing" },
          ],
        },
        {
          title: "Legal",
          links: [
            { label: "Terms & Privacy", href: "https://publicai.co/tc" },
          ],
        },
      ],
      social: [
        { icon: "github", href: "https://github.com/forpublicai" },
      ],
      copyright: `© ${new Date().getFullYear()} Public AI Inference Utility. All rights reserved.`,
    },
  },
  metadata: {
    title: "Public AI Gateway - Developer Portal",
    description: "Access open-source AI models through our unified gateway. Documentation, API reference, and tools for developers.",
  },
  theme: {
    fonts: {
      sans: {
        url: "https://fonts.googleapis.com/css2?family=Public+Sans:wght@300;400;500;600&display=swap",
        fontFamily: "Public Sans",
      },
      mono: {
        url: "https://fonts.googleapis.com/css2?family=Overpass+Mono:wght@400&display=swap",
        fontFamily: "Overpass Mono",
      },
    },
    light: {
      background: "#FFFFFF",
      foreground: "#000000",
      card: "#FFFFFF",
      cardForeground: "#000000",
      primary: "#EF3C24",
      primaryForeground: "#FFFFFF",
      secondary: "#F7F7F7",
      secondaryForeground: "#000000",
      muted: "#F7F7F7",
      mutedForeground: "#000000",
      accent: "#F7F7F7",
      accentForeground: "#000000",
      destructive: "#EF3C24",
      destructiveForeground: "#FFFFFF",
      border: "#D9D9D9",
      input: "#D9D9D9",
      ring: "#EF3C24",
      radius: "0.625rem",
    },
    dark: {
      background: "#000000",
      foreground: "#FFFFFF",
      card: "#111111",
      cardForeground: "#FFFFFF",
      primary: "#EF3C24",
      primaryForeground: "#FFFFFF",
      secondary: "#1a1a1a",
      secondaryForeground: "#FFFFFF",
      muted: "#1a1a1a",
      mutedForeground: "#FFFFFF",
      accent: "#1a1a1a",
      accentForeground: "#FFFFFF",
      destructive: "#FE6550",
      destructiveForeground: "#FFFFFF",
      border: "#555555",
      input: "#555555",
      ring: "#EF3C24",
      radius: "0.625rem",
    },
  },
  navigation: [
    {
      type: "category",
      label: "Docs",
      icon: "book",
      items: [
        { type: "doc", file: "docs", label: "Quick Start" },
        { type: "doc", file: "models", label: "Available Models" },
        { type: "doc", file: "plans", label: "Plans & Rate Limits" },
        { type: "doc", file: "inference-partners-faq", label: "Inference Partners FAQ" },
        { type: "doc", file: "support-us", label: "Support Us" },
      ],
    },
    {
      type: "link",
      to: "/api",
      label: "API Reference",
      icon: "code",
    },
    {
      type: "category",
      label: "Account",
      icon: "user",
      items: [
        { type: "link", to: "/account/billing", label: "Billing" },
        { type: "link", to: "/settings/api-keys", label: "API Keys" },
      ],
    },
  ],
  redirects: [
    { from: "/", to: "/docs" },
    { from: "/account", to: "/account/billing" },
    { from: "/billing", to: "/account/billing" },
    { from: "/account/api-keys", to: "/settings/api-keys" },
  ],
  apis: [
    {
      type: "file",
      input: "../config/routes.oas.json",
      path: "api",
      options: {
        disablePlayground: true,
      },
    },
  ],
  authentication: {
    type: "auth0",
    domain: "login.publicai.co",
    clientId: "GsHpOedTKzJpnKlQIIeXDBKjssyOmOsj",
    audience: "https://docs.publicai.company/api",
    redirectToAfterSignIn: "/account/billing",
    redirectToAfterSignUp: "/account/billing",
    protectedRoutes: ["/account/billing", "/settings/api-keys"],
  },
  apiKeys: {
    enabled: true,
    deploymentName: process.env.ZUPLO_PUBLIC_DEPLOYMENT_NAME,
    createKey: createApiKey,
  },
};

export default config;
