import { ZuploContext, ZuploRequest, environment } from "@zuplo/runtime";

export default async function (
  request: ZuploRequest,
  context: ZuploContext
) {
  context.log.info("Wallet balance handler called");
  context.log.info(`Request URL: ${request.url}`);
  context.log.info(`Request headers: ${JSON.stringify([...request.headers.entries()])}`);

  // Get userId from query parameter
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");

  if (!userId) {
    context.log.warn("No userId provided in query parameters");
    return new Response(
      JSON.stringify({
        error: {
          message: "userId query parameter is required",
          type: "bad_request"
        }
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  context.log.info(`Fetching wallet for user: ${userId}`);

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
