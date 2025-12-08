import { Head } from "zudoku/components";
import { useAuth, useZudoku } from "zudoku/hooks";
import { useEffect, useState } from "react";

interface WalletData {
  wallets: Array<{
    lago_id: string;
    external_customer_id: string;
    name: string;
    credits_ongoing_balance: string;
    currency: string;
  }>;
  hasPaymentMethod: boolean;
  payment_methods?: PaymentMethod[];
  wallet_transactions: WalletTransaction[];
  current_usage?: CurrentUsage;
}

interface PaymentMethod {
  id: string;
  type: string;
  card?: {
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
  };
}

interface WalletTransaction {
  lago_id: string;
  status: string;
  transaction_type: string;
  amount: string;
  credit_amount: string;
  created_at: string;
}

interface CurrentUsage {
  customer_usage: {
    from_datetime: string;
    to_datetime: string;
    issuing_date: string;
    currency: string;
    amount_cents: number;
    total_amount_cents: number;
    taxes_amount_cents: number;
    charges_usage: ChargeUsage[];
  };
}

interface ChargeUsage {
  units: string;
  events_count: number;
  amount_cents: number;
  amount_currency: string;
  charge: {
    lago_id: string;
    charge_model: string;
  };
  billable_metric: {
    name: string;
    code: string;
  };
  filters?: Array<{
    units: string;
    events_count: number;
    amount_cents: number;
    pricing_unit_details: string | null;
    invoice_display_name: string | null;
    values: Record<string, string[]> | null;
  }>;
  grouped_usage?: Array<any>;
}

interface ModelUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
}

