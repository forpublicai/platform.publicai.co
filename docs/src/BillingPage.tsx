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
  wallet_transactions: WalletTransaction[];
}

interface WalletTransaction {
  lago_id: string;
  status: string;
  transaction_type: string;
  amount: string;
  credit_amount: string;
  created_at: string;
}

export const BillingPage = () => {
  const auth = useAuth();
  const context = useZudoku();
  const [balance, setBalance] = useState<string | null>(null);
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

      if (!response.ok) {
        throw new Error("Failed to fetch wallet data");
      }

      const data: WalletData = await response.json();

      // Set balance
      if (data.wallets && data.wallets.length > 0) {
        const wallet = data.wallets[0];
        const creditsBalance = parseFloat(wallet.credits_ongoing_balance || "0");
        setBalance(creditsBalance.toFixed(2));
      } else {
        setBalance("0.00");
      }

      // Set payment method status
      setHasPaymentMethod(data.hasPaymentMethod || false);

      // Set transactions
      setTransactions(data.wallet_transactions || []);
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
      const transaction = transactionData.wallet_transaction;

      if (!transaction) {
        throw new Error("No transaction data returned from server");
      }

      if (transaction.status === "settled") {
        // Charge succeeded!
        setTopUpSuccess(true);
        setShowCustomInput(false);
        setCustomAmount("");

        // Refresh wallet data (balance, payment method, and transactions)
        await fetchWalletBalance();
      } else {
        throw new Error("Payment could not be processed. Please try again.");
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
            <div className="flex items-baseline">
              <span className="text-4xl font-bold text-green-600 dark:text-green-400">
                ${balance}
              </span>
              <span className="ml-2 text-gray-600 dark:text-gray-400">USD</span>
            </div>

            <div className="text-sm text-gray-600 dark:text-gray-400">
              <p>Available credits in your wallet</p>
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

      {/* Payment Method Setup Section */}
      {!hasPaymentMethod && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Payment Method</h2>

          <div className="space-y-4">
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-4">
              <p className="text-yellow-800 dark:text-yellow-200 font-medium mb-2">
                No payment method on file
              </p>
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                You need to add a payment method before you can top up your wallet.
              </p>
            </div>

            {topUpError && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4">
                <p className="text-red-800 dark:text-red-200">{topUpError}</p>
              </div>
            )}

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
          </div>
        </div>
      )}

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

        {topUpError && hasPaymentMethod && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4 mb-4">
            <p className="text-red-800 dark:text-red-200">{topUpError}</p>
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
