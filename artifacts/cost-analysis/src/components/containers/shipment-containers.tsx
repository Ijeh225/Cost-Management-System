import { useGetContainerShipment } from "@workspace/api-client-react";
import { Link } from "wouter";
import { getStatusLabel } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { JobOverviewPanel } from "./job-overview";

export function ShipmentContainers({ containerId }: { containerId: number }) {
  const { data, isPending, isError, refetch } = useGetContainerShipment(containerId);
  return <div className="space-y-4"><JobOverviewPanel containerId={containerId} /><Card>
    <CardHeader><CardTitle className="text-base">Containers on this B/L</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      {isPending && <p role="status">Loading shipment...</p>}
      {isError && <div role="alert">Unable to load shipment. <Button variant="outline" onClick={() => refetch()}>Retry</Button></div>}
      {data && <>
        <p className="text-sm break-words"><strong>{data.blNumber}</strong>: {data.delivered} of {data.total} delivered; {data.completed} jobs closed.</p>
        <p className="text-xs text-muted-foreground">Each container keeps its own owners, dates, documents and charges. Delivery of one does not complete the others.</p>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.containers.map(row => <li key={row.id} className="min-w-0">
            <Link href={`/containers/${row.id}`} aria-current={row.id === containerId ? "page" : undefined}
              className="block rounded-md border p-3 text-sm hover:bg-accent focus-visible:outline focus-visible:outline-2 break-words">
              <span className="font-mono font-semibold">{row.containerNumber}</span>
              <span className="block text-muted-foreground">{row.size} | {getStatusLabel(row.status)} | Visit #{row.id}</span>
            </Link>
          </li>)}
        </ul>
      </>}
    </CardContent>
  </Card></div>;
}
