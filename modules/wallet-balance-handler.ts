import { ZuploContext, ZuploRequest, environment } from "@zuplo/runtime";
import { provisionCustomer } from "./customer-provisioning";

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
    let checkWalletResponse = await fetch(
      `${environment.LAGO_API_BASE}/api/v1/wallets?external_customer_id=${userId}`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${environment.LAGO_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    // If customer not found (404), provision them
    if (checkWalletResponse.status === 404) {
      context.log.info(`Customer ${userId} not found in Lago, provisioning...`);

      const provisionResult = await provisionCustomer(userId, context);

      if (!provisionResult.success) {
        context.log.error(`Failed to provision customer: ${provisionResult.error}`);
        return new Response(
          JSON.stringify({
            error: {
              message: "Failed to provision customer account",
              type: "provisioning_error",
              details: provisionResult.error
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

      context.log.info(`Customer ${userId} provisioned successfully, fetching wallet data...`);

      // Retry fetching wallet after provisioning
      checkWalletResponse = await fetch(
        `${environment.LAGO_API_BASE}/api/v1/wallets?external_customer_id=${userId}`,
        {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${environment.LAGO_API_KEY}`,
            "Content-Type": "application/json"
          }
        }
      );
    }

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

    // Check Stripe for payment methods
    let hasPaymentMethod = false;
    try {
      // First, search for the Stripe customer by name (userId is set as the customer name)
      const searchQuery = `name:'${userId}'`;
      const searchResponse = await fetch(
        `https://api.stripe.com/v1/customers/search?query=${encodeURIComponent(searchQuery)}`,
        {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${environment.STRIPE_API_KEY}`,
          }
        }
      );

      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        if (searchData.data && searchData.data.length > 0) {
          const stripeCustomerId = searchData.data[0].id;
          context.log.info(`Found Stripe customer: ${stripeCustomerId}`);

          // Now fetch payment methods for this customer
          const paymentMethodsResponse = await fetch(
            `https://api.stripe.com/v1/customers/${stripeCustomerId}/payment_methods?type=card`,
            {
              method: "GET",
              headers: {
                "Authorization": `Bearer ${environment.STRIPE_API_KEY}`,
              }
            }
          );

          if (paymentMethodsResponse.ok) {
            const paymentMethodsData = await paymentMethodsResponse.json();
            hasPaymentMethod = paymentMethodsData.data && paymentMethodsData.data.length > 0;
            context.log.info(`Customer has ${paymentMethodsData.data?.length || 0} payment method(s)`);
          } else {
            context.log.warn(`Failed to fetch payment methods from Stripe`);
          }
        } else {
          context.log.warn(`No Stripe customer found with name: ${userId}`);
        }
      } else {
        const errorText = await searchResponse.text();
        context.log.warn(`Failed to search Stripe customers: ${errorText}`);
      }
    } catch (error) {
      context.log.warn(`Error checking payment method: ${error}`);
    }

    // Fetch current usage from Lago
    let currentUsage = null;
    try {
      const usageResponse = await fetch(
        `${environment.LAGO_API_BASE}/api/v1/customers/${userId}/current_usage?external_subscription_id=${userId}`,
        {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${environment.LAGO_API_KEY}`,
            "Content-Type": "application/json"
          }
        }
      );

      if (usageResponse.ok) {
        const usageData = await usageResponse.json();
        currentUsage = usageData;
        context.log.info(`Retrieved current usage data`);
      } else {
        context.log.warn(`Failed to fetch current usage: ${usageResponse.status}`);
      }
    } catch (error) {
      context.log.warn(`Error fetching current usage: ${error}`);
    }

    // Fetch wallet transactions from Lago
    let walletTransactions = [];
    if (walletData.wallets && walletData.wallets.length > 0) {
      const walletId = walletData.wallets[0].lago_id;
      context.log.info(`Fetching transactions for wallet ID: ${walletId}`);

      try {
        const transactionsResponse = await fetch(
          `${environment.LAGO_API_BASE}/api/v1/wallets/${walletId}/wallet_transactions?per_page=20&page=1`,
          {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${environment.LAGO_API_KEY}`,
              "Content-Type": "application/json"
            }
          }
        );

        if (transactionsResponse.ok) {
          const transactionsData = await transactionsResponse.json();
          walletTransactions = transactionsData.wallet_transactions || [];
          context.log.info(`Retrieved ${walletTransactions.length} wallet transactions`);
        } else {
          context.log.warn(`Failed to fetch wallet transactions`);
        }
      } catch (error) {
        context.log.warn(`Error fetching wallet transactions: ${error}`);
      }
    }

    // Return consolidated wallet data
    return new Response(
      JSON.stringify({
        ...walletData,
        hasPaymentMethod,
        wallet_transactions: walletTransactions,
        current_usage: currentUsage
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  } catch (error) {
    context.log.error(`Error fetching wallet data: ${error}`);

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
