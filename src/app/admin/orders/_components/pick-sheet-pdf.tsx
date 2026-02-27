"use client";
"use no memo";

import { useState } from "react";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";
import { Button } from "~/components/ui/button";
import { type AdminOrdersItem } from "~/trpc/shared";

const formatter = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  minimumFractionDigits: 2,
});
const formatPrice = (price: number) => formatter.format(price);

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica" },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
    paddingBottom: 15,
  },
  logo: { width: 120, height: 40, objectFit: "contain" },
  companyInfo: { textAlign: "right", fontSize: 8, color: "#6b7280" },
  companyName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
    marginBottom: 3,
    color: "#111827",
  },

  // Title block
  titleBlock: { marginBottom: 20 },
  title: { fontSize: 22, fontFamily: "Helvetica-Bold" },
  orderRef: { fontSize: 11, color: "#6b7280" },

  // Ship To
  shipTo: {
    marginBottom: 20,
    padding: 12,
    backgroundColor: "#f9fafb",
    borderRadius: 4,
  },
  shipToLabel: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#6b7280",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  shipToName: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  shipToText: { fontSize: 10, color: "#374151", marginBottom: 1 },

  // Table
  table: { marginBottom: 20 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  headerText: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#6b7280",
    textTransform: "uppercase",
  },
  cellText: { fontSize: 9 },
  cellTextSmall: { fontSize: 7, color: "#6b7280" },

  // Column widths
  colTitle: { width: "28%" },
  colPart: { width: "14%" },
  colVin: { width: "18%" },
  colLocation: { width: "12%" },
  colQty: { width: "7%", textAlign: "center" },
  colPrice: { width: "10.5%", textAlign: "right" },
  colTotal: { width: "10.5%", textAlign: "right" },

  // Totals
  totalsBlock: { alignItems: "flex-end", marginBottom: 30 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    width: 200,
    paddingVertical: 3,
  },
  totalLabel: { fontSize: 10, width: 100, textAlign: "right", paddingRight: 10 },
  totalValue: { fontSize: 10, width: 100, textAlign: "right" },
  totalRowFinal: {
    flexDirection: "row",
    justifyContent: "flex-end",
    width: 200,
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: "#d1d5db",
  },
  totalLabelBold: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    width: 100,
    textAlign: "right",
    paddingRight: 10,
  },
  totalValueBold: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    width: 100,
    textAlign: "right",
  },

  // Footer
  footer: {
    position: "absolute",
    bottom: 40,
    left: 40,
    right: 40,
    textAlign: "center",
    fontSize: 10,
    color: "#6b7280",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 10,
  },
});

function formatAddress(order: AdminOrdersItem): string[] {
  if (order.shippingLine1) {
    const lines = [order.shippingLine1];
    if (order.shippingLine2) lines.push(order.shippingLine2);
    const cityLine = [order.shippingCity, order.shippingState, order.shippingPostcode]
      .filter(Boolean)
      .join(" ");
    if (cityLine) lines.push(cityLine);
    if (order.shippingCountry) lines.push(order.shippingCountry);
    return lines;
  }
  if (order.shippingAddress) return [order.shippingAddress];
  return [];
}

type PickSheetDocumentProps = {
  order: AdminOrdersItem;
  logoSrc: string;
};

