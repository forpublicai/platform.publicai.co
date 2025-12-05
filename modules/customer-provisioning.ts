import { ZuploContext, environment } from "@zuplo/runtime";

export interface ProvisionCustomerResult {
  success: boolean;
  userId: string;
  error?: string;
}

/**
 * Provisions a complete customer setup in Lago including:
 * - Customer record
 * - Wallet with $10 welcome credits
 * - Pay-as-you-go subscription
 *
 * @param userId - The external customer ID (UUID)
 * @param context - Zuplo context for logging
 * @returns Promise with provisioning result
 */
export async function provisionCustomer(
  userId: string,
  context: ZuploContext
): Promise<ProvisionCustomerResult> {
  try {
    // Get consumer details from Zuplo
    const getConsumerResponse = await fetch(
      `https://dev.zuplo.com/v1/accounts/${environment.ZP_ACCOUNT_NAME}/key-buckets/${environment.ZP_API_KEY_SERVICE_BUCKET_NAME}/consumers/${userId}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${environment.ZP_DEVELOPER_API_KEY}`,
        },
      }
    );

    if (!getConsumerResponse.ok) {
      const error = "Failed to get consumer from Zuplo";
      context.log.error(error);
      return { success: false, userId, error };
    }

    const consumerResponse = await getConsumerResponse.json();
    const userEmail = consumerResponse.tags?.email;
    const userName = consumerResponse.name || userId;

    context.log.info(`Consumer email: ${userEmail}, name: ${userName}`);

    // Create customer
    const createCustomerResponse = await fetch(
      `${environment.LAGO_API_BASE}/api/v1/customers`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${environment.LAGO_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          customer: {
            external_id: userId,
            name: userName,
            email: userEmail || `${userId}@placeholder.com`,
            billing_configuration: {
              payment_provider: "stripe",
              payment_provider_code: environment.STRIPE_PAYMENT_PROVIDER_CODE || "stripe_test",
              sync_with_provider: true,
              sync: true
            }
          }
        })
      }
    );

    if (!createCustomerResponse.ok) {
      const error = await createCustomerResponse.text();
      context.log.error(`Failed to create Lago customer: ${error}`);
      return { success: false, userId, error: `Failed to create customer: ${error}` };
    }

    context.log.info(`Created Lago customer: ${userId}`);

    // Create wallet with $10 USD in credits
    const createWalletResponse = await fetch(
      `${environment.LAGO_API_BASE}/api/v1/wallets`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${environment.LAGO_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          wallet: {
            external_customer_id: userId,
            name: "Welcome Credits",
            rate_amount: "1.0",
            currency: "USD",
            granted_credits: "10.0"
          }
        })
      }
    );

    if (createWalletResponse.ok) {
      const wallet = await createWalletResponse.json();
      context.log.info(`Created Lago wallet with $10 credits: ${wallet.wallet?.lago_id}`);
    } else {
      const error = await createWalletResponse.text();
      context.log.error(`Failed to create Lago wallet: ${error}`);
      // Continue even if wallet creation fails
    }

    // Create subscription
    const createSubscriptionResponse = await fetch(
      `${environment.LAGO_API_BASE}/api/v1/subscriptions`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${environment.LAGO_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          subscription: {
            external_customer_id: userId,
            external_id: userId,
            plan_code: "pay_as_you_go"
          }
        })
      }
    );

    if (createSubscriptionResponse.ok) {
      const subscription = await createSubscriptionResponse.json();
      context.log.info(`Created Lago subscription: ${subscription.subscription?.lago_id}`);
    } else {
      const error = await createSubscriptionResponse.text();
      context.log.error(`Failed to create Lago subscription: ${error}`);
      // Continue even if subscription creation fails
    }

    return { success: true, userId };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.log.error(`Error provisioning customer: ${errorMessage}`);
    return { success: false, userId, error: errorMessage };
  }
}
