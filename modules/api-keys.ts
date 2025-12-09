import { ZuploContext, ZuploRequest, environment } from "@zuplo/runtime";

const accountName = environment.ZP_ACCOUNT_NAME;
const bucketName = environment.ZP_API_KEY_SERVICE_BUCKET_NAME;

export default async function (request: ZuploRequest, context: ZuploContext) {
  const sub = request.user?.sub;
  const userClaims = request.user?.data;
  const body = await request.json();

  // Validate email is present
  if (!body.email) {
    return new Response(
      JSON.stringify({ error: "Email is required" }), 
      {
        status: 400,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  // Check whether consumer exists by searching for consumer with tag.sub
  const checkConsumerResponse = await fetch(
    `https://dev.zuplo.com/v1/accounts/${accountName}/key-buckets/${bucketName}/consumers?tag.sub=${encodeURIComponent(sub)}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${environment.ZP_DEVELOPER_API_KEY}`,
      },
    }
  );
  if (!checkConsumerResponse.ok) {
    return new Response(
      JSON.stringify({ error: "Failed to check existing consumers" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
  const existingConsumers = await checkConsumerResponse.json();

  // Consumer Exists - issue API key to the consumer
  if (existingConsumers.data && existingConsumers.data.length > 0) {
    const existingConsumer = existingConsumers.data[0];
    console.log(`Found existing consumer: ${existingConsumer.name} for email: ${body.email}`);
    
    const createKeyResponse = await fetch(
      `https://dev.zuplo.com/v1/accounts/${accountName}/key-buckets/${bucketName}/consumers/${existingConsumer.name}/keys`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${environment.ZP_DEVELOPER_API_KEY}`,
        },
        body: JSON.stringify({
          description: body.description ?? "API Key",
          // Add expiresOn if provided in body
          ...(body.expiresOn && { expiresOn: body.expiresOn })
        }),
      }
    );

    if (!createKeyResponse.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to create API key for existing consumer" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    const newApiKey = await createKeyResponse.json();
    console.log(`Created new API key: ${newApiKey.id} for existing consumer: ${existingConsumer.name}`);
    
    return new Response(
      JSON.stringify(newApiKey),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  


  // Consumer does not exist - create new consumer with API key
  console.log(`No existing consumer found for email: ${body.email}, creating new one`);
  const response = await fetch(
    `https://dev.zuplo.com/v1/accounts/${accountName}/key-buckets/${bucketName}/consumers?with-api-key=true`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${environment.ZP_DEVELOPER_API_KEY}`,
      },
      body: JSON.stringify({
        name: crypto.randomUUID(),
        managers: [
          { email: body.email, sub: sub },
        ],
        description: body.description ?? "API Key",
        tags: {
          sub: sub,
          email: body.email,
        },
        metadata: {
          plan: "free"
        },
      }),
    }
  );

  return response.json();
}