import { notFound } from "next/navigation";
import { ContributionDetailClient } from "./contribution-detail-client";
import { loadContributionDetail } from "../data";

export default async function ContributionDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const contribId = Number(id);

    if (!Number.isInteger(contribId) || contribId <= 0) notFound();

    const detail = await loadContributionDetail(contribId);
    if (!detail) notFound();

    return <ContributionDetailClient row={detail.row} period={detail.period} />;
}