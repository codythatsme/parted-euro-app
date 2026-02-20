import { Alert, AlertDescription } from "~/components/ui/alert";
import { Separator } from "~/components/ui/separator";
import { AlertTriangle } from "lucide-react";

export default function ReturnsRefunds() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Warranty & Return Policy
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Please review our warranty and return policy carefully
          </p>
        </div>

        <div className="mt-12 space-y-8">
          {/* Intro */}
          <div className="space-y-4">
            <p className="text-lg text-foreground">
              All second-hand items sold by Parted Euro come with a 30-Day
              Warranty as standard unless otherwise outlined. This warranty
              starts from the date on the invoice or from the date of
              collection.
            </p>

            <p className="text-foreground">
              Refunds will not be issued for change of mind, or incorrectly
              purchased items. It is ENTIRELY the buyers responsibility of what
              they are purchasing. If you are unsure about if a part is correct,
              please contact us to ensure you are purchasing the correct part.
            </p>

            <p className="text-foreground">
              Upon request, Parted Euro does offer an extended warranty at an
              additional cost to that of the purchased item. If you are
              interested in this extended warranty, please let us know before
              finalising your purchase of the item(s). This warranty cannot be
              taken out at a later date after the purchase has been finalised,
              and the parts have left the Parted Euro premises.
            </p>
          </div>

          <Separator />

          {/* Second Hand Brake & Hydraulic Items */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">
              Second Hand Brake & Hydraulic Items
            </h2>

            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Parted Euro cannot offer warranty on the functionality and
                performance of ANY Brake, Hydraulic, Electrical Safety (SRS/ABS)
                items. All brake, hydraulic and electrical safety items are sold
                with no warranty, and no option for extended warranty.
              </AlertDescription>
            </Alert>

            <div className="space-y-4 text-muted-foreground">
              <p>
                Parted Euro offers these items for rebuild and/or reconditioning
                only. We cannot test the performance, reliability or longevity of
                these items &ndash; therefore we cannot warrant their lifespan
                and performance. We will try our best to outline transparently
                how it functioned prior to removal and any error codes (if any)
                were present at time of removal. By purchasing any item related
                to Brakes, Hydraulics or Electrical Safety, you are agreeing to
                these terms and conditions.
              </p>
              <p>
                Parted Euro accepts no warranties for these outlined products
                under any circumstance, as the customer has been made fully aware
                of the circumstances & conditions before he/she has committed to
                purchasing the item. If you are unsure if your item falls into
                this category, please contact us to clarify.
              </p>
            </div>
          </div>

          <Separator />

          {/* Freight & Handling */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">
              Freight & Handling
            </h2>

            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="font-medium">
                Parted Euro takes ZERO RESPONSIBILITY for loss or damage of
                parts through freight. It is strongly suggested that freighted
                parts are insured to avoid any potential issues.
              </AlertDescription>
            </Alert>

            <p className="text-muted-foreground">
              We take extreme caution with packaging parts securely and using
              reputable couriers that we know are consistently good &ndash;
              however it is strongly suggested that freighted parts are insured
              to avoid any potential issues. Please contact us if you would like
              to take insurance on freight of any item sent.
            </p>
          </div>

          <Separator />

          {/* Warranty Terms & Conditions */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">
              Warranty Terms & Conditions
            </h2>

            <div className="space-y-4 text-muted-foreground">
              <p>
                Parted Euro warranty is additional to that of Australian Consumer
                Law. The warranty does not affect those rights or remedies,
                except to the extent their application may lawfully be excluded.
                Individual parts listed are subject to stock availability at the
                relevant time, with no further discounts, replacements, change
                overs, or offers to be applied.
              </p>

              <p>
                Parted Euro offer the items to the purchaser, and the purchaser
                agrees to purchase the items pursuant to the terms and conditions
                set out below. The agreed terms and conditions shall be read to
                limit our liability to the full extent permitted under Australian
                Consumer Law.
              </p>

              <p>
                Parted Euro provides no guarantee on items purchased to the
                extent items are defective or not. The purchaser understands they
                are purchasing second hand used items and takes full ownership on
                the condition of these items as displayed for sale by Parted
                Euro. If a warranty claim is made by the purchaser, the
                applicable warranty terms & conditions apply.
              </p>

              <p>
                Parts returned under warranty must be returned complete as sold.
                Any warranty offered is void if parts are altered, dismantled,
                damaged, don&apos;t match the VIN number they were originally
                from, have been sanded or painted, incorrectly installed, or have
                been otherwise tampered with by any person not specifically
                authorized by Parted Euro.
              </p>

              <p>
                Entirely at its discretion, Parted Euro will repair, replace, or
                refund the purchase price of the defective item, in that order of
                preference. In no way is Parted Euro liable to only refund the
                dollar value of an item purchased. No cash refunds will be given.
              </p>

              <p>
                Parted Euro is in no way liable for any labour rates incurred or
                associated with any item it has sold to a customer. This is in
                reference but not limited to installation, removal, damage,
                freight or delivery.
              </p>

              <p>
                If an item has been incorrectly ordered or not required by the
                purchaser due to change of mind or other circumstances, Parted
                Euro is in no way liable to take back the item at the
                purchaser&apos;s request. It is the customers obligation to
                ensure they have correctly understood what they are purchasing,
                and if it is the correct/suitable item for their needs. If Parted
                Euro do choose to take back the item at their full and complete
                discretion, the purchaser agrees to pay 25% of the purchase price
                of the item as a restocking fee. This amount will be deducted
                from the credit amount to be refunded.
              </p>

              <p>
                Parted Euro recommends replacing any/all engine and driveline
                seals. Oil or fluid leaks are not covered under any of the
                provided or offered warranties. All brake and hydraulic systems
                should be completely rebuilt before installation and use.
              </p>

              <p>
                All mechanical components are drained of their oils and fluids in
                our workshop at the time of dismantling. Parted Euro recommends
                all new fluids be added to any/all components requiring fluids.
                Oil and/or any other fluids are not supplied by Parted Euro and
                any damage that may occur for the lack of no oil or fluids will
                not be covered under any of the provided or offered warranties.
              </p>

              <p>
                Many of today&apos;s modern drivetrains require recoding using
                dealership grade software, Parted Euro is not liable for the
                calibration, recoding, testing, updating, of any of these
                components. Parted Euro is in no way responsible for this
                technical procedure or whether the purchaser has the knowledge on
                how or when this needs to be carried out. Warranty also does not
                cover this technical requirement and whether the purchaser can
                carry out the required work. It is the purchaser&apos;s
                responsibility to determine the requirements prior to making any
                purchases. Additionally, to this, any forms of incorrect
                coding/programming to software or hardware purchased which
                resulted in failure of an item, will void all warranties.
              </p>

              <p>
                All parts supplied by Parted Euro are sold with a unique Parted
                Euro identifier in relation to the VIN number of the vehicle they
                were removed from. Warranty is void if the unique identifier has
                been altered, removed or tampered with in any way.
              </p>

              <p>
                In the event Parted Euro denies a warranty claim, such as where
                the purchaser has contributed to the failure, Parted Euro
                reserves the right to recover out of pocket expenses incurred in
                reviewing the claim, such as but not limited to freight fees,
                dismantling fees, inspection costs, third party costs, etc.,
                Parted Euro may also hold onto the item and/or vehicle in
                question until the purchaser pays Parted Euro such out of pocket
                expenses.
              </p>

              <p>
                Relating to any of the offered warranties, warranty does not
                apply to accessories and non-standard inclusions or any item that
                is attached to the engine or gearbox, including but not limited
                to switches, sensors, cables, electronics, belts, hoses, water
                pumps, oil seals, etc.
              </p>

              <p>
                Relating to any of the offered warranties, transmissions,
                differentials and final drive components that have been misused,
                have broken gears, neglected or used in ways inconsistent with
                its intended purpose will not be covered.
              </p>

              <p>
                Electronic components can potentially appear faulty or be damaged
                upon installation due to other external sources, interference, or
                the need to be coded or integrated correctly. This is typically
                the likes of instrument clusters, body control modules and
                various other electrical control modules. It is the
                purchaser&apos;s responsibility to make sure the correct
                procedures have been applied during the installation of these
                items. Parted Euro takes no responsibility for incorrect
                installation procedures that may cause damage to the item
                purchased or any other item; the purchaser agrees to these terms
                by purchasing any electronic related item.
              </p>

              <p>
                Any warranty cover does not extend to damage caused by accident,
                misuse, neglect, natural disaster, act of God, other external
                causes, damage caused by unintended use. Parted Euro holds no
                responsibility for the fitment of incorrect parts. The onus is
                completely on the purchaser to ensure that the parts supplied are
                correct for fitment. Do not install parts that are incorrect or
                not specifically for the intended purpose. Fitting parts to
                unintended purposes will void any warranty that may have been
                purchased.
              </p>

              <p>
                Any extended warranty must be approved by Parted Euro and paid
                for at purchase of the item. No warranty will be offered after an
                item has been purchased and leaves the Parted Euro premises.
                Parted Euro may choose not to offer extended warranty on any item
                or to any purchaser at its own discretion.
              </p>

              <p>
                All other warranty terms stipulated at the time of sale apply,
                verbal and/or non-verbal.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
