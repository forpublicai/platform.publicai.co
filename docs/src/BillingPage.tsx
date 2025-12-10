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
  name?: string;
  source?: string;
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

interface ModelPricing {
  model_name: string;
  input_cost_per_token: number;
  output_cost_per_token: number;
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
  const [processingTopUp, setProcessingTopUp] = useState(false);
  const [processingPaymentSetup, setProcessingPaymentSetup] = useState(false);
  const [topUpSuccess, setTopUpSuccess] = useState(false);
  const [topUpError, setTopUpError] = useState<string | null>(null);
  const [hasPaymentMethod, setHasPaymentMethod] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [deletingPaymentMethod, setDeletingPaymentMethod] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [paymentMethodToDelete, setPaymentMethodToDelete] = useState<string | null>(null);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState<string>("10");
  const [modelUsage, setModelUsage] = useState<ModelUsage[]>([]);
  const [billingPeriod, setBillingPeriod] = useState<{from: string; to: string} | null>(null);
  const [modelPricing, setModelPricing] = useState<ModelPricing[]>([]);
  const [loadingPricing, setLoadingPricing] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return diffMinutes <= 1 ? "just now" : `${diffMinutes} minutes ago`;
    } else if (diffHours < 24) {
      return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
    } else if (diffDays <= 3) {
      return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
    } else {
      // Format as "8th Dec 2025"
      const day = date.getDate();
      const suffix = day === 1 || day === 21 || day === 31 ? 'st' :
                     day === 2 || day === 22 ? 'nd' :
                     day === 3 || day === 23 ? 'rd' : 'th';
      const month = date.toLocaleDateString('en-US', { month: 'short' });
      const year = date.getFullYear();
      return `${day}${suffix} ${month} ${year}`;
    }
  };

  const formatBillingPeriodDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = date.getDate();
    const suffix = day === 1 || day === 21 || day === 31 ? 'st' :
                   day === 2 || day === 22 ? 'nd' :
                   day === 3 || day === 23 ? 'rd' : 'th';
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const year = date.getFullYear();
    return `${day}${suffix} ${month} ${year}`;
  };

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

        // Capture billing period
        if (data.current_usage.customer_usage.from_datetime && data.current_usage.customer_usage.to_datetime) {
          setBillingPeriod({
            from: data.current_usage.customer_usage.from_datetime,
            to: data.current_usage.customer_usage.to_datetime
          });
        }

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
    setPaymentMethodToDelete(paymentMethodId);
    setShowDeleteConfirm(true);
  };

  const confirmDeletePaymentMethod = async () => {
    if (!paymentMethodToDelete) return;

    setDeletingPaymentMethod(paymentMethodToDelete);
    setShowDeleteConfirm(false);
    setTopUpError(null);

    try {
      const serverUrl = import.meta.env.ZUPLO_SERVER_URL || window.location.origin;

      const deleteRequest = new Request(
        `${serverUrl}/v1/developer/wallet/payment-method/${paymentMethodToDelete}`,
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
      setPaymentMethodToDelete(null);
    }
  };

  const cancelDeletePaymentMethod = () => {
    setShowDeleteConfirm(false);
    setPaymentMethodToDelete(null);
  };

  const openTopUpModal = () => {
    if (!hasPaymentMethod) {
      setTopUpError("Please add a payment method first");
      return;
    }
    setTopUpAmount("10");
    setTopUpError(null);
    setTopUpSuccess(false);
    setShowTopUpModal(true);
  };

  const closeTopUpModal = () => {
    setShowTopUpModal(false);
    setTopUpAmount("10");
  };

  const handleConfirmTopUp = async () => {
    const amount = parseFloat(topUpAmount);
    if (isNaN(amount) || amount < 1) {
      setTopUpError("Minimum top-up amount is $1");
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
        setShowTopUpModal(false);
        setTopUpAmount("10");

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

  const fetchModelPricing = async () => {
    setLoadingPricing(true);
    setPricingError(null);

    try {
      const serverUrl = import.meta.env.ZUPLO_SERVER_URL || window.location.origin;
      const pricingRequest = new Request(
        `${serverUrl}/v1/developer/pricing`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          }
        }
      );

      const signedRequest = await context.signRequest(pricingRequest);
      const response = await fetch(signedRequest);

      if (!response.ok) {
        throw new Error("Failed to fetch model pricing");
      }

      const data = await response.json();

      // Transform the data to our simpler format
      const pricingData: ModelPricing[] = data.data.map((model: any) => ({
        model_name: model.model_name,
        input_cost_per_token: typeof model.model_info.input_cost_per_token === 'string'
          ? parseFloat(model.model_info.input_cost_per_token)
          : model.model_info.input_cost_per_token,
        output_cost_per_token: typeof model.model_info.output_cost_per_token === 'string'
          ? parseFloat(model.model_info.output_cost_per_token)
          : model.model_info.output_cost_per_token,
      }));

      setModelPricing(pricingData);
    } catch (err) {
      setPricingError(err instanceof Error ? err.message : "Failed to fetch pricing");
    } finally {
      setLoadingPricing(false);
    }
  };

  useEffect(() => {
    fetchWalletBalance();
    fetchModelPricing();
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

            {/* Top Up Button */}
            {topUpSuccess && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md p-4">
                <p className="text-green-800 dark:text-green-200 font-medium">
                  Credits added successfully!
                </p>
              </div>
            )}

            {hasPaymentMethod ? (
              <button
                onClick={openTopUpModal}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                Top Up Credits
              </button>
            ) : (
              <button
                onClick={handleAddPaymentMethod}
                disabled={processingPaymentSetup}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:cursor-not-allowed"
              >
                {processingPaymentSetup ? "Redirecting..." : "Add Payment Method"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Payment Method Section - Only show if user has payment methods */}
      {paymentMethods.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Payment Method</h2>

          <div className="space-y-4">
            {(() => {
              const pm = paymentMethods[0];
              return (
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
              );
            })()}

            {topUpError && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4">
                <p className="text-red-800 dark:text-red-200">{topUpError}</p>
              </div>
            )}
          </div>
        </div>
      )}


      {/* Model Usage Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Current Billing Period Usage</h2>
          {billingPeriod && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {formatBillingPeriodDate(billingPeriod.from)} - {formatBillingPeriodDate(billingPeriod.to)}
            </p>
          )}
        </div>

        {loadingTransactions ? (
          <p className="text-gray-600 dark:text-gray-400">Loading usage data...</p>
        ) : (() => {
          const usedModels = modelUsage.filter(usage => usage.totalTokens > 0);
          return usedModels.length === 0 ? (
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
                  {usedModels
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
                    {usedModels.reduce((sum, u) => sum + u.inputTokens, 0).toLocaleString()}
                  </td>
                  <td className="py-3 px-2 text-right text-gray-900 dark:text-gray-100">
                    {usedModels.reduce((sum, u) => sum + u.outputTokens, 0).toLocaleString()}
                  </td>
                  <td className="py-3 px-2 text-right text-gray-900 dark:text-gray-100">
                    {usedModels.reduce((sum, u) => sum + u.totalTokens, 0).toLocaleString()}
                  </td>
                  <td className="py-3 px-2 text-right text-gray-900 dark:text-gray-100">
                    ${usedModels.reduce((sum, u) => sum + u.totalCost, 0).toFixed(4)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        );
        })()}
      </div>

      {/* Transaction History */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Recent Transactions</h2>

        {loadingTransactions ? (
          <p className="text-gray-600 dark:text-gray-400">Loading transactions...</p>
        ) : (() => {
          const settledTransactions = transactions.filter(tx => tx.status === "settled");
          return settledTransactions.length === 0 ? (
            <p className="text-gray-600 dark:text-gray-400">No transactions yet</p>
          ) : (
            <div className="space-y-3">
              {settledTransactions.slice(0, 10).map((tx) => (
                <div
                  key={tx.lago_id}
                  className="flex justify-between items-center py-3 border-b border-gray-200 dark:border-gray-700 last:border-0"
                >
                  <div>
                    {tx.name && (
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        {tx.name}
                      </p>
                    )}
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {formatRelativeTime(tx.created_at)}
                    </p>
                  </div>
                  <div className="text-right">
                    {(() => {
                      const amount = parseFloat(tx.credit_amount || tx.amount || "0");
                      const isOutbound = tx.transaction_type === "outbound";
                      const displayAmount = isOutbound ? -Math.abs(amount) : Math.abs(amount);
                      return (
                        <p className={`font-semibold ${isOutbound ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                          {isOutbound ? '' : '+'}${displayAmount.toFixed(2)}
                        </p>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Model Pricing */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Model Pricing</h2>

        {loadingPricing ? (
          <p className="text-gray-600 dark:text-gray-400">Loading pricing data...</p>
        ) : pricingError ? (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4">
            <p className="text-red-800 dark:text-red-200">{pricingError}</p>
          </div>
        ) : modelPricing.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400">No pricing data available</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-2 font-semibold text-gray-900 dark:text-gray-100">Model</th>
                  <th className="text-right py-3 px-2 font-semibold text-gray-900 dark:text-gray-100">Input Cost per 1M Tokens</th>
                  <th className="text-right py-3 px-2 font-semibold text-gray-900 dark:text-gray-100">Output Cost per 1M Tokens</th>
                </tr>
              </thead>
              <tbody>
                {modelPricing
                  .sort((a, b) => a.model_name.localeCompare(b.model_name))
                  .map((pricing) => (
                  <tr
                    key={pricing.model_name}
                    className="border-b border-gray-200 dark:border-gray-700 last:border-0"
                  >
                    <td className="py-3 px-2 text-gray-900 dark:text-gray-100 font-medium">
                      {pricing.model_name}
                    </td>
                    <td className="py-3 px-2 text-right text-gray-700 dark:text-gray-300">
                      ${(pricing.input_cost_per_token * 1000000).toFixed(2)}
                    </td>
                    <td className="py-3 px-2 text-right text-gray-700 dark:text-gray-300">
                      ${(pricing.output_cost_per_token * 1000000).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-[2px] flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Delete Payment Method
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Are you sure you want to delete this payment method? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={cancelDeletePaymentMethod}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeletePaymentMethod}
                className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Up Modal */}
      {showTopUpModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-[2px] flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Top Up Credits
            </h3>

            {topUpError && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3 mb-4">
                <p className="text-red-800 dark:text-red-200 text-sm">{topUpError}</p>
              </div>
            )}

            <div className="mb-6">
              <label htmlFor="topUpAmount" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Amount (USD)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">$</span>
                <input
                  id="topUpAmount"
                  type="number"
                  min="1"
                  step="0.01"
                  value={topUpAmount}
                  onChange={(e) => setTopUpAmount(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={processingTopUp}
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Minimum top-up amount is $1. Your payment method will be charged immediately.
              </p>
            </div>

            {processingTopUp && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 text-center">
                Processing your payment...
              </p>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={closeTopUpModal}
                disabled={processingTopUp}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmTopUp}
                disabled={processingTopUp || !topUpAmount || parseFloat(topUpAmount) < 1}
                className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processingTopUp ? "Processing..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
