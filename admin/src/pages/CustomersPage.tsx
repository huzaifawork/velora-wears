import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";

import type { CustomerSummary } from "@shared/types";
import { buttonClasses } from "@admin/components/ui/Button";
import { Card, PageHeader } from "@admin/components/ui/Card";
import { Badge } from "@admin/components/ui/Badge";
import { DataTable, Pagination, type Column } from "@admin/components/ui/DataTable";
import { EmptyState, ErrorState } from "@admin/components/ui/Skeleton";
import { ActiveFilters, FilterBar, SearchInput } from "@admin/components/ui/SearchInput";
import { Select } from "@admin/components/ui/Select";
import { AccountIcon } from "@admin/components/ui/Icons";
import { useQuery } from "@admin/hooks/useQuery";
import { useUrlState } from "@admin/hooks/useUrlState";
import { DEFAULT_PAGE_SIZE } from "@admin/services/products";
import {
  customerListKey,
  listCustomers,
  type CustomerSort,
} from "@admin/services/customers";
import { formatDate, formatPrice, formatRelative } from "@admin/lib/format";
import * as routes from "@admin/lib/routes";

/**
 * Customers — everyone who has created an account on the shop.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS SCREEN IS NOT
 * ---------------------------------------------------------------------------
 * It is not the list of people who have bought something. **Most orders on this
 * shop are placed by guests** — checkout requires no account and never will
 * (requirements section 7) — so an order and a customer account are related but
 * separate things, and treating this as the customer list would quietly hide
 * most of the shop's actual customers. The Orders screen is where sales live;
 * this is the accounts directory.
 *
 * That is also why "0 orders" is completely normal here and is shown plainly
 * rather than flagged: somebody who created an account and has not bought yet
 * has done nothing wrong.
 *
 * ---------------------------------------------------------------------------
 * READ ONLY
 * ---------------------------------------------------------------------------
 * There is nothing to edit and no delete button. A profile is created by a
 * database trigger at sign-up and removed with the account; the name and phone
 * on it belong to the customer, and row level security grants those two columns
 * to the account that owns them and to nobody else — an admin cannot rewrite a
 * person's own details. See `admin/src/services/customers.ts`.
 */
export function CustomersPage() {
  const [params] = useSearchParams();
  const url = useUrlState();

  const search = params.get("q") ?? "";
  const sort = (params.get("sort") as CustomerSort) || "newest";
  const page = Math.max(1, Number(params.get("page") ?? 1));

  const options = useMemo(
    () => ({ search, sort, page, pageSize: DEFAULT_PAGE_SIZE }),
    [search, sort, page],
  );

  const customers = useQuery(customerListKey(options), ["customers"], () =>
    listCustomers(options),
  );

  const columns: Column<CustomerSummary>[] = [
    {
      key: "who",
      label: "Customer",
      primary: true,
      cell: (customer) => (
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium text-ink">
              {customer.fullName || (
                <span className="text-ink-muted italic">No name given</span>
              )}
            </p>
            {/* Shown, not editable. The database refuses a role change from any
                signed-in session — see `services/admins.ts`. */}
            {customer.role === "admin" && <Badge tone="accent">Administrator</Badge>}
          </div>
          <p className="mt-0.5 truncate text-xs text-ink-muted">{customer.email}</p>
        </div>
      ),
    },
    {
      key: "phone",
      label: "Phone",
      hideOnMobile: true,
      cell: (customer) =>
        customer.phone ? (
          <a
            href={`tel:${customer.phone}`}
            className="text-sm text-ink-soft underline-offset-2 hover:text-accent hover:underline"
          >
            {customer.phone}
          </a>
        ) : (
          <span className="text-sm text-ink-muted">—</span>
        ),
    },
    {
      key: "joined",
      label: "Joined",
      cell: (customer) => (
        <span className="text-sm text-ink-soft">{formatDate(customer.createdAt)}</span>
      ),
    },
    {
      key: "orders",
      label: "Orders",
      align: "right",
      cell: (customer) =>
        customer.orderCount === 0 ? (
          <Badge tone="neutral">None yet</Badge>
        ) : (
          <div className="text-right">
            {/* Their orders, not all orders — the search box on the Orders
                screen matches an email, which is how a signed-in customer's
                orders are found. */}
            <Link
              to={`${routes.ORDERS}?q=${encodeURIComponent(customer.email ?? "")}`}
              className="text-sm text-ink tabular-nums underline-offset-2 hover:text-accent hover:underline"
            >
              {customer.orderCount}
            </Link>
            {customer.lastOrderAt && (
              <p className="mt-0.5 text-xs text-ink-muted">
                {formatRelative(customer.lastOrderAt)}
              </p>
            )}
          </div>
        ),
    },
    {
      key: "spent",
      label: "Spent",
      align: "right",
      cell: (customer) => (
        <span className="text-sm font-medium text-ink tabular-nums">
          {customer.totalSpent > 0 ? formatPrice(customer.totalSpent) : "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="Everyone who has created an account. Guests who checked out without one are on the Orders screen."
      />

      <Card padded={false}>
        <FilterBar
          search={
            <SearchInput
              label="Search customers by name, email or phone"
              placeholder="Name, email, phone…"
              value={search}
              onChange={(value) => url.set({ q: value || null, page: null })}
            />
          }
          filters={
            <>
              <Select
                label="Sort"
                hideLabel
                value={sort}
                onChange={(value) => url.set({ sort: value === "newest" ? null : value, page: null })}
                className="min-w-[10rem]"
                options={[
                  { value: "newest", label: "Newest first" },
                  { value: "oldest", label: "Oldest first" },
                  { value: "spend", label: "Highest spend" },
                  { value: "orders", label: "Most orders" },
                  { value: "name", label: "Name A-Z" },
                ]}
              />

              <ActiveFilters
                count={search ? 1 : 0}
                onClear={() => url.set({ q: null, page: null })}
              />
            </>
          }
        />

        {customers.error ? (
          <ErrorState error={customers.error} onRetry={customers.refetch} />
        ) : (
          <>
            <DataTable
              rows={customers.data?.rows ?? []}
              columns={columns}
              rowKey={(customer) => customer.id}
              loading={customers.loading}
              caption="Customer accounts, with how much each has ordered"
              empty={
                search ? (
                  <EmptyState
                    icon={<AccountIcon />}
                    title="Nobody matches that"
                    description="No account matches that name, email or phone number."
                    action={
                      <button
                        type="button"
                        className={buttonClasses({ variant: "secondary", size: "sm" })}
                        onClick={() => url.set({ q: null, page: null })}
                      >
                        Clear search
                      </button>
                    }
                  />
                ) : (
                  <EmptyState
                    icon={<AccountIcon />}
                    title="No accounts yet"
                    description="An account appears here the moment somebody signs up. Nobody has to create one to buy — guest checkout works without one — so this staying empty while orders come in is completely normal."
                  />
                )
              }
            />

            <Pagination
              page={page}
              pageSize={DEFAULT_PAGE_SIZE}
              total={customers.data?.total ?? 0}
              onPage={(next) => url.set({ page: next === 1 ? null : String(next) })}
            />
          </>
        )}
      </Card>
    </div>
  );
}
