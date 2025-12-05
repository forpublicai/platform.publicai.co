import {ZuploContext, ZuploRequest, environment} from "@zuplo/runtime";
import { provisionCustomer } from "./customer-provisioning";

export default async function (
  request: ZuploRequest,
  context: ZuploContext
) {
  const body = await request.json();
  
  context.log.info(`User data: ${JSON.stringify(request.user?.data)}`);
  
  if (!request.user?.sub) {
    context.log.warn("No user.sub found, user field not added to body");
    return new ZuploRequest(request, { body: JSON.stringify(body) });
  }

  const userId = request.user.sub;
  body.user = userId;
  context.log.info(`Added user: ${userId} to request body`);

  // Check if subscription exists FIRST 
  const checkSubscriptionResponse = await fetch(
    `${environment.LAGO_API_BASE}/api/v1/subscriptions?external_customer_id=${userId}&status=active`,
    {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${environment.LAGO_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  let hasActiveSubscription = false;
  if (checkSubscriptionResponse.ok) {
    const subscriptions = await checkSubscriptionResponse.json();
    hasActiveSubscription = subscriptions.subscriptions && subscriptions.subscriptions.length > 0;
    context.log.info(`Active subscription exists: ${hasActiveSubscription}`);
  }

  // For users with active subscriptions, check wallet balance
  if (hasActiveSubscription) {
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

    if (checkWalletResponse.ok) {
      const walletData = await checkWalletResponse.json();
      
      if (walletData.wallets && walletData.wallets.length > 0) {
        const wallet = walletData.wallets[0];
        const creditsBalance = parseFloat(wallet.credits_ongoing_balance || "0");

        if (creditsBalance <= 0.10) {
          context.log.warn(`User ${userId} has low wallet balance: $${creditsBalance.toFixed(2)} (≤ $0.10)`);
          return new Response(
            JSON.stringify({
              error: {
                message: "Insufficient wallet balance. Please add credits to your account.",
                type: "insufficient_balance",
                current_balance: creditsBalance.toFixed(2)
              }
            }),
            {
              status: 402,
              headers: {
                "Content-Type": "application/json"
              }
            }
          );
        } else {
          context.log.info(`User ${userId} has sufficient wallet balance: $${creditsBalance.toFixed(2)}`);
        }
      } else {
        context.log.warn(`User ${userId} has active subscription but no wallet found`);
      }
    } else {
      const error = await checkWalletResponse.text();
      context.log.error(`Failed to check wallet balance: ${error}`);
    }
  }
  // Only provision customer if we need to create customer/subscription
  else {
    context.log.info(`No active subscription found, provisioning customer: ${userId}`);
    await provisionCustomer(userId, context);
  }
  
  // Create new request with modified body and LiteLLM auth
  const newRequest = new ZuploRequest(request, {
    body: JSON.stringify(body)
  });
  
  if (environment.LITELLM_DEVELOPER_API_KEY) {
    newRequest.headers.set("Authorization", `Bearer ${environment.LITELLM_DEVELOPER_API_KEY}`);
  }
  
  return newRequest;
}