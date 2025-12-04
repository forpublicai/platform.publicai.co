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
}

export const BillingPage = () => {
  const auth = useAuth();
  const context = useZudoku();
  const [balance, setBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchWalletBalance = async () => {
      console.log("Auth state:", {
        isAuthenticated: auth.isAuthenticated,
        user: auth.user,
        authKeys: Object.keys(auth)
      });
      console.log("Context:", context);

      if (!auth.isAuthenticated) {
        console.log("User not authenticated");
        setLoading(false);
        return;
      }

      try {
        console.log("Fetching wallet balance...");

        // Create the request
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

        // Sign the request using Zudoku context (same as CreateApiKey does)
        const signedRequest = await context.signRequest(walletRequest);

        // Make the authenticated request
        const response = await fetch(signedRequest);

        if (!response.ok) {
          throw new Error("Failed to fetch wallet balance");
        }

        const data: WalletData = await response.json();

        if (data.wallets && data.wallets.length > 0) {
          const wallet = data.wallets[0];
          const creditsBalance = parseFloat(wallet.credits_ongoing_balance || "0");
          setBalance(creditsBalance.toFixed(2));
        } else {
          setBalance("0.00");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    };

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
    <section className="container mx-auto px-4 py-8">
      <Head>
        <title>Billing - Public AI Gateway</title>
      </Head>

      <h1 className="text-3xl font-bold mb-6">Billing</h1>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
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
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-4 mt-4">
                <p className="text-yellow-800 dark:text-yellow-200 font-medium">
                  Your balance is low. Please add credits to continue using the API.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-4">
        <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
          How billing works
        </h3>
        <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
          <li>• New users receive $10 in free credits</li>
          <li>• Credits are deducted based on your API usage</li>
          <li>• You'll be notified when your balance is low</li>
          <li>• Requests are blocked when balance reaches $0.10 or below</li>
        </ul>
      </div>
    </section>
  );
};
