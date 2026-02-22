// @ts-nocheck
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { PartStatus, PrismaClient } from "@prisma/client";

// Legacy migration utility for pre-Phase-4 environments only.
// Keep this script for historical reruns before deprecated fields are removed.
type MigrationMode = "dry-run" | "execute";

type MultiListingConflict = {
  partId: string;
  listingIds: string[];
};

type HistoricalLinkConflict = {
  orderItemId: string;
  listingId: string;
  needed: number;
  linked: number;
  reason: string;
};

type VerificationResults = {
  partsWithQuantityNotOne: number;
  listingsWithPartsMissingComponents: number;
  soldStatusMismatch: number;
};

type MigrationCounters = {
  partsWithQuantityGtOne: number;
  nonPositiveQuantityNormalized: number;
  partClonesPlanned: number;
  partClonesCreated: number;
  sourcePartsQuantityNormalized: number;
  listingComponentsPlanned: number;
  listingComponentsCreated: number;
  partsAllocationUpdated: number;
  partsWithMultiListingConflict: number;
  partStatusesUpdated: number;
  orderItemsWithoutAllocatedParts: number;
  orderItemsLinked: number;
  orderItemPartLinksCreated: number;
  orderItemUnitPricesUpdated: number;
};

type MigrationReport = {
  startedAt: string;
  endedAt: string;
  mode: MigrationMode;
  args: string[];
  counters: MigrationCounters;
  warnings: string[];
  nonFatalErrors: string[];
  fatalErrors: string[];
  multiListingConflicts: MultiListingConflict[];
  historicalLinkConflicts: HistoricalLinkConflict[];
  verification: VerificationResults;
};

const MAX_CONFLICT_DETAILS = 500;
const MAX_WARNING_DETAILS = 500;

const prisma = new PrismaClient({
  log: ["error", "warn"],
});

const createInitialCounters = (): MigrationCounters => ({
  partsWithQuantityGtOne: 0,
  nonPositiveQuantityNormalized: 0,
  partClonesPlanned: 0,
  partClonesCreated: 0,
  sourcePartsQuantityNormalized: 0,
  listingComponentsPlanned: 0,
  listingComponentsCreated: 0,
  partsAllocationUpdated: 0,
  partsWithMultiListingConflict: 0,
  partStatusesUpdated: 0,
  orderItemsWithoutAllocatedParts: 0,
  orderItemsLinked: 0,
  orderItemPartLinksCreated: 0,
  orderItemUnitPricesUpdated: 0,
});

const createInitialVerification = (): VerificationResults => ({
  partsWithQuantityNotOne: 0,
  listingsWithPartsMissingComponents: 0,
  soldStatusMismatch: 0,
});

const printUsage = () => {
  console.log("Inventory migration script");
  console.log("");
  console.log("Usage:");
  console.log("  bun run scripts/migrate-inventory-schema.ts            # dry run");
  console.log(
    "  bun run scripts/migrate-inventory-schema.ts --execute  # write changes",
  );
  console.log("");
  console.log("Flags:");
  console.log("  --execute     Apply writes to database");
  console.log("  --help        Show this help");
};

const getModeFromArgs = (args: string[]): MigrationMode => {
  const argSet = new Set(args);
  return argSet.has("--execute") ? "execute" : "dry-run";
};

const isFatalError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.name.includes("PrismaClientInitializationError") ||
    error.name.includes("PrismaClientRustPanicError") ||
    error.name.includes("PrismaClientUnknownRequestError")
  );
};

const writeReport = async (report: MigrationReport): Promise<string> => {
  const reportDir = path.join(
    process.cwd(),
    "migration-reports",
    "inventory-schema",
  );
  await mkdir(reportDir, { recursive: true });

  const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const filename = `${timestamp}-${report.mode}.json`;
  const reportPath = path.join(reportDir, filename);

  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  return reportPath;
};

const logStep = (label: string, mode: MigrationMode) => {
  console.log(`\n[${mode.toUpperCase()}] ${label}`);
};

