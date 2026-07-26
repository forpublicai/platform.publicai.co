import type { UseAuthReturn } from "zudoku/hooks";

type CreateApiKeyContext = {
  signRequest: (request: Request) => Promise<Request>;
};

type CreateApiKeyArgs = {
  apiKey: { description: string; expiresOn?: string };
  context: CreateApiKeyContext;
  auth: UseAuthReturn;
};

export const createApiKey = async ({ apiKey, context, auth }: CreateApiKeyArgs) => {
  const serverUrl =
    process.env.ZUPLO_PUBLIC_SERVER_URL ||
    import.meta.env.ZUPLO_SERVER_URL ||
    window.location.origin;

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

  const signedRequest = await context.signRequest(createApiKeyRequest);
  const response = await fetch(signedRequest);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error("Could not create API Key: " + errorText);
  }

  return true;
};
