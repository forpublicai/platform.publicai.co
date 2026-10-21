import {ZuploContext, ZuploRequest, environment} from "@zuplo/runtime";
import { provisionCustomer } from "./customer-provisioning";
import { topUpWallet } from "./wallet-topup";

// Auto top-up configuration - parsed from environment variable
// Format: "userId:threshold:topupAmount,userId2:threshold:topupAmount"
// Example: "abc-123:70:10,def-456:50:20"
const AUTO_TOPUP_USERS = new Map<string, { threshold: number; topupAmount: number }>();

if (environment.AUTO_TOPUP_CONFIG) {
  const configs = environment.AUTO_TOPUP_CONFIG.split(',');
  configs.forEach(config => {
    const [userId, threshold, topupAmount] = config.split(':');
    if (userId && threshold && topupAmount) {
      AUTO_TOPUP_USERS.set(userId.trim(), {
        threshold: parseFloat(threshold),
        topupAmount: parseFloat(topupAmount)
      });
    }
  });
}

// ============================================================================
// IN-MEMORY BOUNDED TTL CACHE TO PROTECT THE HOT PATH
// ============================================================================

// 1. Subscription ID Cache (TTL: 10 minutes, Max entries: 5,000 ~1MB)
const SUBSCRIPTION_CACHE = new Map<string, { subscriptionId: string; expiresAt: number }>();
const SUBSCRIPTION_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_SUBSCRIPTION_CACHE_ENTRIES = 5000;

function getCachedSubscription(userId: string): string | null {
  const entry = SUBSCRIPTION_CACHE.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    SUBSCRIPTION_CACHE.delete(userId);
    return null;
  }
  return entry.subscriptionId;
}

function setCachedSubscription(userId: string, subscriptionId: string): void {
  if (SUBSCRIPTION_CACHE.size >= MAX_SUBSCRIPTION_CACHE_ENTRIES) {
    const oldestKey = SUBSCRIPTION_CACHE.keys().next().value;
    if (oldestKey) SUBSCRIPTION_CACHE.delete(oldestKey);
  }
  SUBSCRIPTION_CACHE.set(userId, {
    subscriptionId,
    expiresAt: Date.now() + SUBSCRIPTION_CACHE_TTL_MS
  });
}

// 2. Wallet Balance Cache for users with healthy balances (TTL: 20 seconds, Max entries: 5,000 ~1MB)
// Users with balance > $1.00 are cached for 20s to absorb rapid parallel LLM requests / tool calling.
// Users near depletion (<= $0.50) always bypass the cache for real-time verification.
const WALLET_BALANCE_CACHE = new Map<string, { balance: number; expiresAt: number }>();
const WALLET_CACHE_TTL_MS = 20 * 1000;
const MAX_WALLET_CACHE_ENTRIES = 5000;

function getCachedWalletBalance(userId: string): number | null {
  const entry = WALLET_BALANCE_CACHE.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    WALLET_BALANCE_CACHE.delete(userId);
    return null;
  }
  return entry.balance;
}

function setCachedWalletBalance(userId: string, balance: number): void {
  // Only cache if balance is comfortably above danger zone (> $1.00)
  if (balance <= 1.0) {
    WALLET_BALANCE_CACHE.delete(userId);
    return;
  }
  if (WALLET_BALANCE_CACHE.size >= MAX_WALLET_CACHE_ENTRIES) {
    const oldestKey = WALLET_BALANCE_CACHE.keys().next().value;
    if (oldestKey) WALLET_BALANCE_CACHE.delete(oldestKey);
  }
  WALLET_BALANCE_CACHE.set(userId, {
    balance,
    expiresAt: Date.now() + WALLET_CACHE_TTL_MS
  });
}

/**
 * Resolves the effective Zuplo consumer ID (UUID) for a request.
 * If the incoming user.sub is an Auth0 ID (e.g. auth0|...), look up the consumer by tag.sub.
 */