export const BillingPage = () => {
  const auth = useAuth();
  const context = useZudoku();
  const [balance, setBalance] = useState<string | null>(null);
  const [totalCredits, setTotalCredits] = useState<string | null>(null);
  const [currentUsage, setCurrentUsage] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [processingTopUp, setProcessingTopUp] = useState(false);
  const [processingPaymentSetup, setProcessingPaymentSetup] = useState(false);
  const [topUpSuccess, setTopUpSuccess] = useState(false);
  const [topUpError, setTopUpError] = useState<string | null>(null);
  const [hasPaymentMethod, setHasPaymentMethod] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [deletingPaymentMethod, setDeletingPaymentMethod] = useState<string | null>(null);
  const [modelUsage, setModelUsage] = useState<ModelUsage[]>([]);

  const fetchWalletBalance = async () => {
    if (!auth.isAuthenticated) {
      setLoading(false);
      setLoadingTransactions(false);
      return;
    }

    setLoadingTransactions(true);
    try {
      const serverUrl = import.meta.env.ZUPLO_SERVER_URL || window.location.origin;
      const walletRequest = new Request(
        `${serverUrl}/v1/developer/wallet`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          }
        }
      );

      const signedRequest = await context.signRequest(walletRequest);
      const response = await fetch(signedRequest);

      // Handle API key required error
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        if (errorData.error?.type === "api_key_required") {
          // Redirect immediately to API keys page
          window.location.href = "/settings/api-keys";
          return;
        }

        throw new Error(errorData.error?.message || "Failed to fetch wallet data");
      }

      const data: WalletData = await response.json();

      // Get total credits from wallet
      let walletCredits = 0;
      if (data.wallets && data.wallets.length > 0) {
        const wallet = data.wallets[0];
        walletCredits = parseFloat(wallet.credits_balance || "0");
        setTotalCredits(walletCredits.toFixed(2));
      } else {
        setTotalCredits("0.00");
      }

      // Get current usage amount from customer_usage
      let usageAmount = 0;
      if (data.current_usage?.customer_usage?.amount_cents) {
        usageAmount = data.current_usage.customer_usage.amount_cents / 100;
        setCurrentUsage(usageAmount);
      } else {
        setCurrentUsage(0);
      }

      // Calculate remaining balance = total credits - current usage
      const remainingBalance = walletCredits - usageAmount;
      setBalance(remainingBalance.toFixed(2));

      // Set payment method status and methods list
      setHasPaymentMethod(data.hasPaymentMethod || false);
      setPaymentMethods(data.payment_methods || []);

      // Set transactions
      setTransactions(data.wallet_transactions || []);

      // Parse usage data
      if (data.current_usage?.customer_usage?.charges_usage) {
        const usageMap = new Map<string, ModelUsage>();

        for (const charge of data.current_usage.customer_usage.charges_usage) {
          // Process filters directly (they're at the top level now)
          if (charge.filters) {
            for (const filter of charge.filters) {
              // Skip filters without values (null values)
              if (!filter.values) continue;

              const modelName = filter.values.model?.[0];
              const tokenType = filter.values.type?.[0];

              if (modelName && tokenType) {
                if (!usageMap.has(modelName)) {
                  usageMap.set(modelName, {
                    model: modelName,
                    inputTokens: 0,
                    outputTokens: 0,
                    totalTokens: 0,
                    inputCost: 0,
                    outputCost: 0,
                    totalCost: 0
                  });
                }

                const usage = usageMap.get(modelName)!;
                const tokens = parseFloat(filter.units) || 0;
                const cost = filter.amount_cents / 100;

                if (tokenType === "input") {
                  usage.inputTokens += tokens;
                  usage.inputCost += cost;
                } else if (tokenType === "output") {
                  usage.outputTokens += tokens;
                  usage.outputCost += cost;
                }

                usage.totalTokens = usage.inputTokens + usage.outputTokens;
                usage.totalCost = usage.inputCost + usage.outputCost;
              }
            }
          }
        }

        setModelUsage(Array.from(usageMap.values()));
      } else {
        setModelUsage([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
      setLoadingTransactions(false);
    }
  };

  const handleAddPaymentMethod = async () => {
    setProcessingPaymentSetup(true);
    setTopUpError(null);

    try {
      const serverUrl = import.meta.env.ZUPLO_SERVER_URL || window.location.origin;

      const setupPaymentRequest = new Request(
        `${serverUrl}/v1/developer/wallet/setup-payment`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          }
        }
      );

      const signedRequest = await context.signRequest(setupPaymentRequest);
      const response = await fetch(signedRequest);

      if (!response.ok) {
        throw new Error("Failed to generate payment setup URL");
      }

      const data = await response.json();

      if (!data.customer?.checkout_url) {
        throw new Error("No checkout URL returned from server");
      }

      // Redirect to Stripe payment setup
      window.location.href = data.customer.checkout_url;
    } catch (err) {
      setTopUpError(err instanceof Error ? err.message : "Failed to setup payment method");
    } finally {
      setProcessingPaymentSetup(false);
    }
  };

  const handleDeletePaymentMethod = async (paymentMethodId: string) => {
    if (!confirm("Are you sure you want to delete this payment method?")) {
      return;
    }

    setDeletingPaymentMethod(paymentMethodId);
    setTopUpError(null);

    try {
      const serverUrl = import.meta.env.ZUPLO_SERVER_URL || window.location.origin;

      const deleteRequest = new Request(
        `${serverUrl}/v1/developer/wallet/payment-method/${paymentMethodId}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          }
        }
      );

      const signedRequest = await context.signRequest(deleteRequest);
      const response = await fetch(signedRequest);

      if (!response.ok) {
        throw new Error("Failed to delete payment method");
      }

      // Refresh wallet data to update payment methods list
      await fetchWalletBalance();
    } catch (err) {
      setTopUpError(err instanceof Error ? err.message : "Failed to delete payment method");
    } finally {
      setDeletingPaymentMethod(null);
    }
  };

  const handleTopUp = async (amount: number) => {
    if (!hasPaymentMethod) {
      setTopUpError("Please add a payment method first");
      return;
    }

    setProcessingTopUp(true);
    setTopUpError(null);
    setTopUpSuccess(false);

    try {
      const serverUrl = import.meta.env.ZUPLO_SERVER_URL || window.location.origin;

      const topUpRequest = new Request(
        `${serverUrl}/v1/developer/wallet/topup`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ amount })
        }
      );

      const signedTopUpRequest = await context.signRequest(topUpRequest);
      const topUpResponse = await fetch(signedTopUpRequest);

      if (!topUpResponse.ok) {
        throw new Error("Failed to process top-up");
      }

      const transactionData = await topUpResponse.json();
      let transaction = transactionData.wallet_transaction;

      if (!transaction) {
        throw new Error("No transaction data returned from server");
      }

      // Poll for transaction status until it's settled or failed
      // Lago creates the transaction as "pending", then charges Stripe, then updates to "settled"
      const maxAttempts = 20; // 20 attempts
      const pollInterval = 1000; // 1 second between attempts
      let attempts = 0;

      while (transaction.status === "pending" && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        attempts++;

        // Refresh wallet data to get updated transaction status
        const pollRequest = new Request(
          `${serverUrl}/v1/developer/wallet`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            }
          }
        );

        const signedPollRequest = await context.signRequest(pollRequest);
        const pollResponse = await fetch(signedPollRequest);

        if (pollResponse.ok) {
          const pollData = await pollResponse.json();
          // Find our transaction in the list
          const updatedTransaction = pollData.wallet_transactions?.find(
            (tx: WalletTransaction) => tx.lago_id === transaction.lago_id
          );
          if (updatedTransaction) {
            transaction = updatedTransaction;
          }
        }
      }

      if (transaction.status === "settled") {
        // Charge succeeded!
        setTopUpSuccess(true);
        setShowCustomInput(false);
        setCustomAmount("");

        // Refresh wallet data (balance, payment method, and transactions)
        await fetchWalletBalance();
      } else if (transaction.status === "pending") {
        // Still pending after max attempts
        throw new Error("Payment is taking longer than expected. Please refresh the page in a moment to see your updated balance.");
      } else {
        // Failed or other status
        throw new Error(`Payment ${transaction.status}. Please try again or contact support.`);
      }
    } catch (err) {
      setTopUpError(err instanceof Error ? err.message : "Failed to process top-up");
    } finally {
      setProcessingTopUp(false);
    }
  };

  const handleCustomTopUp = () => {
    const amount = parseFloat(customAmount);
    if (isNaN(amount) || amount <= 0) {
      setTopUpError("Please enter a valid amount");
      return;
    }
    handleTopUp(amount);
  };

  useEffect(() => {
    fetchWalletBalance();
  }, [auth.isAuthenticated]);

  if (!auth.isAuthenticated) {
    return (
      <section className="container mx-auto px-4 py-8">
        <Head>
          <title>Billing - Public AI Gateway</title>
        </Head>
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4">Billing</h1>
          <p className="text-lg">Please log in to view your billing information.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="container mx-auto px-4 py-8 max-w-4xl">
      <Head>
        <title>Billing - Public AI Gateway</title>
      </Head>

      <h1 className="text-3xl font-bold mb-6">Billing</h1>

      {/* Development Warning */}
      <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-300 dark:border-orange-700 rounded-lg p-4 mb-6">
        <div className="flex items-start">
          <svg className="w-6 h-6 text-orange-600 dark:text-orange-400 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <h3 className="font-semibold text-orange-800 dark:text-orange-200 mb-1">
              Under Development
            </h3>
            <p className="text-sm text-orange-700 dark:text-orange-300">
              This billing page is currently under development. Some features may not work as expected or may change without notice.
            </p>
          </div>
        </div>
      </div>

      {/* Wallet Balance Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Wallet Balance</h2>

        {loading ? (
          <div className="text-center py-4">
            <p className="text-gray-600 dark:text-gray-400">Loading your balance...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4">
            <p className="text-red-800 dark:text-red-200">{error}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Remaining Balance (Primary Display) */}
            <div>
              <div className="flex items-baseline">
                <span className="text-4xl font-bold text-green-600 dark:text-green-400">
                  ${balance}
                </span>
                <span className="ml-2 text-gray-600 dark:text-gray-400">USD</span>
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                <p>Remaining credits available</p>
              </div>
            </div>

            {/* Breakdown */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Total credits:</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">${totalCredits}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Current billing period usage:</span>
                <span className="font-medium text-red-600 dark:text-red-400">-${currentUsage.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold border-t border-gray-200 dark:border-gray-700 pt-2">
                <span className="text-gray-900 dark:text-gray-100">Remaining balance:</span>
                <span className="text-gray-900 dark:text-gray-100">${balance}</span>
              </div>
            </div>

            {balance && parseFloat(balance) <= 0.10 && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-4">
                <p className="text-yellow-800 dark:text-yellow-200 font-medium">
                  Your balance is low. Please add credits to continue using the API.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Payment Method Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Payment Methods</h2>

        <div className="space-y-4">
          {paymentMethods.length > 0 ? (
            <>
              <div className="space-y-3">
                {paymentMethods.map((pm) => (
                  <div
                    key={pm.id}
                    className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      {pm.card && (
                        <>
                          <div className="text-gray-900 dark:text-gray-100">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                            </svg>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-gray-100">
                              {pm.card.brand.charAt(0).toUpperCase() + pm.card.brand.slice(1)} •••• {pm.card.last4}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              Expires {pm.card.exp_month}/{pm.card.exp_year}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeletePaymentMethod(pm.id)}
                      disabled={deletingPaymentMethod === pm.id}
                      className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {deletingPaymentMethod === pm.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={handleAddPaymentMethod}
                disabled={processingPaymentSetup}
                className="text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processingPaymentSetup ? "Redirecting..." : "+ Add another payment method"}
              </button>
            </>
          ) : (
            <>
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-4">
                <p className="text-yellow-800 dark:text-yellow-200 font-medium mb-2">
                  No payment method on file
                </p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  You need to add a payment method before you can top up your wallet.
                </p>
              </div>

              <button
                onClick={handleAddPaymentMethod}
                disabled={processingPaymentSetup}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:cursor-not-allowed w-full sm:w-auto"
              >
                {processingPaymentSetup ? "Redirecting..." : "Add Payment Method"}
              </button>

              <p className="text-xs text-gray-500 dark:text-gray-400">
                You'll be redirected to Stripe to securely add your payment details.
              </p>
            </>
          )}

          {topUpError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4">
              <p className="text-red-800 dark:text-red-200">{topUpError}</p>
            </div>
          )}
        </div>
      </div>

      {/* Top Up Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Add Credits</h2>

        {topUpSuccess && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md p-4 mb-4">
            <p className="text-green-800 dark:text-green-200 font-medium">
              Credits added successfully!
            </p>
          </div>
        )}

        {!hasPaymentMethod ? (
          <div className="bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-md p-6 text-center">
            <p className="text-gray-600 dark:text-gray-400">
              Please add a payment method first to top up your wallet.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Select an amount to add to your wallet:
            </p>

            {/* Preset Amount Buttons */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[5, 10, 20, 50].map((amount) => (
                <button
                  key={amount}
                  onClick={() => handleTopUp(amount)}
                  disabled={processingTopUp}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:cursor-not-allowed"
                >
                  ${amount}
                </button>
              ))}
            </div>

            {/* Custom Amount */}
            {!showCustomInput ? (
              <button
                onClick={() => setShowCustomInput(true)}
                className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
              >
                Enter custom amount
              </button>
            ) : (
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
                <button
                  onClick={handleCustomTopUp}
                  disabled={processingTopUp || !customAmount}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-2 px-6 rounded-md transition-colors disabled:cursor-not-allowed"
                >
                  Add
                </button>
                <button
                  onClick={() => {
                    setShowCustomInput(false);
                    setCustomAmount("");
                  }}
                  className="bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 text-gray-800 dark:text-gray-200 font-semibold py-2 px-4 rounded-md transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}

            {processingTopUp && (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Processing your payment...
              </p>
            )}

            <p className="text-xs text-gray-500 dark:text-gray-400">
              Your payment method will be charged immediately.
            </p>
          </div>
        )}
      </div>

      {/* Model Usage Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Current Billing Period Usage</h2>

        {loadingTransactions ? (
          <p className="text-gray-600 dark:text-gray-400">Loading usage data...</p>
        ) : modelUsage.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400">No usage data for this billing period yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-2 font-semibold text-gray-900 dark:text-gray-100">Model</th>
                  <th className="text-right py-3 px-2 font-semibold text-gray-900 dark:text-gray-100">Input Tokens</th>
                  <th className="text-right py-3 px-2 font-semibold text-gray-900 dark:text-gray-100">Output Tokens</th>
                  <th className="text-right py-3 px-2 font-semibold text-gray-900 dark:text-gray-100">Total Tokens</th>
                  <th className="text-right py-3 px-2 font-semibold text-gray-900 dark:text-gray-100">Cost</th>
                </tr>
              </thead>
              <tbody>
                {modelUsage
                  .sort((a, b) => b.totalCost - a.totalCost)
                  .map((usage) => (
                    <tr
                      key={usage.model}
                      className="border-b border-gray-200 dark:border-gray-700 last:border-0"
                    >
                      <td className="py-3 px-2 text-gray-900 dark:text-gray-100 font-medium">
                        {usage.model}
                      </td>
                      <td className="py-3 px-2 text-right text-gray-700 dark:text-gray-300">
                        {usage.inputTokens.toLocaleString()}
                        <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                          (${usage.inputCost.toFixed(4)})
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right text-gray-700 dark:text-gray-300">
                        {usage.outputTokens.toLocaleString()}
                        <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                          (${usage.outputCost.toFixed(4)})
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right text-gray-700 dark:text-gray-300 font-medium">
                        {usage.totalTokens.toLocaleString()}
                      </td>
                      <td className="py-3 px-2 text-right font-semibold text-gray-900 dark:text-gray-100">
                        ${usage.totalCost.toFixed(4)}
                      </td>
                    </tr>
                  ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 dark:border-gray-600 font-semibold">
                  <td className="py-3 px-2 text-gray-900 dark:text-gray-100">Total</td>
                  <td className="py-3 px-2 text-right text-gray-900 dark:text-gray-100">
                    {modelUsage.reduce((sum, u) => sum + u.inputTokens, 0).toLocaleString()}
                  </td>
                  <td className="py-3 px-2 text-right text-gray-900 dark:text-gray-100">
                    {modelUsage.reduce((sum, u) => sum + u.outputTokens, 0).toLocaleString()}
                  </td>
                  <td className="py-3 px-2 text-right text-gray-900 dark:text-gray-100">
                    {modelUsage.reduce((sum, u) => sum + u.totalTokens, 0).toLocaleString()}
                  </td>
                  <td className="py-3 px-2 text-right text-gray-900 dark:text-gray-100">
                    ${modelUsage.reduce((sum, u) => sum + u.totalCost, 0).toFixed(4)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Transaction History */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Recent Transactions</h2>

        {loadingTransactions ? (
          <p className="text-gray-600 dark:text-gray-400">Loading transactions...</p>
        ) : transactions.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400">No transactions yet</p>
        ) : (
          <div className="space-y-3">
            {transactions.slice(0, 10).map((tx) => (
              <div
                key={tx.lago_id}
                className="flex justify-between items-center py-3 border-b border-gray-200 dark:border-gray-700 last:border-0"
              >
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {tx.transaction_type === "inbound" ? "Top up" : "Usage"}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {new Date(tx.created_at).toLocaleDateString()} at{" "}
                    {new Date(tx.created_at).toLocaleTimeString()}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Status: {tx.status}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={`font-semibold ${
                      tx.transaction_type === "inbound"
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {tx.transaction_type === "inbound" ? "+" : "-"}$
                    {parseFloat(tx.credit_amount || tx.amount || "0").toFixed(2)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-4">
        <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
          How billing works
        </h3>
        <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
          <li>• New users receive $10 in free credits</li>
          <li>• Credits are deducted based on your API usage</li>
          <li>• You'll be notified when your balance is low</li>
          <li>• Requests are blocked when balance reaches $0.10 or below</li>
          <li>• $1 USD = 1 credit (simple 1:1 ratio)</li>
        </ul>
      </div>
    </section>
  );
};
