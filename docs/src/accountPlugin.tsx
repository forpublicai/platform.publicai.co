import type { NavigationPlugin } from "zudoku/plugins";
import { BillingPage } from "./BillingPage";

export const accountPlugin: NavigationPlugin = {
  getRoutes: () => [
    {
      path: "/account/billing",
      element: <BillingPage />,
    },
  ],
};
