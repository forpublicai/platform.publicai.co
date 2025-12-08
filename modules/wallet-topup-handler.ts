import { ZuploContext, ZuploRequest, environment } from "@zuplo/runtime";

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

  // Get wallet ID for this customer
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
    context.log.error(`Failed to fetch wallet from Lago: ${error}`);
    return new Response(
      JSON.stringify({
        error: {
          message: "Failed to fetch wallet information",
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

  if (!walletData.wallets || walletData.wallets.length === 0) {
    context.log.error("No wallet found for customer");
    return new Response(
      JSON.stringify({
        error: {
          message: "No wallet found for user",
          type: "not_found"
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

  const walletId = walletData.wallets[0].lago_id;
  context.log.info(`Found wallet ID: ${walletId}`);

  try {
    // Create wallet transaction (top-up)
    const topUpResponse = await fetch(
      `${environment.LAGO_API_BASE}/api/v1/wallet_transactions`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${environment.LAGO_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          wallet_transaction: {
            wallet_id: walletId,
            paid_credits: topUpData.amount.toFixed(2),
            granted_credits: "0.0",
            name: "Prepaid Top-up"
          }
        })
      }
    );

    if (!topUpResponse.ok) {
      const error = await topUpResponse.text();
      context.log.error(`Failed to create wallet transaction: Status ${topUpResponse.status}, Error: ${error}`);

      return new Response(
        JSON.stringify({
          error: {
            message: "Failed to create top-up transaction",
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

    const transactionData = await topUpResponse.json();
    context.log.info(`Wallet transaction created: ${JSON.stringify(transactionData)}`);

    // Lago returns wallet_transactions as an array, extract the first one
    const transaction = transactionData.wallet_transactions?.[0];

    if (!transaction) {
      context.log.error("No transaction returned from Lago");
      return new Response(
        JSON.stringify({
          error: {
            message: "Failed to create transaction",
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

    // Return transaction in expected format - frontend will check status (settled vs pending)
    return new Response(
      JSON.stringify({
        wallet_transaction: transaction
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  } catch (error) {
    context.log.error(`Error creating wallet transaction: ${error}`);

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
