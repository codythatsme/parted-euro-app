import { type TiptapDoc } from "~/lib/tiptap-schema";

export const defaultContactPage = {
  heading: "Contact Us",
  cardTitle: "Get in Touch",
  address: "Unit 2/26 Rushdale Street, Knoxfield, Victoria Australia",
  mapsUrl:
    "https://maps.google.com/?q=Unit+2/26+Rushdale+Street,+Knoxfield,+Victoria+Australia",
  phoneDisplay: "0431 133 764",
  phoneHref: "tel:+61431133764",
  email: "contact@partedeuro.com.au",
  businessHoursTitle: "Business Hours",
  businessHoursNote: "(Via appointment only)",
  businessHoursLines: ["Monday to Friday"],
};

const para = (text: string): TiptapDoc["content"][number] => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});

const h2 = (text: string): TiptapDoc["content"][number] => ({
  type: "heading",
  attrs: { level: 2 },
  content: [{ type: "text", text }],
});

const callout = (
  variant: "destructive" | "warning",
  text: string,
): TiptapDoc["content"][number] => ({
  type: "callout",
  attrs: { variant },
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

const hr: TiptapDoc["content"][number] = { type: "horizontalRule" };

const warrantyBody: TiptapDoc = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Please review our warranty and return policy carefully.",
          marks: [{ type: "italic" }],
        },
      ],
    },
    para(
      "All second-hand items sold by Parted Euro come with a 30-Day Warranty as standard unless otherwise outlined. This warranty starts from the date on the invoice or from the date of collection.",
    ),
    para(
      "Refunds will not be issued for change of mind, or incorrectly purchased items. It is ENTIRELY the buyers responsibility of what they are purchasing. If you are unsure about if a part is correct, please contact us to ensure you are purchasing the correct part.",
    ),
    para(
      "Upon request, Parted Euro does offer an extended warranty at an additional cost to that of the purchased item. If you are interested in this extended warranty, please let us know before finalising your purchase of the item(s). This warranty cannot be taken out at a later date after the purchase has been finalised, and the parts have left the Parted Euro premises.",
    ),
    hr,
    h2("Second Hand Brake & Hydraulic Items"),
    callout(
      "destructive",
      "Parted Euro cannot offer warranty on the functionality and performance of ANY Brake, Hydraulic, Electrical Safety (SRS/ABS) items. All brake, hydraulic and electrical safety items are sold with no warranty, and no option for extended warranty.",
    ),
    para(
      "Parted Euro offers these items for rebuild and/or reconditioning only. We cannot test the performance, reliability or longevity of these items – therefore we cannot warrant their lifespan and performance. We will try our best to outline transparently how it functioned prior to removal and any error codes (if any) were present at time of removal. By purchasing any item related to Brakes, Hydraulics or Electrical Safety, you are agreeing to these terms and conditions.",
    ),
    para(
      "Parted Euro accepts no warranties for these outlined products under any circumstance, as the customer has been made fully aware of the circumstances & conditions before he/she has committed to purchasing the item. If you are unsure if your item falls into this category, please contact us to clarify.",
    ),
    hr,
    h2("Freight & Handling"),
    callout(
      "warning",
      "Parted Euro takes ZERO RESPONSIBILITY for loss or damage of parts through freight. It is strongly suggested that freighted parts are insured to avoid any potential issues.",
    ),
    para(
      "We take extreme caution with packaging parts securely and using reputable couriers that we know are consistently good – however it is strongly suggested that freighted parts are insured to avoid any potential issues. Please contact us if you would like to take insurance on freight of any item sent.",
    ),
    hr,
    h2("Warranty Terms & Conditions"),
    para(
      "Parted Euro warranty is additional to that of Australian Consumer Law. The warranty does not affect those rights or remedies, except to the extent their application may lawfully be excluded. Individual parts listed are subject to stock availability at the relevant time, with no further discounts, replacements, change overs, or offers to be applied.",
    ),
    para(
      "Parted Euro offer the items to the purchaser, and the purchaser agrees to purchase the items pursuant to the terms and conditions set out below. The agreed terms and conditions shall be read to limit our liability to the full extent permitted under Australian Consumer Law.",
    ),
    para(
      "Parted Euro provides no guarantee on items purchased to the extent items are defective or not. The purchaser understands they are purchasing second hand used items and takes full ownership on the condition of these items as displayed for sale by Parted Euro. If a warranty claim is made by the purchaser, the applicable warranty terms & conditions apply.",
    ),
    para(
      "Parts returned under warranty must be returned complete as sold. Any warranty offered is void if parts are altered, dismantled, damaged, don't match the VIN number they were originally from, have been sanded or painted, incorrectly installed, or have been otherwise tampered with by any person not specifically authorized by Parted Euro.",
    ),
    para(
      "Entirely at its discretion, Parted Euro will repair, replace, or refund the purchase price of the defective item, in that order of preference. In no way is Parted Euro liable to only refund the dollar value of an item purchased. No cash refunds will be given.",
    ),
    para(
      "Parted Euro is in no way liable for any labour rates incurred or associated with any item it has sold to a customer. This is in reference but not limited to installation, removal, damage, freight or delivery.",
    ),
    para(
      "If an item has been incorrectly ordered or not required by the purchaser due to change of mind or other circumstances, Parted Euro is in no way liable to take back the item at the purchaser's request. It is the customers obligation to ensure they have correctly understood what they are purchasing, and if it is the correct/suitable item for their needs. If Parted Euro do choose to take back the item at their full and complete discretion, the purchaser agrees to pay 25% of the purchase price of the item as a restocking fee. This amount will be deducted from the credit amount to be refunded.",
    ),
    para(
      "Parted Euro recommends replacing any/all engine and driveline seals. Oil or fluid leaks are not covered under any of the provided or offered warranties. All brake and hydraulic systems should be completely rebuilt before installation and use.",
    ),
    para(
      "All mechanical components are drained of their oils and fluids in our workshop at the time of dismantling. Parted Euro recommends all new fluids be added to any/all components requiring fluids. Oil and/or any other fluids are not supplied by Parted Euro and any damage that may occur for the lack of no oil or fluids will not be covered under any of the provided or offered warranties.",
    ),
    para(
      "Many of today's modern drivetrains require recoding using dealership grade software, Parted Euro is not liable for the calibration, recoding, testing, updating, of any of these components. Parted Euro is in no way responsible for this technical procedure or whether the purchaser has the knowledge on how or when this needs to be carried out. Warranty also does not cover this technical requirement and whether the purchaser can carry out the required work. It is the purchaser's responsibility to determine the requirements prior to making any purchases. Additionally, to this, any forms of incorrect coding/programming to software or hardware purchased which resulted in failure of an item, will void all warranties.",
    ),
    para(
      "All parts supplied by Parted Euro are sold with a unique Parted Euro identifier in relation to the VIN number of the vehicle they were removed from. Warranty is void if the unique identifier has been altered, removed or tampered with in any way.",
    ),
    para(
      "In the event Parted Euro denies a warranty claim, such as where the purchaser has contributed to the failure, Parted Euro reserves the right to recover out of pocket expenses incurred in reviewing the claim, such as but not limited to freight fees, dismantling fees, inspection costs, third party costs, etc., Parted Euro may also hold onto the item and/or vehicle in question until the purchaser pays Parted Euro such out of pocket expenses.",
    ),
    para(
      "Relating to any of the offered warranties, warranty does not apply to accessories and non-standard inclusions or any item that is attached to the engine or gearbox, including but not limited to switches, sensors, cables, electronics, belts, hoses, water pumps, oil seals, etc.",
    ),
    para(
      "Relating to any of the offered warranties, transmissions, differentials and final drive components that have been misused, have broken gears, neglected or used in ways inconsistent with its intended purpose will not be covered.",
    ),
    para(
      "Electronic components can potentially appear faulty or be damaged upon installation due to other external sources, interference, or the need to be coded or integrated correctly. This is typically the likes of instrument clusters, body control modules and various other electrical control modules. It is the purchaser's responsibility to make sure the correct procedures have been applied during the installation of these items. Parted Euro takes no responsibility for incorrect installation procedures that may cause damage to the item purchased or any other item; the purchaser agrees to these terms by purchasing any electronic related item.",
    ),
    para(
      "Any warranty cover does not extend to damage caused by accident, misuse, neglect, natural disaster, act of God, other external causes, damage caused by unintended use. Parted Euro holds no responsibility for the fitment of incorrect parts. The onus is completely on the purchaser to ensure that the parts supplied are correct for fitment. Do not install parts that are incorrect or not specifically for the intended purpose. Fitting parts to unintended purposes will void any warranty that may have been purchased.",
    ),
    para(
      "Any extended warranty must be approved by Parted Euro and paid for at purchase of the item. No warranty will be offered after an item has been purchased and leaves the Parted Euro premises. Parted Euro may choose not to offer extended warranty on any item or to any purchaser at its own discretion.",
    ),
    para(
      "All other warranty terms stipulated at the time of sale apply, verbal and/or non-verbal.",
    ),
  ],
};

export const defaultWarrantyPage = {
  title: "Warranty & Return Policy",
  body: warrantyBody,
};