const pushMultiListingConflict = (
  report: MigrationReport,
  conflict: MultiListingConflict,
) => {
  if (report.multiListingConflicts.length < MAX_CONFLICT_DETAILS) {
    report.multiListingConflicts.push(conflict);
    return;
  }

  if (
    !report.warnings.includes(
      "Multi-listing conflict detail limit reached; additional rows omitted from report.",
    )
  ) {
    report.warnings.push(
      "Multi-listing conflict detail limit reached; additional rows omitted from report.",
    );
  }
};

const pushHistoricalLinkConflict = (
  report: MigrationReport,
  conflict: HistoricalLinkConflict,
) => {
  if (report.historicalLinkConflicts.length < MAX_CONFLICT_DETAILS) {
    report.historicalLinkConflicts.push(conflict);
    return;
  }

  if (
    !report.warnings.includes(
      "Historical-link conflict detail limit reached; additional rows omitted from report.",
    )
  ) {
    report.warnings.push(
      "Historical-link conflict detail limit reached; additional rows omitted from report.",
    );
  }
};

const pushWarning = (report: MigrationReport, warning: string) => {
  if (report.warnings.length < MAX_WARNING_DETAILS) {
    report.warnings.push(warning);
    return;
  }

  if (
    !report.warnings.includes(
      "Warning detail limit reached; additional warning rows omitted from report.",
    )
  ) {
    report.warnings.push(
      "Warning detail limit reached; additional warning rows omitted from report.",
    );
  }
};

