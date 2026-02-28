import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";
import { type OrderWithItems } from "~/server/db/order-includes";

type NewOrderEmailProps = {
  order: OrderWithItems;
};

const formatCurrency = (amount: number) =>
  amount.toLocaleString("en-AU", { style: "currency", currency: "AUD" });

export const NewOrderEmail = ({ order }: NewOrderEmailProps) => {
  const subtotalDollars = (order.subtotal ?? 0) / 100;
  const shippingDollars = order.shipping ?? 0;
  const totalDollars = subtotalDollars + shippingDollars;
  const orderRef = order.xeroInvoiceId ?? order.id;
  const date = new Date(order.createdAt).toLocaleDateString("en-AU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <Html>
      <Head />
      <Preview>
        Hark! A new commission of {formatCurrency(totalDollars)} hath arrived!
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Img
            src="https://www.partedeuro.com.au/logo.png"
            width="160"
            height="32"
            alt="Parted Euro"
          />

          <Text style={heading}>A Commission Most Fortuitous!</Text>

          <Text style={text}>
            Esteemed Proprietor,
          </Text>

          <Text style={text}>
            It is with the utmost pleasure and considerable satisfaction that I write to
            inform you of a most auspicious occurrence. A distinguished patron by the name
            of <strong>{order.name}</strong> has, upon this very day of{" "}
            <strong>{date}</strong>, seen fit to bestow upon our establishment a commission
            of no trifling consequence.
          </Text>

          <Section style={summaryBox}>
            <Text style={summaryLine}>
              <strong>Order Reference:</strong> {orderRef}
            </Text>
            <Text style={summaryLine}>
              <strong>Patron:</strong> {order.name}
            </Text>
            <Text style={summaryLine}>
              <strong>Sum of Goods:</strong> {formatCurrency(subtotalDollars)}
            </Text>
            {shippingDollars > 0 ? (
              <Text style={summaryLine}>
                <strong>Carriage:</strong> {formatCurrency(shippingDollars)}
              </Text>
            ) : null}
            <Text style={summaryLine}>
              <strong>Grand Total:</strong> {formatCurrency(totalDollars)}
            </Text>
            <Text style={summaryLine}>
              <strong>Articles Ordered:</strong> {order.orderItems.length}
            </Text>
          </Section>

          <Text style={text}>
            The annexed Pick Sheet, dutifully appended to this correspondence, contains the
            full particulars of the items required for fulfilment. I trust you shall attend
            to the matter with your customary diligence and expediency.
          </Text>

          <Link
            style={link}
            href={`https://www.partedeuro.com.au/admin/orders?orderId=${order.id}`}
          >
            View the Order in the Ledger &raquo;
          </Link>

          <Text style={text}>
            Your most humble and obedient servant,
          </Text>
          <Text style={{ ...text, fontStyle: "italic" }}>
            The Automated Clerk of Parted Euro
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export default NewOrderEmail;

const main = {
  backgroundColor: "#faf9f6",
  fontFamily: "Georgia, 'Times New Roman', Times, serif",
};

const container = {
  paddingLeft: "20px",
  paddingRight: "20px",
  paddingTop: "20px",
  paddingBottom: "20px",
  margin: "0 auto",
  maxWidth: "580px",
};

const heading = {
  color: "#2c1810",
  fontFamily: "Georgia, 'Times New Roman', Times, serif",
  fontSize: "22px",
  fontWeight: "bold" as const,
  margin: "30px 0 10px",
  textAlign: "center" as const,
};

const text = {
  color: "#2c1810",
  fontFamily: "Georgia, 'Times New Roman', Times, serif",
  fontSize: "14px",
  lineHeight: "24px",
  margin: "16px 0",
};

const summaryBox = {
  backgroundColor: "#f0ebe3",
  borderLeft: "3px solid #8b7355",
  padding: "16px 20px",
  margin: "20px 0",
  borderRadius: "2px",
};

const summaryLine = {
  color: "#2c1810",
  fontFamily: "Georgia, 'Times New Roman', Times, serif",
  fontSize: "13px",
  lineHeight: "22px",
  margin: "4px 0",
};

const link = {
  color: "#6b4226",
  fontFamily: "Georgia, 'Times New Roman', Times, serif",
  fontSize: "14px",
  textDecoration: "underline",
  display: "inline-block" as const,
  margin: "10px 0",
};
