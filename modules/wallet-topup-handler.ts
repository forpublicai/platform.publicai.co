import { ZuploContext, ZuploRequest, environment } from "@zuplo/runtime";
import { topUpWallet } from "./wallet-topup";

interface TopUpRequest {
  amount: number;
}

export default async function (
  request: ZuploRequest,
  context: ZuploContext
) {
  context.log.info("Wallet top-up handler called");

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

  // Parse request body
  let topUpData: TopUpRequest;
  try {
    topUpData = await request.json();
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: {
          message: "Invalid request body",
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

  if (!topUpData.amount || topUpData.amount <= 0) {
    return new Response(
      JSON.stringify({
        error: {
          message: "Amount must be greater than 0",
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

  // Use shared wallet top-up helper
  const result = await topUpWallet(userId, topUpData.amount, context);

  if (!result.success) {
    const statusCode = result.error?.includes("No wallet found") ? 404 : 500;
    return new Response(
      JSON.stringify({
        error: {
          message: result.error || "Failed to top up wallet",
          type: statusCode === 404 ? "not_found" : "api_error"
        }
      }),
      {
        status: statusCode,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  // Return transaction in expected format - frontend will check status (settled vs pending)
  return new Response(
    JSON.stringify({
      wallet_transaction: result.transaction
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}