const runStepAExpandParts = async (
  mode: MigrationMode,
  report: MigrationReport,
) => {
  logStep("Step A: Expand Part records where quantity > 1", mode);

  const nonPositiveQuantityCount = await prisma.part.count({
    where: {
      quantity: {
        lte: 0,
      },
    },
  });

  if (nonPositiveQuantityCount > 0) {
    report.counters.nonPositiveQuantityNormalized = nonPositiveQuantityCount;
    pushWarning(
      report,
      `Found ${nonPositiveQuantityCount} parts with quantity <= 0. They will be normalized to quantity=1, sold=true, status=SOLD.`,
    );

    if (mode === "execute") {
      try {
        await prisma.part.updateMany({
          where: {
            quantity: {
              lte: 0,
            },
          },
          data: {
            quantity: 1,
            sold: true,
            status: PartStatus.SOLD,
            reservedAt: null,
          },
        });
      } catch (error) {
        const message = `Step A normalization failed for non-positive quantity parts: ${
          error instanceof Error ? error.message : "Unknown error"
        }`;
        report.nonFatalErrors.push(message);
        console.error(message);
      }
    }
  }

  const existingListingRows = await prisma.listing.findMany({
    select: {
      id: true,
    },
  });
  const existingListingIds = new Set(existingListingRows.map((listing) => listing.id));

  const partsToExpand = await prisma.part.findMany({
    where: {
      quantity: {
        gt: 1,
      },
    },
    select: {
      id: true,
      partDetailsId: true,
      donorVin: true,
      inventoryLocationId: true,
      variant: true,
      sold: true,
      soldPrice: true,
      soldParentPrice: true,
      status: true,
      quantity: true,
      allocatedToListingId: true,
      listing: {
        select: {
          id: true,
        },
      },
      images: {
        select: {
          id: true,
          url: true,
          order: true,
          donorVin: true,
          partNo: true,
          variant: true,
          listingId: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  report.counters.partsWithQuantityGtOne = partsToExpand.length;

  for (const part of partsToExpand) {
    const extraCopies = part.quantity - 1;
    report.counters.partClonesPlanned += extraCopies;

    if (mode === "dry-run") {
      report.counters.sourcePartsQuantityNormalized += 1;
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        const sourceListingIds = [...new Set(part.listing.map((listing) => listing.id))];
        const validListingIds = sourceListingIds.filter((listingId) =>
          existingListingIds.has(listingId),
        );
        const skippedListingIds = sourceListingIds.filter(
          (listingId) => !existingListingIds.has(listingId),
        );

        if (skippedListingIds.length > 0) {
          pushWarning(
            report,
            `Step A part ${part.id} references missing listing IDs in old m2m: ${skippedListingIds.join(", ")}. Missing links were skipped for clones.`,
          );
        }

        const validAllocatedToListingId =
          part.allocatedToListingId && existingListingIds.has(part.allocatedToListingId)
            ? part.allocatedToListingId
            : null;

        if (part.allocatedToListingId && !validAllocatedToListingId) {
          pushWarning(
            report,
            `Step A part ${part.id} had missing allocatedToListingId ${part.allocatedToListingId}; clone allocation was set to null.`,
          );
        }

        for (let i = 0; i < extraCopies; i += 1) {
          const clone = await tx.part.create({
            data: {
              partDetailsId: part.partDetailsId,
              donorVin: part.donorVin,
              inventoryLocationId: part.inventoryLocationId,
              allocatedToListingId: validAllocatedToListingId,
              variant: part.variant,
              sold: part.sold,
              soldPrice: part.soldPrice,
              soldParentPrice: part.soldParentPrice,
              status: part.status,
              quantity: 1,
            },
          });

          for (const listingId of validListingIds) {
            try {
              await tx.part.update({
                where: {
                  id: clone.id,
                },
                data: {
                  listing: {
                    connect: {
                      id: listingId,
                    },
                  },
                },
              });
            } catch (error) {
              pushWarning(
                report,
                `Step A clone ${clone.id} failed to connect old m2m listing ${listingId}: ${
                  error instanceof Error ? error.message : "Unknown error"
                }`,
              );
            }
          }

          if (part.images.length > 0) {
            await tx.image.createMany({
              data: part.images.map((image) => ({
                url: image.url,
                order: image.order,
                partId: clone.id,
                donorVin: image.donorVin ?? part.donorVin ?? null,
                partNo: image.partNo ?? part.partDetailsId,
                variant: image.variant ?? part.variant ?? null,
                listingId:
                  image.listingId && existingListingIds.has(image.listingId)
                    ? image.listingId
                    : null,
              })),
            });
          }

          report.counters.partClonesCreated += 1;
        }

        await tx.part.update({
          where: {
            id: part.id,
          },
          data: {
            quantity: 1,
          },
        });

        report.counters.sourcePartsQuantityNormalized += 1;
      });
    } catch (error) {
      const message = `Step A failed for Part ${part.id}: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
      report.nonFatalErrors.push(message);
      console.error(message);
    }
  }

  if (mode === "dry-run") {
    report.counters.partClonesCreated = report.counters.partClonesPlanned;
  }
};

const runStepBCreateListingComponents = async (
  mode: MigrationMode,
  report: MigrationReport,
) => {
  logStep("Step B: Create ListingComponent records", mode);

  const listings = await prisma.listing.findMany({
    select: {
      id: true,
      parts: {
        select: {
          partDetailsId: true,
        },
      },
    },
  });

  for (const listing of listings) {
    const uniquePartDetailIds = [...new Set(listing.parts.map((part) => part.partDetailsId))];

    if (uniquePartDetailIds.length === 0) {
      continue;
    }

    const existingComponents = await prisma.listingComponent.findMany({
      where: {
        listingId: listing.id,
      },
      select: {
        partDetailId: true,
      },
    });

    const existingPartDetailIds = new Set(
      existingComponents.map((component) => component.partDetailId),
    );

    const toCreate = uniquePartDetailIds.filter(
      (partDetailId) => !existingPartDetailIds.has(partDetailId),
    );

    report.counters.listingComponentsPlanned += toCreate.length;

    if (mode === "dry-run") {
      report.counters.listingComponentsCreated += toCreate.length;
      continue;
    }

    for (const partDetailId of uniquePartDetailIds) {
      try {
        await prisma.listingComponent.upsert({
          where: {
            listingId_partDetailId: {
              listingId: listing.id,
              partDetailId,
            },
          },
          update: {
            quantity: 1,
          },
          create: {
            listing: {
              connect: {
                id: listing.id,
              },
            },
            partDetail: {
              connect: {
                partNo: partDetailId,
              },
            },
            quantity: 1,
          },
        });

        if (!existingPartDetailIds.has(partDetailId)) {
          report.counters.listingComponentsCreated += 1;
        }
      } catch (error) {
        const message = `Step B failed for listing ${listing.id}, partDetail ${partDetailId}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`;
        report.nonFatalErrors.push(message);
        console.error(message);
      }
    }
  }
};

const runStepCSetPartAllocation = async (
  mode: MigrationMode,
  report: MigrationReport,
) => {
  logStep("Step C: Set Part.allocatedToListingId", mode);

  const parts = await prisma.part.findMany({
    select: {
      id: true,
      allocatedToListingId: true,
      listing: {
        select: {
          id: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  for (const part of parts) {
    const listingIds = part.listing.map((listing) => listing.id);
    const targetListingId = listingIds.length === 1 ? listingIds[0] : null;

    if (listingIds.length > 1) {
      report.counters.partsWithMultiListingConflict += 1;
      pushMultiListingConflict(report, {
        partId: part.id,
        listingIds,
      });
    }

    if (part.allocatedToListingId === targetListingId) {
      continue;
    }

    report.counters.partsAllocationUpdated += 1;

    if (mode === "dry-run") {
      continue;
    }

    try {
      await prisma.part.update({
        where: {
          id: part.id,
        },
        data: {
          allocatedToListingId: targetListingId,
        },
      });
    } catch (error) {
      const message = `Step C failed for Part ${part.id}: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
      report.nonFatalErrors.push(message);
      console.error(message);
    }
  }
};

const runStepDMigrateSoldToStatus = async (
  mode: MigrationMode,
  report: MigrationReport,
) => {
  logStep("Step D: Migrate Part.sold to Part.status", mode);

  const soldTrueToUpdate = await prisma.part.count({
    where: {
      sold: true,
      NOT: {
        status: PartStatus.SOLD,
      },
    },
  });

  const soldFalseToUpdate = await prisma.part.count({
    where: {
      sold: false,
      NOT: {
        status: PartStatus.AVAILABLE,
      },
    },
  });

  report.counters.partStatusesUpdated = soldTrueToUpdate + soldFalseToUpdate;

  if (mode === "dry-run") {
    return;
  }

  try {
    if (soldTrueToUpdate > 0) {
      await prisma.part.updateMany({
        where: {
          sold: true,
        },
        data: {
          status: PartStatus.SOLD,
        },
      });
    }

    if (soldFalseToUpdate > 0) {
      await prisma.part.updateMany({
        where: {
          sold: false,
        },
        data: {
          status: PartStatus.AVAILABLE,
        },
      });
    }
  } catch (error) {
    const message = `Step D failed: ${
      error instanceof Error ? error.message : "Unknown error"
    }`;
    report.nonFatalErrors.push(message);
    console.error(message);
  }
};

const runStepEBestEffortHistoricalLinking = async (
  mode: MigrationMode,
  report: MigrationReport,
) => {
  logStep("Step E: Best-effort historical OrderItemPart linking", mode);

  const orderItems = await prisma.orderItem.findMany({
    where: {
      allocatedParts: {
        none: {},
      },
    },
    select: {
      id: true,
      listingId: true,
      quantity: true,
      unitPrice: true,
      createdAt: true,
      listing: {
        select: {
          price: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  report.counters.orderItemsWithoutAllocatedParts = orderItems.length;

  if (orderItems.length === 0) {
    return;
  }

  const listingIds = [...new Set(orderItems.map((orderItem) => orderItem.listingId))];

  const executePoolByListingId = new Map<string, Array<{ id: string; createdAt: Date }>>();
  const dryRunPoolByListingId = new Map<string, number>();

  if (mode === "execute") {
    const candidateParts = await prisma.part.findMany({
      where: {
        status: PartStatus.SOLD,
        allocatedToListingId: {
          in: listingIds,
        },
        orderItemParts: {
          none: {},
        },
      },
      select: {
        id: true,
        allocatedToListingId: true,
        createdAt: true,
      },
      orderBy: [{ allocatedToListingId: "asc" }, { createdAt: "asc" }],
    });

    for (const candidate of candidateParts) {
      if (!candidate.allocatedToListingId) {
        continue;
      }

      const existingPool = executePoolByListingId.get(candidate.allocatedToListingId) ?? [];
      existingPool.push({
        id: candidate.id,
        createdAt: candidate.createdAt,
      });
      executePoolByListingId.set(candidate.allocatedToListingId, existingPool);
    }
  } else {
    // Dry-run simulates Step A + Step C + Step D effects:
    // - quantity expansion becomes per-unit availability
    // - only parts that map to exactly one listing are allocated
    // - sold=true maps to status=SOLD for candidate selection
    const projectedCandidates = await prisma.part.findMany({
      where: {
        sold: true,
        orderItemParts: {
          none: {},
        },
      },
      select: {
        listing: {
          select: {
            id: true,
          },
        },
        quantity: true,
      },
    });

    for (const candidate of projectedCandidates) {
      if (candidate.listing.length !== 1) {
        continue;
      }

      const listingId = candidate.listing[0]?.id;
      if (!listingId) {
        continue;
      }

      const existing = dryRunPoolByListingId.get(listingId) ?? 0;
      dryRunPoolByListingId.set(listingId, existing + candidate.quantity);
    }
  }

  for (const orderItem of orderItems) {
    let linkedCount = 0;
    const picked: Array<{ id: string }> = [];

    if (mode === "execute") {
      const pool = executePoolByListingId.get(orderItem.listingId) ?? [];
      const selected = pool.splice(0, orderItem.quantity);
      linkedCount = selected.length;
      selected.forEach((part) => picked.push({ id: part.id }));
    } else {
      const available = dryRunPoolByListingId.get(orderItem.listingId) ?? 0;
      linkedCount = Math.min(available, orderItem.quantity);
      dryRunPoolByListingId.set(orderItem.listingId, available - linkedCount);
    }

    if (linkedCount < orderItem.quantity) {
      pushHistoricalLinkConflict(report, {
        orderItemId: orderItem.id,
        listingId: orderItem.listingId,
        needed: orderItem.quantity,
        linked: linkedCount,
        reason:
          linkedCount === 0
            ? "No SOLD allocated parts found"
            : "Insufficient SOLD allocated parts found",
      });
    }

    if (linkedCount > 0) {
      report.counters.orderItemsLinked += 1;
      report.counters.orderItemPartLinksCreated += linkedCount;
    }

    if (orderItem.unitPrice !== orderItem.listing.price) {
      report.counters.orderItemUnitPricesUpdated += 1;
    }

    if (mode === "dry-run") {
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        if (linkedCount > 0) {
          await tx.orderItemPart.createMany({
            data: picked.map((part) => ({
              orderItemId: orderItem.id,
              partId: part.id,
            })),
            skipDuplicates: true,
          });
        }

        if (orderItem.unitPrice !== orderItem.listing.price) {
          await tx.orderItem.update({
            where: {
              id: orderItem.id,
            },
            data: {
              unitPrice: orderItem.listing.price,
            },
          });
        }
      });
    } catch (error) {
      const message = `Step E failed for OrderItem ${orderItem.id}: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
      report.nonFatalErrors.push(message);
      console.error(message);
    }
  }
};

const runStepFVerification = async (
  mode: MigrationMode,
  report: MigrationReport,
) => {
  logStep("Step F: Integrity verification queries", mode);

  if (mode === "dry-run") {
    // Dry-run reports projected post-migration invariants, not pre-migration baseline.
    report.verification.partsWithQuantityNotOne = 0;
    report.verification.listingsWithPartsMissingComponents = 0;
    report.verification.soldStatusMismatch = 0;
    return;
  }

  report.verification.partsWithQuantityNotOne = await prisma.part.count({
    where: {
      NOT: {
        quantity: 1,
      },
    },
  });

  report.verification.listingsWithPartsMissingComponents = await prisma.listing.count({
    where: {
      parts: {
        some: {},
      },
      components: {
        none: {},
      },
    },
  });

  report.verification.soldStatusMismatch = await prisma.part.count({
    where: {
      sold: true,
      NOT: {
        status: PartStatus.SOLD,
      },
    },
  });
};

const printSummary = (report: MigrationReport, reportPath: string) => {
  console.log("\n=== Migration Summary ===");
  console.log(`Mode: ${report.mode}`);
  console.log(`Report: ${reportPath}`);
  console.log("");
  console.log(`Parts with quantity > 1: ${report.counters.partsWithQuantityGtOne}`);
  console.log(
    `Non-positive quantity parts normalized: ${report.counters.nonPositiveQuantityNormalized}`,
  );
  console.log(`Part clones planned: ${report.counters.partClonesPlanned}`);
  console.log(`Part clones created: ${report.counters.partClonesCreated}`);
  console.log(
    `Source parts normalized to quantity=1: ${report.counters.sourcePartsQuantityNormalized}`,
  );
  console.log(`ListingComponents planned: ${report.counters.listingComponentsPlanned}`);
  console.log(`ListingComponents created: ${report.counters.listingComponentsCreated}`);
  console.log(`Part allocations updated: ${report.counters.partsAllocationUpdated}`);
  console.log(
    `Multi-listing allocation conflicts: ${report.counters.partsWithMultiListingConflict}`,
  );
  console.log(`Part statuses updated: ${report.counters.partStatusesUpdated}`);
  console.log(
    `OrderItems without allocatedParts: ${report.counters.orderItemsWithoutAllocatedParts}`,
  );
  console.log(`OrderItems linked: ${report.counters.orderItemsLinked}`);
  console.log(`OrderItemPart links created: ${report.counters.orderItemPartLinksCreated}`);
  console.log(`OrderItem.unitPrice updates: ${report.counters.orderItemUnitPricesUpdated}`);
  console.log("");
  console.log(
    `Verification - partsWithQuantityNotOne: ${report.verification.partsWithQuantityNotOne}`,
  );
  console.log(
    `Verification - listingsWithPartsMissingComponents: ${report.verification.listingsWithPartsMissingComponents}`,
  );
  console.log(
    `Verification - soldStatusMismatch: ${report.verification.soldStatusMismatch}`,
  );
  console.log("");
  console.log(`Warnings: ${report.warnings.length}`);
  console.log(`Non-fatal errors: ${report.nonFatalErrors.length}`);
  console.log(`Fatal errors: ${report.fatalErrors.length}`);
};

const hasVerificationFailures = (report: MigrationReport): boolean =>
  report.verification.partsWithQuantityNotOne > 0 ||
  report.verification.listingsWithPartsMissingComponents > 0 ||
  report.verification.soldStatusMismatch > 0;

const main = async () => {
  const args = process.argv.slice(2);
  const argSet = new Set(args);

  if (argSet.has("--help")) {
    printUsage();
    return;
  }

  const mode = getModeFromArgs(args);
  const startedAt = new Date().toISOString();
  const report: MigrationReport = {
    startedAt,
    endedAt: startedAt,
    mode,
    args,
    counters: createInitialCounters(),
    warnings: [],
    nonFatalErrors: [],
    fatalErrors: [],
    multiListingConflicts: [],
    historicalLinkConflicts: [],
    verification: createInitialVerification(),
  };

  console.log(`Starting inventory migration in ${mode} mode`);

  try {
    await prisma.$connect();

    await runStepAExpandParts(mode, report);
    await runStepBCreateListingComponents(mode, report);
    await runStepCSetPartAllocation(mode, report);
    await runStepDMigrateSoldToStatus(mode, report);
    await runStepEBestEffortHistoricalLinking(mode, report);
    await runStepFVerification(mode, report);
  } catch (error) {
    const message = `Fatal migration error: ${
      error instanceof Error ? error.message : "Unknown error"
    }`;
    report.fatalErrors.push(message);
    console.error(message);

    if (isFatalError(error)) {
      process.exitCode = 1;
    } else {
      process.exitCode = 1;
    }
  } finally {
    report.endedAt = new Date().toISOString();
    const reportPath = await writeReport(report);
    printSummary(report, reportPath);

    if (
      mode === "execute" &&
      (report.nonFatalErrors.length > 0 ||
        report.fatalErrors.length > 0 ||
        hasVerificationFailures(report))
    ) {
      process.exitCode = 1;
    }

    await prisma.$disconnect();
  }
};

void main();
