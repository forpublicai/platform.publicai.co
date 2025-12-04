import type { NavigationPlugin } from "zudoku/plugins";
import { BillingPage } from "./BillingPage";

export const billingPlugin: NavigationPlugin = {
  getRoutes: () => [
    {
      path: "/billing",
      element: <BillingPage />,
    },
  ],
};
