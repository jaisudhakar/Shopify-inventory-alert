import type { ActionFunctionArgs } from "@remix-run/node";

import { authenticate } from "../shopify.server";
import { purgeShopData } from "../models/settings.server";

/**
 * Mandatory compliance webhook: 48 hours after a store uninstalls the app,
 * Shopify asks for that shop's data to be erased.
 *
 * Unlike the customer topics this one has real work to do — the app holds the
 * shop's alert settings, its digest history (which includes recipient email
 * addresses the merchant entered), and its OAuth session.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  const deleted = await purgeShopData(shop);

  console.info(
    `[inventory-alert] ${topic} for ${shop}: deleted ${deleted.settings} setting(s), ${deleted.runs} run(s), ${deleted.sessions} session(s)`,
  );

  return new Response();
};
