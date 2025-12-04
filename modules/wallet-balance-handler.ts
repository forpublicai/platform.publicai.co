import { ZuploContext, ZuploRequest, environment } from "@zuplo/runtime";

export default async function (
  request: ZuploRequest,
  context: ZuploContext
) {
  context.log.info("Wallet balance handler called");
  context.log.info(`Request URL: ${request.url}`);
  context.log.info(`Request user: ${JSON.stringify(request.user)}`);
  context.log.info(`Request headers: ${JSON.stringify([...request.headers.entries()])}`);

  // Check if user is authenticated via JWT
  if (!request.user?.sub) {
    context.log.warn("No user.sub found in request - authentication failed");
    return new Response(
      JSON.stringify({
        error: {
          message: "Authentication required",
          type: "unauthorized"
        }
      }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  const authSub = request.user.sub;
  context.log.info(`Authenticated user sub: ${authSub}`);

  // Look up the Zuplo consumer by querying the tag.sub (Auth0 sub is stored in tags.sub)
  // The consumer's "name" field is what we use as the Lago external_customer_id
  const checkConsumerResponse = await fetch(
    `https://dev.zuplo.com/v1/accounts/${environment.ZP_ACCOUNT_NAME}/key-buckets/${environment.ZP_API_KEY_SERVICE_BUCKET_NAME}/consumers?tag.sub=${encodeURIComponent(authSub)}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${environment.ZP_DEVELOPER_API_KEY}`,
      },
    }
  );

  if (!checkConsumerResponse.ok) {
    context.log.error("Failed to look up consumer from Zuplo");
    return new Response(
      JSON.stringify({
        error: {
          message: "Failed to look up user account",
          type: "api_error"
        }
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  const consumersData = await checkConsumerResponse.json();

  if (!consumersData.data || consumersData.data.length === 0) {
    context.log.warn(`No consumer found with tag.sub = ${authSub}`);
    return new Response(
      JSON.stringify({
        error: {
          message: "User account not found. Please create an API key first.",
          type: "user_not_found"
        }
      }),
      {
        status: 404,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  const consumer = consumersData.data[0];
  const userId = consumer.name; // This is the UUID used in Lago (e.g., "3f2428ef-d2ec-460b-b5d3-eaf027432ce0")
  context.log.info(`Found consumer: ${consumer.id}, name: ${userId} (using as Lago external_customer_id)`);

  try {
    // Fetch wallet balance from Lago API
    const checkWalletResponse = await fetch(
      `${environment.LAGO_API_BASE}/api/v1/wallets?external_customer_id=${userId}`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${environment.LAGO_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    if (!checkWalletResponse.ok) {
      const error = await checkWalletResponse.text();
      context.log.error(`Failed to fetch wallet balance from Lago: Status ${checkWalletResponse.status}, Error: ${error}`);

      return new Response(
        JSON.stringify({
          error: {
            message: "Failed to fetch wallet balance",
            type: "api_error",
            details: error
          }
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    const walletData = await checkWalletResponse.json();
    context.log.info(`Wallet data retrieved: ${JSON.stringify(walletData)}`);

    // Return wallet data
    return new Response(
      JSON.stringify(walletData),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  } catch (error) {
    context.log.error(`Error fetching wallet balance: ${error}`);

    return new Response(
      JSON.stringify({
        error: {
          message: "Internal server error",
          type: "server_error"
        }
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }
}