async function resolveConsumerId(sub: string, context: ZuploContext): Promise<string> {
  if (!sub.startsWith("auth0|") && !sub.startsWith("google-oauth2|")) {
    return sub;
  }

  try {
    const checkConsumerResponse = await fetch(
      `https://dev.zuplo.com/v1/accounts/${environment.ZP_ACCOUNT_NAME}/key-buckets/${environment.ZP_API_KEY_SERVICE_BUCKET_NAME}/consumers?tag.sub=${encodeURIComponent(sub)}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${environment.ZP_DEVELOPER_API_KEY}`,
        },
      }
    );

    if (checkConsumerResponse.ok) {
      const consumersData = await checkConsumerResponse.json();
      if (consumersData.data && consumersData.data.length > 0) {
        const consumer = consumersData.data[0];
        context.log.info(`Resolved Auth0 sub ${sub} to Zuplo consumer name: ${consumer.name}`);
        return consumer.name;
      }
    }
  } catch (err) {
    context.log.warn(`Error resolving consumer ID for sub ${sub}: ${err}`);
  }

  return sub;
}

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

  const rawSub = request.user.sub;
  const userId = await resolveConsumerId(rawSub, context);
  body.user = userId;
  context.log.info(`Added user: ${userId} to request body`);

  let subscriptionId = getCachedSubscription(userId);
  let hasActiveSubscription = subscriptionId !== null;

  // Check if wallet balance is cached
  let cachedBalance = getCachedWalletBalance(userId);

  // COLD PATH: If subscription not in cache, query subscription and wallet in PARALLEL
  if (!hasActiveSubscription) {
    context.log.info(`Subscription cache miss for user ${userId}, checking Lago...`);

    const [subscriptionRes, walletRes] = await Promise.all([
      fetch(
        `${environment.LAGO_API_BASE}/api/v1/subscriptions?external_customer_id=${userId}&status=active`,
        {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${environment.LAGO_API_KEY}`,
            "Content-Type": "application/json"
          }
        }
      ),
      fetch(
        `${environment.LAGO_API_BASE}/api/v1/wallets?external_customer_id=${userId}`,
        {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${environment.LAGO_API_KEY}`,
            "Content-Type": "application/json"
          }
        }
      )
    ]);

    if (subscriptionRes.ok) {
      const subscriptions = await subscriptionRes.json();
      hasActiveSubscription = subscriptions.subscriptions && subscriptions.subscriptions.length > 0;
      if (hasActiveSubscription && subscriptions.subscriptions[0]) {
        subscriptionId = subscriptions.subscriptions[0].external_id;
        setCachedSubscription(userId, subscriptionId);
        context.log.info(`Active subscription found: ${subscriptionId} (cached)`);
      }
    }

    // Process parallel wallet result if available
    if (walletRes.ok) {
      const walletData = await walletRes.json();
      const activeWallet = walletData.wallets?.find((w: any) => w.status === "active");
      if (activeWallet) {
        cachedBalance = parseFloat(activeWallet.credits_ongoing_balance || "0");
        setCachedWalletBalance(userId, cachedBalance);
      }
    }
  }

  // SELF-HEALING / PROVISIONING: If still no active subscription, provision customer & subscription
  if (!hasActiveSubscription) {
    context.log.info(`No active subscription found for user ${userId}, provisioning/self-healing...`);
    const provisionResult = await provisionCustomer(userId, context);
    if (provisionResult.success) {
      subscriptionId = userId;
      hasActiveSubscription = true;
      setCachedSubscription(userId, subscriptionId);
      context.log.info(`Provisioned customer & subscription successfully for user ${userId}, subscription_id: ${subscriptionId}`);
    } else {
      context.log.warn(`Provisioning attempt finished with result: ${provisionResult.error}`);
    }
  }

  // WALLET ENFORCEMENT ON HOT PATH
  if (hasActiveSubscription) {
    let creditsBalance = cachedBalance;

    // If wallet balance was not in cache, fetch it now
    if (creditsBalance === null) {
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
        const activeWallet = walletData.wallets?.find((w: any) => w.status === "active");
        if (activeWallet) {
          creditsBalance = parseFloat(activeWallet.credits_ongoing_balance || "0");
          setCachedWalletBalance(userId, creditsBalance);
        } else {
          context.log.warn(`User ${userId} has active subscription but no active wallet found`);
          creditsBalance = 0;
        }
      } else {
        const error = await checkWalletResponse.text();
        context.log.error(`Failed to check wallet balance: ${error}`);
      }
    }

    if (creditsBalance !== null) {
      // Check for auto top-up eligibility
      const autoTopupConfig = AUTO_TOPUP_USERS.get(userId);
      if (autoTopupConfig && creditsBalance < autoTopupConfig.threshold) {
        context.log.info(`Auto top-up triggered for user ${userId}: balance $${creditsBalance.toFixed(2)} < threshold $${autoTopupConfig.threshold}`);

        const topupResult = await topUpWallet(
          userId,
          autoTopupConfig.topupAmount,
          context,
          "Auto top-up. Credits purchased",
          false
        );

        if (topupResult.success && topupResult.newBalance !== undefined) {
          creditsBalance = topupResult.newBalance;
          setCachedWalletBalance(userId, creditsBalance);
          context.log.info(`Successfully topped up $${autoTopupConfig.topupAmount} for user ${userId}. New balance: $${creditsBalance.toFixed(2)}`);
        } else {
          context.log.error(`Failed to auto top-up wallet for user ${userId}: ${topupResult.error}`);
        }
      }

      // Hard block on depleted balance (<= $0.10)
      if (creditsBalance <= 0.10) {
        context.log.warn(`User ${userId} has low wallet balance: $${creditsBalance.toFixed(2)} (<= $0.10)`);
        // Invalidate cache immediately on low balance
        WALLET_BALANCE_CACHE.delete(userId);
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
    }
  }

  // Create new request with modified body and LiteLLM auth
  const newRequest = new ZuploRequest(request, {
    body: JSON.stringify(body)
  });

  if (environment.LITELLM_DEVELOPER_API_KEY) {
    newRequest.headers.set("Authorization", `Bearer ${environment.LITELLM_DEVELOPER_API_KEY}`);
  }

  // Set headers to pass user info to LiteLLM
  newRequest.headers.set("x-zuplo-user-id", userId);
  if (subscriptionId) {
    newRequest.headers.set("x-zuplo-subscription-id", subscriptionId);
    context.log.info(`Set headers - x-zuplo-user-id: ${userId}, x-zuplo-subscription-id: ${subscriptionId}`);
  } else {
    context.log.info(`Set headers - x-zuplo-user-id: ${userId}`);
  }

  return newRequest;
}
