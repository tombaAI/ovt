import { notFound } from "next/navigation";
import { PaymentDetailClient } from "./payment-detail-client";
import { loadPaymentDetail } from "../data";

export default async function PaymentDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const ledgerId = Number(id);

    if (!Number.isInteger(ledgerId) || ledgerId <= 0) notFound();

    const row = await loadPaymentDetail(ledgerId);
    if (!row) notFound();

    return <PaymentDetailClient row={row} />;
}