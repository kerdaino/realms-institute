import { Handshake } from "lucide-react";

import { InfoPanel } from "@/components/ui/InfoPanel";

export function PartnerCard({ title }: { title: string }) {
  return <InfoPanel title={title} icon={<Handshake aria-hidden="true" className="size-5" />} />;
}
