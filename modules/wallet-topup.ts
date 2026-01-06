import { ZuploContext, environment } from "@zuplo/runtime";

export interface WalletTopUpResult {
  success: boolean;
  transaction?: any;
  error?: string;
  newBalance?: number;
}

/**
 * Adds credits to a user's wallet in Lago
 * @param userId - The Lago external_customer_id
 * @param amount - The amount to add in credits
 * @param context - The Zuplo context for logging
 * @returns Result object with success status and transaction details
 */
export async function topUpWallet(
  userId: string,
  amount: number,
  context: ZuploContext
): Promise<WalletTopUpResult> {
  context.log.info(`Attempting to top up wallet for user ${userId} with amount $${amount.toFixed(2)}`);

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
    return {
      success: false,
      error: `Failed to fetch wallet information: ${error}`
    };
  }

  const walletData = await checkWalletResponse.json();

  if (!walletData.wallets || walletData.wallets.length === 0) {
    context.log.error("No wallet found for customer");
    return {
      success: false,
      error: "No wallet found for user"
    };
  }

  const wallet = walletData.wallets[0];
  const walletId = wallet.lago_id;
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
            paid_credits: amount.toFixed(2),
            granted_credits: "0.0",
            name: "Prepaid Top-up"
          }
        })
      }
    );

    if (!topUpResponse.ok) {
      const error = await topUpResponse.text();
      context.log.error(`Failed to create wallet transaction: Status ${topUpResponse.status}, Error: ${error}`);
      return {
        success: false,
        error: `Failed to create top-up transaction: ${error}`
      };
    }

    const transactionData = await topUpResponse.json();
    context.log.info(`Wallet transaction created: ${JSON.stringify(transactionData)}`);

    const transaction = transactionData.wallet_transactions?.[0];

    if (!transaction) {
      context.log.error("No transaction returned from Lago");
      return {
        success: false,
        error: "No transaction returned from Lago"
      };
    }

    const currentBalance = parseFloat(wallet.credits_ongoing_balance || "0");
    const newBalance = currentBalance + amount;

    return {
      success: true,
      transaction,
      newBalance
    };
  } catch (error) {
    context.log.error(`Error creating wallet transaction: ${error}`);
    return {
      success: false,
      error: `Internal error: ${error}`
    };
  }
}
