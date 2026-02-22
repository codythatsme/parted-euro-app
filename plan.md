# Inventory Schema Restructure Plan (Validated)

## Context

Current schema collapses multiple physical items into a single `Part.quantity` integer, uses an implicit m2m (`_ListingToPart`) to conflate "what a listing sells" with "what inventory backs it," and has zero purchase traceability (OrderItem -> Listing only, no record of which donor's item shipped). This makes donor cost reconciliation, warranty tracking, and accurate stock management impossible.

**Research validation**: Compared against Odoo (quant-per-serial), ERPNext (stock ledger entries), Shopify (flat quantity), CockroachDB reference architecture, MongoDB reservation patterns, Vertabelo BOM designs, and Kibo/WooCommerce reservation models. The proposed architecture matches industry best practice on every dimension.

---

## Overview

### Current Schema

The app models car part inventory with four core entities:

- **PartDetail** -- catalog entry keyed by part number. Holds specs (name, dimensions, weight, compatible cars, cost). One PartDetail can have many physical Part instances.
- **Part** -- an inventory record. Links to a PartDetail (what it is), optionally to a Donor (where it came from), and has a flat `quantity` field, `sold` boolean, `variant` string, and inventory location. Has a **many-to-many** relationship with Listing via an implicit Prisma join table (`_ListingToPart`).
- **Listing** -- the storefront product page. Has title, description, condition, single price, images. Connected to Parts via the same many-to-many.
- **OrderItem** -- links an Order to a Listing with a quantity. References **only the Listing**, not individual Parts.

### What's Wrong

1. **No purchase traceability.** When a customer buys a listing that has inventory from 3 different donors, the OrderItem only records "bought Listing X, qty 1." There's no record of which specific donor's item was shipped. Accounting, warranty tracking, and donor cost reconciliation are impossible.

2. **Ambiguous inventory model.** `Part.quantity` is a flat integer that collapses multiple physical items into one record. If donor A contributed 2 headlights and donor B contributed 1, this might be stored as one Part with `quantity=3` (losing donor distinction) or inconsistently as separate records. There's no enforced rule.

3. **No automatic inventory management.** The current FIFO quantity-decrement in the Stripe webhook (`createInvoiceFromStripeEvent` lines 254-287) reduces `Part.quantity` but has no reservation mechanism. Between checkout start and webhook completion, another buyer can purchase the same item. The `Part.sold` boolean exists but isn't checked during stock calculations.

4. **Conflated concerns in Part-Listing relationship.** The many-to-many serves two unrelated purposes simultaneously: (a) defining what a listing *includes* (e.g., a headlight pair = Left + Right) and (b) tracking which physical inventory items are *available* for that listing. These are fundamentally different concepts forced into one relationship.

5. **Bundle support is implicit and fragile.** A listing can include different part types, but the only way to express this is by attaching Parts of different PartDetails. If all units of one part type sell out, the listing loses its bundle definition because it was stored in inventory records, not in the listing itself.

6. **Stock calculation is inconsistent.** Public listing page sums `parts.reduce(qty)` (~line 52), add-to-cart uses `listing.parts[0]?.quantity` (~line 45 of add-to-cart-button.tsx), and the search endpoint returns raw part data. No centralized stock function.

### What We're Moving To

Three key separations:

1. **What a listing sells** (bill of materials) is separated from **what inventory backs it** (physical stock). A new `ListingComponent` model defines the listing's contents declaratively. Inventory items are allocated to listings independently.

2. **Each physical item gets its own record.** The flat `quantity` field is eliminated. A Part record with `quantity=3` becomes 3 individual Part records, each trackable from acquisition (donor) through sale (order) with a status lifecycle: `AVAILABLE` -> `RESERVED` -> `SOLD`.

3. **Orders trace to specific physical items.** A new `OrderItemPart` junction links each OrderItem to the exact Part records that were allocated and shipped. We always know which donor's item went to which customer.

These changes give us: accurate stock counts, automatic inventory management on purchase, donor-level cost tracking per sale, and the ability to support bundles without ambiguity.

---

## Proposed Data Model

### Enum: `PartStatus`

```prisma
enum PartStatus {
  AVAILABLE   // in warehouse, for sale
  RESERVED    // checkout started, pending payment
  SOLD        // payment confirmed
  RETURNED    // returned, needs inspection before resale
}
```

Lifecycle: `AVAILABLE` -> `RESERVED` (checkout session created) -> `SOLD` (payment confirmed). `RETURNED` added per Odoo/ERPNext patterns -- avoids conflating returned items with available stock. Cheap to add now, prevents future migration. Admin can move `RETURNED` -> `AVAILABLE` after inspection.

### New Model: `ListingComponent`

Defines what a listing includes -- its bill of materials. Decoupled from inventory. This matches the industry-standard BOM pattern (Vertabelo, Odoo, ERPNext): the definition is **declarative** and **independent of inventory**.

```prisma
model ListingComponent {
  id            String     @id @default(cuid())
  listing       Listing    @relation(fields: [listingId], references: [id], onDelete: Cascade)
  listingId     String
  partDetail    PartDetail @relation(fields: [partDetailId], references: [partNo])
  partDetailId  String
  quantity      Int        @default(1)  // how many of this part type per unit sold
  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt

  @@unique([listingId, partDetailId])
}
```

Example: "E46 Headlight Pair" listing has 2 components:
- ListingComponent: partDetailId="LEFT_HL", quantity=1
- ListingComponent: partDetailId="RIGHT_HL", quantity=1

The `@@unique` constraint is correct: needing 2 of the same part type uses `quantity=2`, not two rows.

### New Model: `OrderItemPart`

Links order items to the specific physical items that were allocated/shipped. Matches how every serious ERP handles traceability (Odoo: Sale Order Line -> Stock Move -> Quant -> Lot -> Supplier).

```prisma
model OrderItemPart {
  id          String    @id @default(cuid())
  orderItem   OrderItem @relation(fields: [orderItemId], references: [id], onDelete: Cascade)
  orderItemId String
  part        Part      @relation(fields: [partId], references: [id])
  partId      String
  createdAt   DateTime  @default(now())

  @@unique([orderItemId, partId])
}
```

### Refactored: `Part` (pure inventory unit)

Each record represents exactly one physical item. No quantity field. Matches Odoo's quant-per-serial-number approach.

```prisma
model Part {
  id                  String              @id @default(cuid())
  partDetails         PartDetail          @relation(fields: [partDetailsId], references: [partNo])
  partDetailsId       String
  inventoryLocation   InventoryLocations? @relation(fields: [inventoryLocationId], references: [id])
  inventoryLocationId String?
  donorVin            String?
  donor               Donor?              @relation(fields: [donorVin], references: [vin])
  variant             String?
  images              Image[]
  createdAt           DateTime            @default(now())
  updatedAt           DateTime            @updatedAt

  // NEW fields
  status              PartStatus          @default(AVAILABLE)
  listing             Listing?            @relation(fields: [listingId], references: [id], onDelete: SetNull)
  listingId           String?             // which listing this item is allocated to for sale
  reservedAt          DateTime?           // when status changed to RESERVED (enables simple cleanup queries)
  orderItemParts      OrderItemPart[]

  // REMOVED: quantity, sold, soldPrice, soldParentPrice
  // REMOVED: implicit many-to-many with Listing
}
```

Key design decisions:
- **`onDelete: SetNull`** on listing relation -- if listing deleted, Part becomes unallocated (not deleted)
- **`reservedAt`** -- enables simple cleanup queries: `WHERE status = RESERVED AND reservedAt < NOW() - interval`. Without this, finding stale reservations requires joining through OrderItemPart -> OrderItem -> Order to find creation time
- **One-to-many** (Part -> Listing) is correct cardinality -- a physical item can only back one listing at a time

### Modified: `Listing`

```prisma
model Listing {
  id           String              @id @default(cuid())
  title        String
  description  String              @db.Text
  condition    String
  price        Float
  createdAt    DateTime            @default(now())
  updatedAt    DateTime            @updatedAt
  images       Image[]
  active       Boolean             @default(true)
  listedOnEbay Boolean             @default(false)
  ebayOfferId  String?
  OrderItem    OrderItem[]
  cartItems    CartItem[]

  // NEW relations
  components   ListingComponent[]  // bill of materials (what this listing sells)
  parts        Part[]              // allocated inventory (what physical items back it)
}
```

### Modified: `OrderItem`

```prisma
model OrderItem {
  id             String          @id @default(cuid())
  order          Order           @relation(fields: [orderId], references: [id])
  orderId        String
  listing        Listing         @relation(fields: [listingId], references: [id], onDelete: Cascade)
  listingId      String
  quantity       Int
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  // NEW
  unitPrice      Float?          // snapshot of listing price at time of purchase
  allocatedParts OrderItemPart[] // which specific physical items were sold
}
```

### Stock Calculation

Centralized in `src/server/lib/stock.ts`. Used everywhere stock is needed.

```
stock = min across all ListingComponents of:
  floor(count(Parts WHERE partDetailsId = component.partDetailId
                     AND listingId = this listing
                     AND status = AVAILABLE)
        / component.quantity)
```

Example: Listing "E46 Headlight Pair" (components: 1x LEFT_HL, 1x RIGHT_HL)
- 3 LEFT_HL Parts allocated (AVAILABLE)
- 1 RIGHT_HL Part allocated (AVAILABLE)
- Stock = min(3/1, 1/1) = **1 available**

```typescript
import { type PartStatus } from "@prisma/client";

type StockInput = {
  components: { partDetailId: string; quantity: number }[];
  inventoryParts: { partDetailsId: string; status: PartStatus }[];
};

export function calculateStock(input: StockInput): number {
  if (input.components.length === 0) return 0;
  return Math.min(
    ...input.components.map((component) => {
      const available = input.inventoryParts.filter(
        (p) =>
          p.partDetailsId === component.partDetailId &&
          p.status === "AVAILABLE",
      ).length;
      return Math.floor(available / component.quantity);
    }),
  );
}
```

---

## Schema Migration Strategy

Four phases, additive-first. Each phase is a separate deploy.

### Phase 1: Additive Schema Changes (non-breaking)

Add all new models and fields alongside existing ones. No code changes. No data lost.

1. Add `PartStatus` enum (AVAILABLE, RESERVED, SOLD, RETURNED)
2. Add `ListingComponent` model
3. Add `OrderItemPart` model
4. Add to `Part`: `status PartStatus @default(AVAILABLE)`, `listingId String?` (with `onDelete: SetNull`), `reservedAt DateTime?`
5. Add to `OrderItem`: `unitPrice Float?`, `allocatedParts OrderItemPart[]`
6. Add to `PartDetail`: `listingComponents ListingComponent[]`
7. Keep ALL existing fields and the implicit m2m (`_ListingToPart`) -- removed later

Run: `bunx prisma migrate dev --name add-inventory-restructure-fields`

### Phase 2: Data Migration Script

Standalone script at `scripts/migrate-inventory-schema.ts`. Must be **idempotent** (safe to re-run). Run via `bun run scripts/migrate-inventory-schema.ts`.

#### Step A: Expand Part records with quantity > 1

For each Part where `quantity > 1`, create `quantity - 1` cloned Part records:
- Copy: partDetailsId, donorVin, inventoryLocationId, variant, sold status
- **Clone Image records** (new Image rows pointing to same URLs, new IDs, pointing to new Part)
- Connect clones to the same Listings via the old m2m junction table
- Set original Part's quantity to 1

```
for each Part where quantity > 1:
  existingListings = part.listing (via m2m)
  for i in 1..(quantity - 1):
    clone = create Part with same fields, quantity=1
    connect clone to existingListings via m2m
    clone Image records (new rows, same URLs, FK to clone)
  update original: quantity = 1
```

#### Step B: Create ListingComponent records

For each Listing, examine its Parts (via old m2m). Each unique partDetailsId becomes a ListingComponent with `quantity = 1`.

```
for each Listing:
  uniquePartDetailIds = dedupe(listing.parts.map(p => p.partDetailsId))
  for each partDetailId in uniquePartDetailIds:
    upsert ListingComponent(listingId, partDetailId, quantity=1)
```

Note: Component quantity defaults to 1. For actual bundles that require N of a part type, admin adjusts manually post-migration.

#### Step C: Set Part.listingId (allocate inventory)

For each Part connected to Listings via old m2m:
- If connected to 1 listing: set `listingId = that listing`
- If connected to multiple listings: pick the first **active** listing (or first if none active). Log a warning for manual review.
- If connected to 0 listings: leave listingId null (unallocated inventory)

```
for each Part with m2m listings:
  if listings.length == 1:
    part.listingId = listings[0].id
  else if listings.length > 1:
    pick first active listing (or first if none active)
    part.listingId = chosen.id
    log warning: "Part {id} was on {n} listings, allocated to {chosen.id}"
  // 0 listings: leave null
```

#### Step D: Migrate Part.sold -> status

```
for each Part:
  if part.sold == true:
    part.status = SOLD
  else:
    part.status = AVAILABLE
```

#### Step E: Best-effort historical order linking

For each OrderItem with no allocatedParts:
- Find SOLD Parts allocated to that OrderItem's listing
- Create OrderItemPart records linking them
- Set OrderItem.unitPrice = listing.price

This is best-effort. Log all OrderItems that couldn't be fully linked. Traceability is only guaranteed going forward.

#### Step F: Integrity verification queries

- All Parts have quantity=1
- Every Listing that had parts has at least one ListingComponent
- Every Part with sold=true has status=SOLD
- Log summary: X parts expanded, Y components created, Z order items linked

### Phase 3: Code Migration

All code changes detailed in section below. Deploy after data migration is verified.

During this phase, code reads/writes the NEW fields only. Old fields (quantity, sold, m2m) are still in schema but unused.

### Phase 4: Remove Deprecated Fields

After Phase 3 is stable in production:

1. Drop `Part.quantity`
2. Drop `Part.sold`, `Part.soldPrice`, `Part.soldParentPrice`
3. Drop implicit m2m `_ListingToPart` junction table (remove `listing Listing[]` from old Part model)
4. Make `OrderItem.unitPrice` non-nullable (fill any remaining nulls first)

Run: `bunx prisma migrate dev --name remove-deprecated-inventory-fields`

---

## Code Changes

### Backend: tRPC Routers

#### `src/server/api/routers/checkout.ts`

**`createStripeSession` (~line 492-645):**
- Add pre-checkout stock validation using `calculateStock()` for each listing. Throw `TRPCError(BAD_REQUEST)` if any item has insufficient stock.
- After creating OrderItems, add inventory reservation inside a `prisma.$transaction`:
  - For each OrderItem + each ListingComponent of the listing:
    - Find `component.quantity * orderItem.quantity` Parts matching (partDetailsId, listingId, status=AVAILABLE), ordered by `createdAt ASC` (FIFO)
    - Set those Parts to `status = RESERVED`, `reservedAt = new Date()`
    - Create OrderItemPart records linking them to the OrderItem
  - Set `orderItem.unitPrice = listing.price`
- Pass `expires_at` to Stripe session creation: **30 minutes from now** (prevents 24h inventory lockup on abandoned sessions; research shows 15-30min is industry standard)

#### `src/app/api/checkout/webhook/route.ts`

Currently only handles `checkout.session.completed`. Changes:

- **`checkout.session.completed` handler:** Find RESERVED Parts via OrderItemParts for this order -> set `status = SOLD`, clear `reservedAt`
- **NEW `checkout.session.expired` handler:** Find RESERVED Parts via OrderItemParts for this order -> set `status = AVAILABLE`, clear `reservedAt`. `listingId` stays (item is still allocated to listing, just not reserved for a buyer).
- **Scheduled cleanup** (belt-and-suspenders): cron/scheduled function that finds Parts with `status = RESERVED AND reservedAt < NOW() - 45min` and reverts to AVAILABLE. Catches anything the webhook misses (network failures, Stripe outages).

#### `src/server/xero/createInvoice.ts`

**`createInvoiceFromStripeEvent` (~line 254-287):**
- Replace the existing FIFO quantity-decrement loop with: find RESERVED Parts via OrderItemPart join, mark them SOLD
- This is simpler than current code -- no more manual quantity arithmetic, no more nested update-through-listing pattern

#### `src/server/api/routers/inventory.ts`

- **create**: Remove `quantity` from input schema. Each call = 1 physical item. Add optional `count` param for bulk creation (creates N identical records).
- **update**: Remove `quantity`. Add ability to change `status` and `listingId` (allocation).
- **getAll**: Replace `sold: false` filter with status-based filters. Include allocated listing info.
- **getAllForSelect**: Filter `status: AVAILABLE`. Show allocation status.
- **delete**: Only allow for AVAILABLE parts. Throw if RESERVED or SOLD.

#### `src/server/api/routers/listings.ts`

- **create (~line 80)**: Accept `components: { partDetailId: string, quantity: number }[]` instead of `parts: string[]`. Create ListingComponent records. Auto-allocate matching AVAILABLE+unallocated inventory (FIFO).
- **update (~line 107)**: Sync ListingComponent records (upsert/delete). Re-allocate inventory as needed. Deallocate Parts whose partDetailId is no longer in components.
- **getListing** (public): Replace `parts` include with `components` include for bill-of-materials display + computed stock count.
- **searchListings (~line 465)**: Stock calculation from new model instead of summing `parts.quantity`.
- **getAllAdmin**: Include components and per-component inventory allocation counts.
- **delete**: Parts unallocated automatically via `onDelete: SetNull` on the Part.listingId FK.
- **bulkReduceQuantities (~line 400)**: Replace with new mutation that marks specific Parts as SOLD and creates OrderItemPart records.
- **New: `allocateInventory`** -- admin manually assigns/unassigns Parts to a Listing
- **New: `getStock`** -- returns stock count for a listing using `calculateStock()`

#### `src/server/api/routers/orders.ts`

- **getAllAdmin** (~line 53): Include `orderItem.allocatedParts -> part -> donor, inventoryLocation, partDetails` so admin sees which donor items were sold.
- **getOrderWithItems** (~line 27): Same -- include allocated parts with donor info.

#### `src/server/api/routers/cart.ts`

- **addItem** (~line 72): Validate stock availability using `calculateStock()` before adding to cart. This is UX-only validation (prevents obviously out-of-stock adds); the authoritative check is in `createStripeSession`.
- **getCartShippingData** (~line 161): Use `components -> partDetail` for shipping dimensions instead of old m2m parts. Current "largest part by volume" logic stays but sources from components.

#### `src/server/api/routers/ebay.ts`

- **createListing** (~line 258): Quantity from `calculateStock()`. Part number from first ListingComponent's partDetail.
- **bulkReduceQuantities**: Replace with new mutation that marks specific Parts as SOLD and creates OrderItemPart records.
- **Eager sync**: On inventory status changes for listings with `listedOnEbay = true`, push quantity update to eBay immediately.

### New Shared Utility

#### `src/server/lib/stock.ts`

```typescript
import { type PartStatus } from "@prisma/client";

type StockInput = {
  components: { partDetailId: string; quantity: number }[];
  inventoryParts: { partDetailsId: string; status: PartStatus }[];
};

export function calculateStock(input: StockInput): number {
  if (input.components.length === 0) return 0;
  return Math.min(
    ...input.components.map((component) => {
      const available = input.inventoryParts.filter(
        (p) => p.partDetailsId === component.partDetailId && p.status === "AVAILABLE",
      ).length;
      return Math.floor(available / component.quantity);
    }),
  );
}
```

### Frontend Changes

#### Admin Listing Form (`src/app/admin/listings/_components/listing-form.tsx`)

Major rework:
- Replace Parts multi-select with **Components section**: each row has a PartDetail selector + quantity spinner. Add/remove rows.
- Add **Inventory Allocation section**: shows Parts currently allocated to this listing grouped by component, with donor VIN, location, status. Admin can manually reassign.
- Show computed stock count based on components vs allocated inventory.

#### Admin Listing Columns (`src/app/admin/listings/_components/columns.tsx`)

- Replace `calculateQty` (~line 34) with stock count from API response.
- Show component summary in tooltip.

#### Admin Inventory Form (`src/app/admin/parts/inventory/_components/inventory-form.tsx`)

- Remove `quantity` field.
- Add `status` display (read-only badge for RESERVED/SOLD).
- Add `Allocated To` display showing linked listing.
- Add "Create Multiple" option with count input for bulk creation of identical items.

#### Admin Inventory Columns (`src/app/admin/parts/inventory/_components/columns.tsx`)

- Replace `quantity` column with `status` badge column (color-coded: AVAILABLE/RESERVED/SOLD/RETURNED).
- Add `Allocated To` column with listing title link.

#### Customer Listing Page (`src/app/(public)/listings/[id]/page.tsx`)

- Stock count (~line 52): Replace `parts.reduce(quantity sum)` with API-provided stock from `calculateStock`.
- Parts table (~line 173): Source from `ListingComponent -> PartDetail` instead of individual Part records.

#### Add to Cart Button (`src/app/(public)/listings/[id]/add-to-cart-button.tsx`)

- `maxQuantity` (~line 45): Replace `listing.parts[0]?.quantity` with stock from `calculateStock()`.

#### Admin Order Details (`src/app/admin/orders/_components/order-details-dialog.tsx`)

- Add per-OrderItem section showing allocated Parts: donor VIN, inventory location, part details.

#### Bulk Order Dialog (`src/app/admin/listings/_components/bulk-order-dialog.tsx`)

- Replace `bulkReduceQuantities` call with new mutation that properly marks Parts as SOLD with OrderItemPart records.

---

## Edge Cases

### Race Conditions (two users buy last item)

The reservation logic runs inside `prisma.$transaction`. The `updateMany` with `WHERE status = AVAILABLE` will match for the first transaction and update those Parts. The second transaction will find 0 matching AVAILABLE Parts and throw "Out of stock."

Since `relationMode = "prisma"` means no DB-level locks, there's a small window for a race. Research confirms probability of collision is negligible at this scale. Future: move to `relationMode = "foreignKeys"` to enable `SELECT ... FOR UPDATE` for true row-level locking.

### Stripe Session Expiry

**30-minute expiry** (pass `expires_at` on Stripe session creation). Belt-and-suspenders cleanup:
1. `checkout.session.expired` webhook reverts RESERVED -> AVAILABLE
2. Scheduled job catches anything webhook misses (finds `reservedAt < NOW() - 45min`)

### Bundle Partial Availability

Stock = min across components. If LEFT_HL has 3 available and RIGHT_HL has 0, stock = 0 and listing shows "Out of Stock." Admin dashboard shows per-component availability breakdown to identify bottleneck.

### Returns

Admin action: set `Part.status = RETURNED`. After inspection, admin moves to AVAILABLE. OrderItemPart records remain for audit trail. RETURNED parts don't count toward stock (not AVAILABLE).

### eBay Integration

- eBay listing quantity comes from `calculateStock()`.
- When local inventory changes for a listing with `listedOnEbay = true`, eagerly push quantity update to eBay.
- eBay sales must go through the same allocation path: mark specific Parts as SOLD, create OrderItemPart records.

### Orphaned Parts

`onDelete: SetNull` on Part.listingId ensures listing deletion unallocates parts (doesn't delete them). No manual unallocation step needed before deleting listings.

### Image Cloning During Migration

Step A (expanding quantity) must clone Image records for each new Part. New Image rows point to same URLs but have unique IDs and point to the new Part. The `partNo` and `variant` fields on Image (currently denormalized) should be copied from the source Part.

### Cart Staleness

Stock may change between cart-add and checkout-start. The pre-checkout validation in `createStripeSession` is the authoritative check. Cart-time validation is UX-only (prevents obviously out-of-stock adds).

### Historical Orders

Pre-migration orders won't have full Part linkage. Step E does best-effort. Unlinked orders are logged and acceptable -- traceability only guarantees going forward.

### soldPrice/soldParentPrice Data

These fields are removed in Phase 4. `OrderItem.unitPrice` captures listing price at purchase time. Per-part cost attribution can be derived from existing relationships: `Part.partDetails.costPrice` (part cost) and `Part.donor.cost` (donor vehicle cost). No data migration needed for these fields.

---

## Resolved Questions

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | Reserve at session creation or payment? | **Session creation** | Research unanimous: correct for limited/unique items. Prevents overselling. 30min expiry + cleanup mitigates lockup. |
| 2 | Migrate `relationMode`? | **No, defer** | Significant scope increase. Current approach sufficient for volume. |
| 3 | Bulk creation UX? | **Single form + count field** | Simpler. N identical records from one submission. |
| 4 | `soldPrice` on Part? | **No, remove** | `OrderItem.unitPrice` + derivable cost data is sufficient. |
| 5 | eBay quantity sync? | **Eager** | On every inventory status change. Avoids drift. Simple at this volume. |
| 6 | Historical order linking? | **Best-effort, accept gaps** | Step E links what it can. Log remainder. Full traceability only guaranteed forward. |

## Remaining Unresolved Questions

1. Cleanup: Stripe webhook only, cron only, or both? Both recommended but cron adds infra complexity -- start webhook-only?
2. `RETURNED` flow: admin-only trigger? Auto-create Xero credit note?
3. eBay sales: create Orders locally, or just mark Parts SOLD directly?

---

## Verification

### Data Migration Verification
- Before/after record counts: total Parts should increase by `sum(quantity - 1)` across all expanded records
- Every Part has quantity=1 (pre-Phase 4 removal)
- Every Listing that had parts has at least one ListingComponent
- Every Part with `sold=true` has `status=SOLD`
- Spot-check 10-20 listings manually in admin

### Functional Testing
- Full checkout flow: add to cart -> checkout -> Stripe webhook -> verify Parts marked SOLD, OrderItemParts exist
- eBay order flow: bulk order -> verify Parts marked SOLD
- Admin listing creation: add components, verify inventory auto-allocation
- Admin inventory: create item, allocate to listing, verify stock count
- Stock edge case: buy last item, verify listing shows out of stock
- Stripe session expiry: start checkout, let session expire, verify Parts revert to AVAILABLE
- Return flow: admin marks RETURNED, stock decrements, move to AVAILABLE, stock increments

### Build Verification
- `bun run build` succeeds with no type errors
- All tRPC routes return expected shapes (inferred types update automatically)

---

## Files to Modify

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add PartStatus enum, ListingComponent, OrderItemPart, modify Part/Listing/OrderItem |
| `src/server/lib/stock.ts` | **NEW** -- calculateStock utility |
| `scripts/migrate-inventory-schema.ts` | **NEW** -- idempotent data migration script |
| `src/server/api/routers/checkout.ts` | Pre-checkout validation, reservation logic, 30min Stripe expiry |
| `src/app/api/checkout/webhook/route.ts` | SOLD marking, expired session handler, scheduled cleanup |
| `src/server/xero/createInvoice.ts` | Replace FIFO loop with OrderItemPart-based SOLD marking |
| `src/server/api/routers/inventory.ts` | Remove quantity, status-based CRUD, bulk creation |
| `src/server/api/routers/listings.ts` | Components CRUD, auto-allocation, stock calc, allocateInventory |
| `src/server/api/routers/orders.ts` | Include allocated parts in admin views |
| `src/server/api/routers/cart.ts` | Stock validation, shipping data from components |
| `src/server/api/routers/ebay.ts` | Stock from calculateStock, eager sync |
| `src/app/admin/listings/_components/listing-form.tsx` | Components UI, allocation UI |
| `src/app/admin/listings/_components/columns.tsx` | Stock from API |
| `src/app/admin/listings/_components/bulk-order-dialog.tsx` | New SOLD mutation |
| `src/app/admin/parts/inventory/_components/inventory-form.tsx` | Remove qty, add status/allocation |
| `src/app/admin/parts/inventory/_components/columns.tsx` | Status badge, allocation column |
| `src/app/(public)/listings/[id]/page.tsx` | Stock + parts table from components |
| `src/app/(public)/listings/[id]/add-to-cart-button.tsx` | maxQuantity from calculateStock |
| `src/app/admin/orders/_components/order-details-dialog.tsx` | Show allocated parts per order item |

---

## Research Sources

- [Odoo Product Tracking / Quant Architecture](https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/product_management/product_tracking.html)
- [ERPNext Stock Ledger Entry / Perpetual Inventory](https://docs.erpnext.com/docs/v13/user/manual/en/stock/perpetual-inventory)
- [CockroachDB Inventory Reference Architecture](https://www.cockroachlabs.com/blog/inventory-management-reference-architecture/)
- [Vertabelo Flexible BOM Designs](https://vertabelo.com/blog/flexible-and-manageable-bill-of-materials-bom-designs/)
- [MongoDB Shopping Cart Reservation Pattern](https://learnmongodbthehardway.com/schema/shoppingcartreservation/)
- [Shopify Inventory API](https://shopify.dev/docs/api/admin-graphql/latest/objects/InventoryItem)
- [WooCommerce Reserved Stock Pro](https://puri.io/plugin/reserved-stock-pro-for-woocommerce/)
- [Kibo Commerce Reserve Inventory](https://docs.kibocommerce.com/pages/reserve-inventory-in-cart)
- [SAGA Pattern for Inventory Reservation](https://jackynote.medium.com/managing-inventory-reservation-in-saga-pattern-for-e-commerce-systems-e23739fb0107)
- [Prisma Optimistic Concurrency](https://github.com/prisma/prisma/discussions/24993)
