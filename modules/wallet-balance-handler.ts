import { ZuploContext, ZuploRequest, environment } from "@zuplo/runtime";

export default async function (
  request: ZuploRequest,
  context: ZuploContext
) {
  // Check if user is authenticated
  if (!request.user?.sub) {
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
      context.log.error(`Failed to fetch wallet balance: ${error}`);

      return new Response(
        JSON.stringify({
          error: {
            message: "Failed to fetch wallet balance",
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

    const walletData = await checkWalletResponse.json();

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
