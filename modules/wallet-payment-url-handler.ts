import { ZuploContext, ZuploRequest, environment } from "@zuplo/runtime";

export default async function (
  request: ZuploRequest,
  context: ZuploContext
) {
  context.log.info("Wallet payment URL handler called");

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

  // Get transaction ID from URL path
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const transactionId = pathParts[pathParts.length - 2]; // /v1/developer/wallet/transactions/{id}/payment-url

  if (!transactionId) {
    return new Response(
      JSON.stringify({
        error: {
          message: "Transaction ID is required",
          type: "validation_error"
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

  context.log.info(`Getting payment URL for transaction: ${transactionId}`);

  try {
    // Get payment URL from Lago
    const paymentUrlResponse = await fetch(
      `${environment.LAGO_API_BASE}/api/v1/wallet_transactions/${transactionId}/payment_url`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${environment.LAGO_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    if (!paymentUrlResponse.ok) {
      const error = await paymentUrlResponse.text();
      context.log.error(`Failed to get payment URL: Status ${paymentUrlResponse.status}, Error: ${error}`);

      return new Response(
        JSON.stringify({
          error: {
            message: "Failed to generate payment URL",
            type: "api_error",
            details: error
          }
        }),
        {
          status: paymentUrlResponse.status,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    const paymentData = await paymentUrlResponse.json();
    context.log.info(`Payment URL generated: ${JSON.stringify(paymentData)}`);

    return new Response(
      JSON.stringify(paymentData),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  } catch (error) {
    context.log.error(`Error generating payment URL: ${error}`);

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
