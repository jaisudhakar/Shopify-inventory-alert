import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";

import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function Landing() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Inventory Alert</h1>
        <p className={styles.text}>
          Set a low-stock threshold once and get one email every morning listing every
          product that has fallen to or below it — before your customers find the sold-out
          page.
        </p>

        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span className={styles.hint}>e.g. my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}

        <ul className={styles.list}>
          <li>
            <strong>Your threshold.</strong> Defaults to 10 units, change it any time.
          </li>
          <li>
            <strong>Your morning.</strong> Sent at the hour you pick, in your store's own
            timezone.
          </li>
          <li>
            <strong>Your team.</strong> Send it to the owner, the buyer, and the warehouse
            at once.
          </li>
        </ul>
      </div>
    </div>
  );
}