function PickSheetDocument({ order, logoSrc }: PickSheetDocumentProps) {
  const orderRef = order.xeroInvoiceRef ?? order.id;
  const date = new Date(order.createdAt).toLocaleDateString("en-AU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const subtotal = order.subtotal;
  const shipping = (order.shipping ?? 0) * 100;
  const total = subtotal + shipping;
  const addressLines = formatAddress(order);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Image src={logoSrc} style={styles.logo} />
          <View style={styles.companyInfo}>
            <Text style={styles.companyName}>Parted Euro</Text>
            <Text>Unit 2/26 Rushdale St, Knoxfield VIC</Text>
            <Text>contact@partedeuro.com.au</Text>
          </View>
        </View>

        {/* Title */}
        <View style={styles.titleBlock}>
          <Text style={styles.title}>PICK SHEET</Text>
          <Text style={styles.orderRef}>
            Order: {orderRef} {"\u2022"} {date}
          </Text>
        </View>

        {/* Ship To */}
        <View style={styles.shipTo}>
          <Text style={styles.shipToLabel}>Ship To</Text>
          <Text style={styles.shipToName}>{order.name}</Text>
          {addressLines.map((line, i) => (
            <Text key={i} style={styles.shipToText}>
              {line}
            </Text>
          ))}
          {order.phoneNumber ? (
            <Text style={styles.shipToText}>{order.phoneNumber}</Text>
          ) : null}
        </View>

        {/* Items Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <View style={styles.colTitle}>
              <Text style={styles.headerText}>Item</Text>
            </View>
            <View style={styles.colPart}>
              <Text style={styles.headerText}>Part #</Text>
            </View>
            <View style={styles.colVin}>
              <Text style={styles.headerText}>Donor VIN</Text>
            </View>
            <View style={styles.colLocation}>
              <Text style={styles.headerText}>Location</Text>
            </View>
            <View style={styles.colQty}>
              <Text style={styles.headerText}>Qty</Text>
            </View>
            <View style={styles.colPrice}>
              <Text style={styles.headerText}>Price</Text>
            </View>
            <View style={styles.colTotal}>
              <Text style={styles.headerText}>Total</Text>
            </View>
          </View>

          {order.orderItems.map((item) => {
            const unitPrice = item.unitPrice ?? item.listing.price;
            const lineTotal = unitPrice * item.quantity;
            const partNos = item.allocatedParts
              .map((a) => a.part.partDetails.partNo)
              .join(", ");
            const vins = item.allocatedParts
              .map((a) => a.part.donor?.vin ?? "N/A")
              .join(", ");
            const locations = item.allocatedParts
              .map((a) => a.part.inventoryLocation?.name ?? "N/A")
              .join(", ");

            return (
              <View key={item.id} style={styles.tableRow} wrap={false}>
                <View style={styles.colTitle}>
                  <Text style={styles.cellText}>{item.listing.title}</Text>
                </View>
                <View style={styles.colPart}>
                  <Text style={styles.cellText}>{partNos}</Text>
                </View>
                <View style={styles.colVin}>
                  <Text style={styles.cellTextSmall}>{vins}</Text>
                </View>
                <View style={styles.colLocation}>
                  <Text style={styles.cellText}>{locations}</Text>
                </View>
                <View style={styles.colQty}>
                  <Text style={styles.cellText}>{item.quantity}</Text>
                </View>
                <View style={styles.colPrice}>
                  <Text style={styles.cellText}>{formatPrice(unitPrice)}</Text>
                </View>
                <View style={styles.colTotal}>
                  <Text style={styles.cellText}>{formatPrice(lineTotal)}</Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Totals */}
        <View style={styles.totalsBlock}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{formatPrice(subtotal)}</Text>
          </View>
          {shipping > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Shipping</Text>
              <Text style={styles.totalValue}>{formatPrice(shipping)}</Text>
            </View>
          ) : null}
          <View style={styles.totalRowFinal}>
            <Text style={styles.totalLabelBold}>Total</Text>
            <Text style={styles.totalValueBold}>{formatPrice(total)}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>Thank you for your purchase!</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function downloadPickSheet(order: AdminOrdersItem) {
  const logoSrc = `${window.location.origin}/logo.png`;
  const blob = await pdf(
    <PickSheetDocument order={order} logoSrc={logoSrc} />,
  ).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pick-sheet-${order.xeroInvoiceRef ?? order.id}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export function PickSheetButton({ order }: { order: AdminOrdersItem }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      await downloadPickSheet(order);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleClick} disabled={loading}>
      {loading ? "Generating\u2026" : "Pick Sheet"}
    </Button>
  );
}
