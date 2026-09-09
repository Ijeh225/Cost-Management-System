import { db, containersTable, shipmentsTable, auditLogTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export class ShipmentClientError extends Error {}

export async function assignShipmentClient(containerId: number, branchId: number, userId: number,
  clientId: number | null, clientName: string | null, confirmShipment: boolean) {
  return db.transaction(async tx => {
    const identity = { id: containersTable.id, branchId: containersTable.branchId, shipmentId: containersTable.shipmentId };
    const [visit] = await tx.select(identity).from(containersTable).where(eq(containersTable.id, containerId));
    if (!visit?.shipmentId || visit.branchId !== branchId) throw new ShipmentClientError("Shipment not found");
    const [shipment] = await tx.select().from(shipmentsTable).where(eq(shipmentsTable.id, visit.shipmentId)).for("update");
    const [currentVisit] = await tx.select(identity).from(containersTable).where(eq(containersTable.id, containerId)).for("update");
    if (!shipment || !currentVisit || currentVisit.shipmentId !== shipment.id || shipment.branchId !== branchId) {
      throw new ShipmentClientError("Shipment changed. Refresh and try again.");
    }
    const visits = await tx.select({ id: containersTable.id }).from(containersTable).where(eq(containersTable.shipmentId, shipment.id));
    if (visits.length > 1 && !confirmShipment) throw new ShipmentClientError("This B/L has multiple containers. Confirm changing the client for the whole shipment.");
    const customerName = clientName ?? shipment.customerName;
    if (shipment.clientId === clientId && shipment.customerName === customerName) return visits.length;
    await tx.update(shipmentsTable).set({ clientId, customerName }).where(eq(shipmentsTable.id, shipment.id));
    await tx.update(containersTable).set({ clientId, customerName, updatedAt: new Date() }).where(eq(containersTable.shipmentId, shipment.id));
    await tx.insert(auditLogTable).values(visits.map(visit => ({ containerId: visit.id, branchId, userId,
      action: clientId === null ? "unlink_shipment_client" : "link_shipment_client", section: "basic_info",
      fieldChanged: "clientId", oldValue: shipment.clientId?.toString() ?? null, newValue: clientId?.toString() ?? null,
      reason: `Client assignment for B/L ${shipment.blNumber}` })));
    return visits.length;
  });
}
