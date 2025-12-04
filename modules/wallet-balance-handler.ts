import { ZuploContext, ZuploRequest, environment } from "@zuplo/runtime";

export default async function (
  request: ZuploRequest,
  context: ZuploContext
) {
  context.log.info("Wallet balance handler called");
  context.log.info(`Request user: ${JSON.stringify(request.user)}`);
  context.log.info(`Request headers: ${JSON.stringify([...request.headers.entries()])}`);

  // Check if user is authenticated
  if (!request.user?.sub) {
    context.log.warn("No user.sub found in request");
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

  const userId = request.user.sub;
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
