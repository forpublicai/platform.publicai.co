import { ZuploContext, ZuploRequest, environment } from "@zuplo/runtime";

export default async function (
  request: ZuploRequest,
  context: ZuploContext
) {
  context.log.info("Customer checkout URL handler called");

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

  // Look up the Zuplo consumer by querying the tag.sub
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
  const userId = consumer.name;
  context.log.info(`Found consumer: ${consumer.id}, name: ${userId} (using as Lago external_customer_id)`);

  try {
    // Get customer checkout URL from Lago
    const checkoutUrlResponse = await fetch(
      `${environment.LAGO_API_BASE}/api/v1/customers/${userId}/checkout_url`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${environment.LAGO_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    if (!checkoutUrlResponse.ok) {
      const error = await checkoutUrlResponse.text();
      context.log.error(`Failed to get checkout URL: Status ${checkoutUrlResponse.status}, Error: ${error}`);

      return new Response(
        JSON.stringify({
          error: {
            message: "Failed to generate checkout URL",
            type: "api_error",
            details: error
          }
        }),
        {
          status: checkoutUrlResponse.status,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    const checkoutData = await checkoutUrlResponse.json();
    context.log.info(`Checkout URL generated: ${JSON.stringify(checkoutData)}`);

    return new Response(
      JSON.stringify(checkoutData),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  } catch (error) {
    context.log.error(`Error generating checkout URL: ${error}`);

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
